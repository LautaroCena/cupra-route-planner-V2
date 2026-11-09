-- Una visita nueva reemplaza a las pendientes de días anteriores del mismo negocio.
-- Antes, si una visita de ayer quedaba sin hacer y hoy se volvía a asignar el mismo
-- cliente, el vendedor veía dos tarjetas. Vale para todas las formas de asignar
-- (motor, mapa, asignación manual y la que se agrega el propio vendedor).
-- Las del mismo día ya las resuelve guardar_asignaciones; las de días futuros no se tocan.

CREATE OR REPLACE FUNCTION public.reemplazar_visitas_pendientes_viejas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fecha_nueva date := coalesce(NEW.fecha_programada, (NEW.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date);
BEGIN
  IF NEW.estado = 'Visitado' THEN RETURN NEW; END IF;
  DELETE FROM public.asignaciones_vendedores_clientes a
  WHERE a.id <> NEW.id
    AND a.estado <> 'Visitado'
    AND ((NEW.client_id IS NOT NULL AND a.client_id = NEW.client_id)
      OR (NEW.prospecto_place_id IS NOT NULL AND a.prospecto_place_id = NEW.prospecto_place_id))
    AND coalesce(a.fecha_programada, (a.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) < fecha_nueva;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reemplazar_visitas_pendientes_viejas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS visita_nueva_reemplaza_vieja ON public.asignaciones_vendedores_clientes;
CREATE TRIGGER visita_nueva_reemplaza_vieja
  AFTER INSERT ON public.asignaciones_vendedores_clientes
  FOR EACH ROW EXECUTE FUNCTION public.reemplazar_visitas_pendientes_viejas();
