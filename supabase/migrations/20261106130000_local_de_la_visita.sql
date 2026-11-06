-- El motor puede elegir un local que no es el principal (clientes con varios locales).
-- La visita guarda cuál, para que el vendedor vea esa dirección.
ALTER TABLE public.asignaciones_vendedores_clientes
  ADD COLUMN IF NOT EXISTS client_place_id uuid REFERENCES public.client_places(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.guardar_asignaciones(
  p_asignaciones jsonb,
  p_actualizar_cartera boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  vendedor uuid;
  nombre_vendedor text;
  cliente text;
  prospecto text;
  fecha date;
  estado_nuevo public.estado_asignacion;
  asignacion uuid;
  anterior public.asignaciones_vendedores_clientes%ROWTYPE;
  cuenta public.clientes%ROWTYPE;
  total integer := 0;
  orden integer;
  local_visita uuid;
  hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND activo = true AND rol IN ('administrador', 'asignador')
  ) THEN
    RAISE EXCEPTION 'Solo un asignador o administrador activo puede guardar visitas' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_asignaciones) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_asignaciones) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Se requieren entre 1 y 500 asignaciones' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_asignaciones) x
    GROUP BY coalesce('C:' || nullif(x->>'client_id', ''), 'P:' || nullif(x->>'prospecto_place_id', '')),
      coalesce(nullif(x->>'fecha_programada', '')::date, hoy)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Una cuenta no puede aparecer dos veces el mismo día en una ruta' USING ERRCODE = '22023';
  END IF;

  -- Bloqueos por negocio en orden estable: dos asignadores no intercalan
  -- el reemplazo y la inserción. Cualquier error revierte el lote completo.
  FOR item IN SELECT x FROM jsonb_array_elements(p_asignaciones) x
    ORDER BY coalesce('C:' || (x->>'client_id'), 'P:' || (x->>'prospecto_place_id'))
  LOOP
    vendedor := (item->>'vendedor_id')::uuid;
    cliente := nullif(item->>'client_id', '');
    prospecto := nullif(item->>'prospecto_place_id', '');
    fecha := coalesce(nullif(item->>'fecha_programada', '')::date, hoy);
    estado_nuevo := coalesce(nullif(item->>'estado', ''), 'Asignado')::public.estado_asignacion;
    IF (cliente IS NULL) = (prospecto IS NULL) OR vendedor IS NULL OR estado_nuevo = 'Visitado' THEN
      RAISE EXCEPTION 'Asignación inválida: indicá un vendedor y un cliente o prospecto' USING ERRCODE = '22023';
    END IF;
    SELECT nombre INTO nombre_vendedor FROM public.profiles
      WHERE user_id = vendedor AND activo = true AND (rol = 'vendedor' OR perfil_ventas = true);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El vendedor no está activo o no tiene perfil de ventas' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(coalesce('C:' || cliente, 'P:' || prospecto), 0));
    IF prospecto IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.prospectos p WHERE p.place_id = prospecto AND p.client_id IS NULL
        AND p.es_cliente_cupra = false AND coalesce(p.estado_negocio, '') NOT IN ('CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY')
    ) THEN
      RAISE EXCEPTION 'El prospecto dejó de estar disponible; actualizá la selección' USING ERRCODE = '22023';
    END IF;

    orden := nullif(item->>'orden_ruta', '')::integer;
    local_visita := nullif(item->>'client_place_id', '')::uuid;
    IF local_visita IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.client_places cp WHERE cp.id = local_visita AND cp.client_id = cliente
    ) THEN
      RAISE EXCEPTION 'El local elegido no pertenece al cliente' USING ERRCODE = '22023';
    END IF;
    asignacion := nullif(item->>'asignacion_id', '')::uuid;
    IF asignacion IS NOT NULL THEN
      SELECT * INTO anterior FROM public.asignaciones_vendedores_clientes WHERE id = asignacion FOR UPDATE;
      IF NOT FOUND OR anterior.estado = 'Visitado'
        OR anterior.client_id IS DISTINCT FROM cliente OR anterior.prospecto_place_id IS DISTINCT FROM prospecto THEN
        RAISE EXCEPTION 'La visita cambió o ya fue realizada; recargá las asignaciones' USING ERRCODE = '40001';
      END IF;
      fecha := coalesce(nullif(item->>'fecha_programada', '')::date, anterior.fecha_programada,
        (anterior.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date);
      estado_nuevo := anterior.estado;
    ELSE
      -- Reintentar el mismo lote conserva el ID y la fecha de creación.
      SELECT id INTO asignacion FROM public.asignaciones_vendedores_clientes a
      WHERE a.estado <> 'Visitado' AND a.vendedor_id = vendedor
        AND a.client_id IS NOT DISTINCT FROM cliente AND a.prospecto_place_id IS NOT DISTINCT FROM prospecto
        AND coalesce(a.fecha_programada, (a.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) = fecha
      LIMIT 1 FOR UPDATE;
    END IF;

    DELETE FROM public.asignaciones_vendedores_clientes a
    WHERE a.estado <> 'Visitado' AND (asignacion IS NULL OR a.id <> asignacion)
      AND a.client_id IS NOT DISTINCT FROM cliente AND a.prospecto_place_id IS NOT DISTINCT FROM prospecto
      AND coalesce(a.fecha_programada, (a.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) = fecha;
    IF asignacion IS NULL THEN
      INSERT INTO public.asignaciones_vendedores_clientes
        (vendedor_id, client_id, prospecto_place_id, es_prospecto, estado, origen_asignacion, fecha_programada, orden_ruta, client_place_id)
      VALUES (vendedor, cliente, prospecto, prospecto IS NOT NULL, estado_nuevo, 'asignador', fecha, orden, local_visita);
    ELSE
      UPDATE public.asignaciones_vendedores_clientes SET vendedor_id = vendedor,
        fecha_programada = fecha, origen_asignacion = 'asignador', orden_ruta = coalesce(orden, orden_ruta),
        client_place_id = coalesce(local_visita, client_place_id)
      WHERE id = asignacion;
    END IF;

    IF cliente IS NOT NULL THEN
      IF p_actualizar_cartera THEN
        SELECT * INTO STRICT cuenta FROM public.clientes WHERE client_id = cliente FOR UPDATE;
        INSERT INTO public.asignaciones_manuales_audit
          (usuario_id, vendedor_anterior, vendedor_nuevo_id, vendedor_nuevo_nombre, client_id, razon_social)
        SELECT auth.uid(), coalesce(cuenta.vendedor_actual, cuenta.vendedor_principal), vendedor,
          nombre_vendedor, cliente, cuenta.razon_social
        WHERE cuenta.vendedor_actual IS DISTINCT FROM nombre_vendedor;
        UPDATE public.clientes SET vendedor_actual = nombre_vendedor WHERE client_id = cliente;
      END IF;
      UPDATE public.clientes SET last_recommendation_at = now() WHERE client_id = cliente;
    ELSE
      UPDATE public.prospectos SET last_recommendation_at = now() WHERE place_id = prospecto;
    END IF;
    total := total + 1;
  END LOOP;
  RETURN total;
END;
$$;
