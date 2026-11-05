-- Las líneas NC de la hoja de ventas se guardaban como venta y sumaban a compras y facturación.
UPDATE public.ventas_cupra
SET tipo_comprobante = 'nota_credito',
    facturacion_ars = -abs(facturacion_ars)
WHERE tipo_comprobante = 'venta'
  AND (upper(btrim(ticket)) LIKE 'NC%' OR upper(btrim(letra)) = 'NC');

SELECT public.recompute_client_metrics();
