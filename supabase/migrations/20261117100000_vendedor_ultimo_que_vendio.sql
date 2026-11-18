-- Vendedor asignado: siempre el último que le vendió.
--
-- Regla de CUPRA (Carolina, 2026-11-12): "siempre es el último que haya ejecutado la
-- venta, ya que rotan seguido de vendedores". Lautaro lo confirmó el 2026-11-17.
-- Reemplaza la regla de la Etapa 2 (el que más le vendió y no se pisa nunca), y con
-- ella el aviso de "vendedor sugerido", que ya no tiene sentido.
-- La misma regla está en supabase/functions/_shared/vendedor-asignado.ts.

-- Último vendedor: el de la venta más reciente. Si ese día hubo varios, el que cargó
-- más renglones; empate, por nombre.
CREATE OR REPLACE FUNCTION public.ultimo_vendedor(p_client_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT btrim(vendedor)
  FROM public.ventas_cupra
  WHERE client_id = p_client_id AND tipo_comprobante = 'venta'
    AND nullif(btrim(vendedor), '') IS NOT NULL AND fecha_emision IS NOT NULL
  GROUP BY fecha_emision, btrim(vendedor)
  ORDER BY fecha_emision DESC, count(*) DESC, btrim(vendedor)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.ultimo_vendedor(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ultimo_vendedor(text) TO service_role;

CREATE OR REPLACE FUNCTION public.recompute_client_metrics()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer;
  corte date := public.fecha_corte_datos();
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
    dias_desde_ultima_compra = CASE WHEN m.ultima IS NOT NULL THEN GREATEST(0, corte - m.ultima) END,
    -- Mismos cortes que _shared/estado-comercial.ts. La interfaz ya no lee esta columna.
    categoria_recencia = CASE WHEN m.ultima IS NULL THEN 'SIN_COMPRAS'
      WHEN corte - m.ultima <= 30 THEN 'ACTIVO'
      WHEN corte - m.ultima <= 90 THEN 'INACTIVO' ELSE 'PERDIDO' END,
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
    cajas_total = ROUND(m.cajas::numeric, 2),
    dias_con_compra = m.dias_distintos,
    updated_at = now()
  FROM metricas m
  WHERE c.client_id = m.client_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  WITH puntajes AS (
    SELECT c.client_id,
    CASE WHEN total.bruto>0 THEN round(c.monto_total_historico*100/total.bruto,2) ELSE 0 END AS participacion_mercado,
    CASE WHEN total.bruto<=0 THEN 'BAJO' WHEN c.monto_total_historico/total.bruto>=0.1 THEN 'TOP_10' WHEN c.monto_total_historico/total.bruto>=0.05 THEN 'ALTO' WHEN c.monto_total_historico/total.bruto>=0.02 THEN 'MEDIO' ELSE 'BAJO' END AS categoria_volumen,
    CASE WHEN c.cantidad_ordenes=0 THEN 0 WHEN total.bruto<=0 THEN 25 WHEN c.monto_total_historico/total.bruto>=0.1 THEN 100 WHEN c.monto_total_historico/total.bruto>=0.05 THEN 75 WHEN c.monto_total_historico/total.bruto>=0.02 THEN 50 ELSE 25 END AS score_volumen,
    -- Sin la banda vieja de 180 días: los mismos tres estados que el resto de la app.
    CASE WHEN c.ultima_compra IS NULL THEN 0 WHEN c.dias_desde_ultima_compra<=30 THEN 100 WHEN c.dias_desde_ultima_compra<=90 THEN 70 ELSE 10 END AS score_recencia,
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

  -- Asignado: siempre el último que le vendió (regla de CUPRA, confirmada por Carolina
  -- el 2026-11-12). Se recalcula en cada carga. El trigger de auditoría no registra
  -- este recálculo como un cambio manual.
  PERFORM set_config('cupra.recalculo_vendedor', '1', true);
  UPDATE public.clientes c SET vendedor_actual = u.vendedor
  FROM (SELECT cl.client_id, public.ultimo_vendedor(cl.client_id) AS vendedor FROM public.clientes cl) u
  WHERE u.client_id = c.client_id AND u.vendedor IS NOT NULL
    AND c.vendedor_actual IS DISTINCT FROM u.vendedor;
  PERFORM set_config('cupra.recalculo_vendedor', '', true);

  RETURN updated_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auditar_cambio_vendedor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vendedor_actual IS NOT DISTINCT FROM OLD.vendedor_actual THEN RETURN NEW; END IF;
  -- El recálculo de cada carga (último que vendió) no es un cambio manual.
  IF current_setting('cupra.recalculo_vendedor', true) = '1' THEN RETURN NEW; END IF;
  -- guardar_asignaciones ya registra su propio cambio en esta misma transacción.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.asignaciones_manuales_audit a
    WHERE a.client_id = NEW.client_id AND a.created_at = now()
  ) THEN
    INSERT INTO public.asignaciones_manuales_audit
      (usuario_id, vendedor_anterior, vendedor_nuevo_id, vendedor_nuevo_nombre, client_id, razon_social)
    VALUES (auth.uid(), OLD.vendedor_actual,
      (SELECT p.user_id FROM public.profiles p WHERE upper(btrim(p.nombre)) = upper(btrim(NEW.vendedor_actual)) LIMIT 1),
      coalesce(NEW.vendedor_actual, ''), NEW.client_id, NEW.razon_social);
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.vendedor_inicial(text);
UPDATE public.clientes SET vendedor_sugerido = NULL WHERE vendedor_sugerido IS NOT NULL;
COMMENT ON COLUMN public.clientes.vendedor_sugerido IS 'Sin uso desde 2026-11-17: el asignado es siempre el último que vendió.';

SELECT public.recompute_client_metrics();
