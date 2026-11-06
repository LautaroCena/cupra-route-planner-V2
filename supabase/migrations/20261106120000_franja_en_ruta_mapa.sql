-- Misma regla que _shared/ruta.ts: hasta 1,5 km del centro, y uno solo puede estar
-- entre 1,5 y 1,6 km (franja). Antes la base rechazaba todo lo que pasaba de 1,5.
CREATE OR REPLACE FUNCTION public.guardar_ruta_mapa(
  p_vendedor_id uuid, p_client_ids text[], p_prospecto_ids text[] DEFAULT '{}', p_zona_key text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  clientes text[] := coalesce(p_client_ids, '{}');
  prospectos text[] := coalesce(p_prospecto_ids, '{}');
  destino text; punto record; fila jsonb; en_franja integer := 0;
  zona public.mapa_zonas_prospectos%ROWTYPE;
  barrio_key text; provincia_key text; provincia_destino text;
  puntos jsonb := '[]'; visitas jsonb := '[]';
  centro_lat double precision := 0; centro_lng double precision := 0;
  lat double precision; lng double precision; distancia double precision;
  hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND activo
    AND rol IN ('administrador','asignador')) THEN
    RAISE EXCEPTION 'Solo un asignador o administrador activo puede guardar rutas' USING ERRCODE='42501';
  END IF;
  IF cardinality(clientes) + cardinality(prospectos) <> 8
    OR EXISTS (SELECT 1 FROM unnest(clientes || prospectos) id WHERE id IS NULL OR trim(id)='')
    OR (SELECT count(DISTINCT id) FROM unnest(clientes) id) <> cardinality(clientes)
    OR (SELECT count(DISTINCT id) FROM unnest(prospectos) id) <> cardinality(prospectos) THEN
    RAISE EXCEPTION 'La ruta debe tener ocho visitas únicas' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=p_vendedor_id AND activo AND (rol='vendedor' OR perfil_ventas)) THEN
    RAISE EXCEPTION 'El vendedor no está activo' USING ERRCODE='22023';
  END IF;
  IF cardinality(clientes)=0 THEN
    SELECT z.* INTO zona FROM public.mapa_zonas_prospectos z WHERE z.zona_key=p_zona_key FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Elegí y buscá un barrio antes de asignar una ruta sólo de prospectos' USING ERRCODE='22023'; END IF;
    centro_lat:=zona.lat; centro_lng:=zona.lng;
    barrio_key:=public.clave_territorio_mapa(zona.barrio);
    provincia_key:=public.clave_territorio_mapa(zona.provincia);
    IF provincia_key IN ('CABA','CAPITAL FEDERAL','CIUDAD AUTONOMA DE BUENOS AIRES') THEN provincia_key:='CABA'; END IF;
  ELSIF p_zona_key IS NOT NULL THEN
    RAISE EXCEPTION 'Una ruta con clientes usa el centro de esos clientes' USING ERRCODE='22023';
  END IF;
  FOR destino IN SELECT 'C:' || id FROM unnest(clientes) id UNION ALL SELECT 'P:' || id FROM unnest(prospectos) id ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(destino,0));
  END LOOP;
  FOR destino IN SELECT id FROM unnest(clientes) id ORDER BY 1 LOOP
    PERFORM 1 FROM public.clientes c WHERE c.client_id=destino AND NOT coalesce(c.excluir_recomendaciones,false) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un cliente ya no está disponible. Recargá la cartera' USING ERRCODE='40001'; END IF;
    SELECT cp.lat::double precision AS lat, cp.long::double precision AS lng INTO punto
      FROM public.client_places cp WHERE cp.client_id=destino
      AND cp.lat BETWEEN -56 AND -21 AND cp.long BETWEEN -74 AND -53
      ORDER BY cp.is_primary DESC NULLS LAST, cp.direccion_verificada DESC, cp.id LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un cliente no tiene una ubicación válida' USING ERRCODE='22023'; END IF;
    centro_lat:=centro_lat+punto.lat; centro_lng:=centro_lng+punto.lng;
    puntos:=puntos || jsonb_build_object('lat',punto.lat,'lng',punto.lng);
    visitas:=visitas || jsonb_build_object('vendedor_id',p_vendedor_id,'client_id',destino);
  END LOOP;
  IF cardinality(clientes)>0 THEN
    centro_lat:=centro_lat/cardinality(clientes); centro_lng:=centro_lng/cardinality(clientes);
  END IF;
  FOR destino IN SELECT id FROM unnest(prospectos) id ORDER BY 1 LOOP
    SELECT p.latitud::double precision AS lat, p.longitud::double precision AS lng, p.barrio, p.ciudad, p.provincia INTO punto
      FROM public.prospectos p WHERE p.place_id=destino AND p.client_id IS NULL AND p.es_cliente_cupra=false
        AND coalesce(p.estado_negocio,'') NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY')
        AND p.latitud BETWEEN -56 AND -21 AND p.longitud BETWEEN -74 AND -53 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un prospecto dejó de estar disponible. Volvé a completar la ruta' USING ERRCODE='40001'; END IF;
    IF cardinality(clientes)=0 THEN
      provincia_destino:=regexp_replace(public.clave_territorio_mapa(punto.provincia),'^PROVINCIA DE ','');
      IF provincia_destino IN ('CABA','CAPITAL FEDERAL','CIUDAD AUTONOMA DE BUENOS AIRES') THEN provincia_destino:='CABA'; END IF;
      IF (provincia_destino<>'' AND provincia_destino<>provincia_key) OR NOT (
        public.clave_territorio_mapa(punto.barrio)=barrio_key OR public.clave_territorio_mapa(punto.barrio) LIKE barrio_key || ' %'
        OR (provincia_key<>'CABA' AND (public.clave_territorio_mapa(punto.ciudad)=barrio_key OR public.clave_territorio_mapa(punto.ciudad) LIKE barrio_key || ' %'))
      ) THEN
        RAISE EXCEPTION 'Un prospecto no pertenece al barrio o localidad elegido. Volvé a completar la ruta' USING ERRCODE='40001';
      END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.asignaciones_vendedores_clientes a WHERE a.prospecto_place_id=destino
      AND (coalesce(a.fecha_programada,(a.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)=hoy
        OR (a.visited_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date=hoy)
      AND (a.vendedor_id<>p_vendedor_id OR a.estado='Visitado')) THEN
      RAISE EXCEPTION 'Un prospecto ya fue asignado o visitado hoy. Volvé a completar la ruta' USING ERRCODE='40001';
    END IF;
    puntos:=puntos || jsonb_build_object('lat',punto.lat,'lng',punto.lng);
    visitas:=visitas || jsonb_build_object('vendedor_id',p_vendedor_id,'prospecto_place_id',destino);
  END LOOP;
  FOR fila IN SELECT value FROM jsonb_array_elements(puntos) LOOP
    lat:=(fila->>'lat')::double precision; lng:=(fila->>'lng')::double precision;
    distancia:=6371 * 2 * asin(sqrt(least(1,
      power(sin(radians(lat-centro_lat)/2),2) + cos(radians(centro_lat))*cos(radians(lat))*power(sin(radians(lng-centro_lng)/2),2))));
    IF distancia > 1.6 THEN
      RAISE EXCEPTION 'Hay destinos fuera del radio máximo de 1,5 km (1,6 km para uno solo)' USING ERRCODE='22023';
    END IF;
    IF distancia > 1.5 THEN en_franja := en_franja + 1; END IF;
    IF en_franja > 1 THEN
      RAISE EXCEPTION 'Solo un destino puede estar entre 1,5 y 1,6 km' USING ERRCODE='22023';
    END IF;
  END LOOP;
  RETURN public.guardar_asignaciones(visitas,false);
END;
$$;
REVOKE ALL ON FUNCTION public.guardar_ruta_mapa(uuid,text[],text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guardar_ruta_mapa(uuid,text[],text[],text) TO authenticated;
