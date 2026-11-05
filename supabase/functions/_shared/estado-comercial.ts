/** Criterio único para el motor y la interfaz. Días calendario de Argentina. */
export type EstadoComercial = "ACTIVO" | "INACTIVO" | "PERDIDO" | "POTENCIAL";
export const DIAS_ACTIVO = 30;
export const DIAS_INACTIVO = 90;

export function hoyArgentina(now: Date = new Date()): string {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

let fechaCorte: string | null = null;

/** Fecha de los datos (última venta cargada). Si está fijada, los días se miden contra ella. */
export function fijarFechaCorte(fecha: unknown): void {
  fechaCorte = typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}/.test(fecha) ? fecha.slice(0, 10) : null;
}

export function obtenerFechaCorte(): string | null {
  return fechaCorte;
}

export function fechaReferencia(now: Date = new Date()): string {
  return fechaCorte ?? hoyArgentina(now);
}

export function diasDesdeUltimaCompra(
  c: { ultima_compra?: string | null; dias_desde_ultima_compra?: number | null },
  now: Date = new Date(),
): number | null {
  const fecha = c.ultima_compra?.slice(0, 10);
  if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const ultima = Date.parse(`${fecha}T00:00:00Z`);
    if (Number.isFinite(ultima) && new Date(ultima).toISOString().slice(0, 10) === fecha) {
      return Math.max(0, Math.round((Date.parse(`${fechaReferencia(now)}T00:00:00Z`) - ultima) / 86_400_000));
    }
  }
  const dias = c.dias_desde_ultima_compra;
  // 9999 es el valor histórico usado para "sin compras", no un cliente perdido.
  return typeof dias === "number" && Number.isFinite(dias) && dias >= 0 && dias < 9999 ? dias : null;
}

export function estadoPorDias(dias: number | null): EstadoComercial {
  if (dias === null) return "POTENCIAL";
  if (dias <= DIAS_ACTIVO) return "ACTIVO";
  if (dias <= DIAS_INACTIVO) return "INACTIVO";
  return "PERDIDO";
}
