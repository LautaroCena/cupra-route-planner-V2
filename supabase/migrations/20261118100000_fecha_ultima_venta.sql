-- Fecha de la última venta cargada, para el aviso "hace X días que no se cargan ventas".
-- Desde el 2026-11-17 los estados se miden contra hoy (fecha_corte_datos), así que el aviso
-- de datos atrasados necesita su propia fecha.
CREATE OR REPLACE FUNCTION public.fecha_ultima_venta()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(fecha_emision) FROM public.ventas_cupra WHERE tipo_comprobante = 'venta';
$$;
REVOKE ALL ON FUNCTION public.fecha_ultima_venta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fecha_ultima_venta() TO authenticated, service_role;
