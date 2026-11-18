-- Los estados y los días sin comprar se miden contra el día de hoy (Argentina).
--
-- Desde el 05/11 se medían contra la última venta cargada, solo para probar con un
-- Excel atrasado. Decidido por Lautaro el 2026-11-17: en uso real un cliente tiene que
-- envejecer aunque no se carguen ventas. El nombre de la función queda igual para no
-- tocar a quienes la llaman (motor, briefing, interfaz y recompute_client_metrics).
CREATE OR REPLACE FUNCTION public.fecha_corte_datos()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
$$;
REVOKE ALL ON FUNCTION public.fecha_corte_datos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fecha_corte_datos() TO authenticated, service_role;

SELECT public.recompute_client_metrics();
