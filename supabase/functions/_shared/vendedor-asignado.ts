// Vendedor asignado de un cliente. Decidido con Lautaro el 2026-11-05:
// - Se guarda aparte y una venta no lo cambia: si otro vendedor cubre por un
//   imprevisto, la venta queda a su nombre y el cliente sigue siendo del asignado.
// - Lo cambia un administrador desde la app (o el maestro de clientes).
// - Solo la primera vez que aparece un cliente se deduce de las ventas.
// La misma regla está en SQL, en recompute_client_metrics y en asignar_vendedor_inicial.

/** Meses de ventas que se miran para elegir el asignado inicial. */
export const DIAS_VENTANA_INICIAL = 180;
/** Ventana y mínimo de días de compra para avisar que otro vendedor le viene vendiendo. */
export const DIAS_VENTANA_AVISO = 90;
export const MINIMO_DIAS_AVISO = 2;

export type VentaVendedor = { vendedor: string | null | undefined; fecha: string | null | undefined };

const DIA_MS = 86_400_000;

/** Días distintos de compra por vendedor, desde `desde` (inclusive). Ignora ventas sin vendedor. */
function diasPorVendedor(ventas: VentaVendedor[], desde: number) {
  const dias = new Map<string, { dias: Set<string>; ultima: string }>();
  for (const v of ventas) {
    const vendedor = v.vendedor?.trim();
    if (!vendedor || !v.fecha) continue;
    const fecha = v.fecha.slice(0, 10);
    if (Date.parse(fecha) < desde) continue;
    const d = dias.get(vendedor) || { dias: new Set<string>(), ultima: fecha };
    d.dias.add(fecha);
    if (fecha > d.ultima) d.ultima = fecha;
    dias.set(vendedor, d);
  }
  return dias;
}

function elMasFrecuente(dias: Map<string, { dias: Set<string>; ultima: string }>) {
  let mejor: { vendedor: string; dias: number; ultima: string } | null = null;
  for (const [vendedor, d] of dias) {
    const actual = { vendedor, dias: d.dias.size, ultima: d.ultima };
    if (!mejor || actual.dias > mejor.dias || (actual.dias === mejor.dias && actual.ultima > mejor.ultima)) mejor = actual;
  }
  return mejor;
}

/**
 * Asignado inicial: el que le vendió en más días distintos en los últimos meses de
 * compras del cliente. Empate: el que le vendió más recientemente.
 */
export function vendedorInicial(ventas: VentaVendedor[], ventanaDias = DIAS_VENTANA_INICIAL): string | null {
  const fechas = ventas.filter((v) => v.vendedor?.trim() && v.fecha).map((v) => v.fecha!.slice(0, 10)).sort();
  if (!fechas.length) return null;
  const desde = Date.parse(fechas.at(-1)!) - ventanaDias * DIA_MS;
  return elMasFrecuente(diasPorVendedor(ventas, desde))?.vendedor ?? null;
}

/**
 * Aviso para el administrador: otro vendedor le vende seguido a este cliente.
 * Nunca cambia el asignado; solo lo sugiere.
 */
export function vendedorSugerido(
  ventas: VentaVendedor[],
  asignado: string | null | undefined,
  corte: string,
  ventanaDias = DIAS_VENTANA_AVISO,
  minimoDias = MINIMO_DIAS_AVISO,
): string | null {
  const dias = diasPorVendedor(ventas, Date.parse(corte) - ventanaDias * DIA_MS);
  const otro = elMasFrecuente(new Map([...dias].filter(([v]) => v.toUpperCase() !== (asignado || "").trim().toUpperCase())));
  if (!otro || otro.dias < minimoDias) return null;
  const propios = [...dias].find(([v]) => v.toUpperCase() === (asignado || "").trim().toUpperCase())?.[1].dias.size ?? 0;
  return otro.dias > propios ? otro.vendedor : null;
}
