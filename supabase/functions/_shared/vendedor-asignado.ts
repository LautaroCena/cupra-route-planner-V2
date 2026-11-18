// Vendedor asignado de un cliente: siempre el último que le vendió.
// Regla de CUPRA (Carolina, 2026-11-12), confirmada por Lautaro el 2026-11-17: los
// vendedores rotan seguido, así que la cuenta es de quien hizo la última venta.
// Se recalcula en cada carga. La misma regla está en SQL: ultimo_vendedor y
// recompute_client_metrics.

export type VentaVendedor = { vendedor: string | null | undefined; fecha: string | null | undefined };

/**
 * Último vendedor: el de la venta más reciente. Si ese día le vendieron varios,
 * el que cargó más renglones; empate, por nombre.
 */
export function ultimoVendedor(ventas: VentaVendedor[]): string | null {
  const ultimo = ventas
    .filter((v) => v.vendedor?.trim() && v.fecha)
    .map((v) => v.fecha!.slice(0, 10))
    .sort()
    .at(-1);
  if (!ultimo) return null;
  const renglones = new Map<string, number>();
  for (const v of ventas) {
    const vendedor = v.vendedor?.trim();
    if (vendedor && v.fecha?.slice(0, 10) === ultimo) renglones.set(vendedor, (renglones.get(vendedor) || 0) + 1);
  }
  return [...renglones].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}
