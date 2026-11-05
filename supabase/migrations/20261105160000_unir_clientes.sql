-- Une un cliente duplicado (origen) dentro del cliente correcto (destino).
-- Mueve todo lo que apunta al origen: ventas, visitas, comentarios, asignaciones,
-- locales, recordatorios y cualquier tabla futura con columna client_id. Los nombres,
-- teléfonos y mails del origen quedan en el destino. Al final borra el origen, ya vacío.
--
-- Si algo del origen choca con un dato igual del destino (por ejemplo, la misma venta
-- cargada en los dos), la unión entera se cancela y no se mueve nada: nunca se pierde
-- un dato en silencio. Las únicas excepciones son derivadas y se recalculan:
-- locales en la misma coordenada o dirección, y el resumen de visita en caché.
--
-- Solo la usa el servidor (service_role). Después de unir, correr recompute_client_metrics().
CREATE OR REPLACE FUNCTION public.unir_clientes(p_origen text, p_destino text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origen public.clientes%ROWTYPE;
  v_destino public.clientes%ROWTYPE;
  v_tabla text;
  v_movidas integer;
  v_resultado jsonb := '{}'::jsonb;
  v_nombres text[];
BEGIN
  IF p_origen IS NULL OR p_destino IS NULL OR p_origen = p_destino THEN
    RAISE EXCEPTION 'Origen y destino tienen que ser dos clientes distintos';
  END IF;
  SELECT * INTO v_origen FROM public.clientes WHERE client_id = p_origen FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe el cliente de origen %', p_origen; END IF;
  SELECT * INTO v_destino FROM public.clientes WHERE client_id = p_destino FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe el cliente de destino %', p_destino; END IF;

  -- Derivados: un local repetido o un resumen en caché del origen se descartan.
  DELETE FROM public.client_places o
  WHERE o.client_id = p_origen AND EXISTS (
    SELECT 1 FROM public.client_places d
    WHERE d.client_id = p_destino
      AND ((d.lat = o.lat AND d.long = o.long) OR d.direccion_principal = o.direccion_principal));
  UPDATE public.client_places SET is_primary = false WHERE client_id = p_origen AND is_primary;
  DELETE FROM public.visita_briefings o
  WHERE o.client_id = p_origen AND EXISTS (SELECT 1 FROM public.visita_briefings d WHERE d.client_id = p_destino);

  FOR v_tabla IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'client_id' AND c.data_type = 'text'
      AND t.table_type = 'BASE TABLE' AND c.table_name <> 'clientes'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('UPDATE public.%I SET client_id = $1 WHERE client_id = $2', v_tabla) USING p_destino, p_origen;
    GET DIAGNOSTICS v_movidas = ROW_COUNT;
    IF v_movidas > 0 THEN v_resultado := v_resultado || jsonb_build_object(v_tabla, v_movidas); END IF;
  END LOOP;

  -- Los nombres del origen pasan a ser nombres alternativos del destino.
  SELECT coalesce(array_agg(DISTINCT n), '{}') INTO v_nombres
  FROM unnest(coalesce(v_destino.nombres_alternativos, '{}')
              || ARRAY[v_origen.razon_social, v_origen.fantasia]
              || coalesce(v_origen.nombres_alternativos, '{}')) AS n
  WHERE n IS NOT NULL AND btrim(n) <> ''
    AND upper(btrim(n)) IS DISTINCT FROM upper(btrim(v_destino.razon_social))
    AND upper(btrim(n)) IS DISTINCT FROM upper(btrim(v_destino.fantasia));

  UPDATE public.clientes SET
    nombres_alternativos = v_nombres,
    telefonos = (SELECT array_agg(DISTINCT x) FROM unnest(coalesce(v_destino.telefonos, '{}') || coalesce(v_origen.telefonos, '{}')) x WHERE x IS NOT NULL),
    emails = (SELECT array_agg(DISTINCT x) FROM unnest(coalesce(v_destino.emails, '{}') || coalesce(v_origen.emails, '{}')) x WHERE x IS NOT NULL),
    fantasia = coalesce(v_destino.fantasia, v_origen.fantasia),
    codigo_postal = coalesce(v_destino.codigo_postal, v_origen.codigo_postal),
    excluir_recomendaciones = coalesce(v_destino.excluir_recomendaciones, false) OR coalesce(v_origen.excluir_recomendaciones, false),
    motivo_exclusion = coalesce(v_destino.motivo_exclusion, v_origen.motivo_exclusion)
  WHERE client_id = p_destino;

  DELETE FROM public.clientes WHERE client_id = p_origen;

  RETURN jsonb_build_object('origen', p_origen, 'destino', p_destino, 'movido', v_resultado);
END;
$$;

REVOKE ALL ON FUNCTION public.unir_clientes(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unir_clientes(text, text) TO service_role;
