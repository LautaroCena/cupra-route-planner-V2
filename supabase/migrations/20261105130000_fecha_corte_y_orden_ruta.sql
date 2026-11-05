-- Los estados se miden contra la última venta cargada, no contra hoy: un archivo
-- atrasado no debe dejar a toda la cartera como perdida.
CREATE OR REPLACE FUNCTION public.fecha_corte_datos()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    least(max(fecha_emision) FILTER (WHERE tipo_comprobante = 'venta'), (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
    (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
  )
  FROM public.ventas_cupra;
$$;
REVOKE ALL ON FUNCTION public.fecha_corte_datos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fecha_corte_datos() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recompute_client_metrics()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer;
BEGIN
  WITH ventas AS (
    SELECT
      v.client_id,
      SUM(COALESCE(v.facturacion_ars, 0)) AS bruto,
      SUM(COALESCE(v.cajas, 0)) AS cajas,
      SUM(COALESCE(v.cajas, 0)) FILTER (WHERE v.facturacion_ars IS NOT NULL) AS cajas_ci,
      COUNT(DISTINCT (COALESCE(v.ticket,'') || '|' || COALESCE(v.letra,'') || '|' || COALESCE(v.fecha_emision::text,''))) AS ordenes,
      MIN(v.fecha_emision) AS primera,
      COUNT(DISTINCT (COALESCE(v.ticket,'') || '|' || COALESCE(v.letra,'') || '|' || COALESCE(v.fecha_emision::text,''))) FILTER (WHERE v.facturacion_ars IS NOT NULL) AS ordenes_con_importe,
      MAX(v.fecha_emision) AS ultima,
      COUNT(DISTINCT v.fecha_emision) AS dias_distintos
    FROM public.ventas_cupra v
    WHERE v.client_id IS NOT NULL
      AND v.tipo_comprobante = 'venta'
    GROUP BY v.client_id
  ), notas AS (
    SELECT
      v.client_id,
      SUM(CASE WHEN v.tipo_comprobante = 'nota_credito' THEN ABS(COALESCE(v.facturacion_ars,0)) ELSE 0 END) AS nc_producto,
      SUM(CASE WHEN v.tipo_comprobante = 'nota_credito_concepto' THEN ABS(COALESCE(v.facturacion_ars,0)) ELSE 0 END) AS nc_concepto,
      MAX(v.fecha_emision) FILTER (WHERE v.tipo_comprobante = 'nota_credito') AS fecha_ultima_nc
    FROM public.ventas_cupra v
    WHERE v.client_id IS NOT NULL
      AND v.tipo_comprobante IN ('nota_credito', 'nota_credito_concepto')
    GROUP BY v.client_id
  ), metricas AS (
    SELECT
      base.client_id,
      COALESCE(ventas.bruto, 0) AS bruto,
      COALESCE(ventas.ordenes, 0) AS ordenes,
      COALESCE(ventas.ordenes_con_importe, 0) AS ordenes_con_importe,
      COALESCE(ventas.cajas_ci, 0) AS cajas_ci,
      ventas.primera,
      ventas.ultima,
      COALESCE(ventas.dias_distintos, 0) AS dias_distintos,
      COALESCE(ventas.cajas, 0) AS cajas,
      COALESCE(notas.nc_producto, 0) AS nc_producto,
      COALESCE(notas.nc_concepto, 0) AS nc_concepto,
      notas.fecha_ultima_nc
    FROM public.clientes base
    LEFT JOIN ventas ON ventas.client_id = base.client_id
    LEFT JOIN notas ON notas.client_id = base.client_id
  )
  UPDATE public.clientes c
  SET
    primera_compra = m.primera,
    ultima_compra = m.ultima,
    dias_desde_ultima_compra = CASE WHEN m.ultima IS NOT NULL THEN GREATEST(0, public.fecha_corte_datos() - m.ultima) END,
    categoria_recencia = CASE WHEN m.ultima IS NULL THEN 'SIN_COMPRAS'
      WHEN public.fecha_corte_datos() - m.ultima <= 30 THEN 'ACTIVO'
      WHEN public.fecha_corte_datos() - m.ultima <= 90 THEN 'INACTIVO' ELSE 'PERDIDO' END,
    monto_total_historico = ROUND(m.bruto::numeric, 2),
    monto_total_cupra = ROUND(m.bruto::numeric, 2),
    cantidad_ordenes = m.ordenes,
    ticket_promedio = CASE WHEN m.ordenes_con_importe > 0 THEN ROUND((m.bruto / m.ordenes_con_importe)::numeric, 2) ELSE 0 END,
    precio_promedio_caja = CASE WHEN m.cajas_ci > 0 THEN ROUND((m.bruto / m.cajas_ci)::numeric, 2) ELSE NULL END,
    cadencia_dias = CASE
      WHEN m.dias_distintos >= 2 AND m.primera IS NOT NULL AND m.ultima IS NOT NULL AND m.ultima > m.primera
        THEN GREATEST(1, ROUND(((m.ultima - m.primera)::numeric / (m.dias_distintos - 1)))::integer)
      ELSE NULL
    END,
    monto_nc_producto = ROUND(m.nc_producto::numeric, 2),
    monto_nc_concepto = ROUND(m.nc_concepto::numeric, 2),
    monto_notas_credito = ROUND(m.nc_producto::numeric, 2),
    fecha_ultima_nc = m.fecha_ultima_nc,
    updated_at = now()
  FROM metricas m
  WHERE c.client_id = m.client_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  WITH puntajes AS (
    SELECT c.client_id,
    CASE WHEN total.bruto>0 THEN round(c.monto_total_historico*100/total.bruto,2) ELSE 0 END AS participacion_mercado,
    CASE WHEN total.bruto<=0 THEN 'BAJO' WHEN c.monto_total_historico/total.bruto>=0.1 THEN 'TOP_10' WHEN c.monto_total_historico/total.bruto>=0.05 THEN 'ALTO' WHEN c.monto_total_historico/total.bruto>=0.02 THEN 'MEDIO' ELSE 'BAJO' END AS categoria_volumen,
    CASE WHEN c.cantidad_ordenes=0 THEN 0 WHEN total.bruto<=0 THEN 25 WHEN c.monto_total_historico/total.bruto>=0.1 THEN 100 WHEN c.monto_total_historico/total.bruto>=0.05 THEN 75 WHEN c.monto_total_historico/total.bruto>=0.02 THEN 50 ELSE 25 END AS score_volumen,
    CASE WHEN c.ultima_compra IS NULL THEN 0 WHEN c.dias_desde_ultima_compra<=30 THEN 100 WHEN c.dias_desde_ultima_compra<=90 THEN 70 WHEN c.dias_desde_ultima_compra<=180 THEN 40 ELSE 10 END AS score_recencia,
    CASE WHEN c.dias_desde_ultima_compra<=15 THEN 'NO' ELSE 'SI' END AS requiere_visita
    FROM public.clientes c
    CROSS JOIN (SELECT COALESCE(sum(monto_total_historico),0) bruto FROM public.clientes) total
  )
  UPDATE public.clientes c SET
    participacion_mercado=p.participacion_mercado,
    categoria_volumen=p.categoria_volumen,
    score_volumen=p.score_volumen,
    score_recencia=p.score_recencia,
    requiere_visita=p.requiere_visita,
    score_comercial=round(p.score_volumen*0.4+p.score_recencia*0.6)
  FROM puntajes p
  WHERE c.client_id=p.client_id;
  UPDATE public.clientes c SET vendedor_actual=v.vendedor FROM (
    SELECT DISTINCT ON(client_id) client_id,vendedor FROM public.ventas_cupra
    WHERE tipo_comprobante='venta' AND NULLIF(vendedor,'') IS NOT NULL
    ORDER BY client_id,fecha_emision DESC NULLS LAST,id DESC
  ) v WHERE v.client_id=c.client_id;
  RETURN updated_count;
END;
$function$;

-- El orden del recorrido calculado se guarda para que el vendedor lo vea igual.
ALTER TABLE public.asignaciones_vendedores_clientes ADD COLUMN IF NOT EXISTS orden_ruta integer;

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
        (vendedor_id, client_id, prospecto_place_id, es_prospecto, estado, origen_asignacion, fecha_programada, orden_ruta)
      VALUES (vendedor, cliente, prospecto, prospecto IS NOT NULL, estado_nuevo, 'asignador', fecha, orden);
    ELSE
      UPDATE public.asignaciones_vendedores_clientes SET vendedor_id = vendedor,
        fecha_programada = fecha, origen_asignacion = 'asignador', orden_ruta = coalesce(orden, orden_ruta)
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
