// Valor de visitar a un cliente, calculado por código. Módulo puro.
//
// Pesos acordados con Lautaro el 2026-11-05 (configurables, punto de partida):
//   Recorrido 35 (motor, Etapa 3) · Recuperación 25 · Oportunidad 25 (IA, Etapa 4) · Potencial 15
// Mientras un factor no se calcula, queda en neutro (0,5): no suma ni resta entre clientes.
// Cada factor va de 0 a 1. El peso es la diferencia máxima que ese factor puede hacer entre
// dos clientes, no un premio.

export type Factor = "recorrido" | "recuperacion" | "oportunidad" | "potencial";
export type Pesos = Record<Factor, number>;

export const PESOS_POR_DEFECTO: Pesos = { recorrido: 35, recuperacion: 25, oportunidad: 25, potencial: 15 };
export const NEUTRO = 0.5;

/** Con 3 veces su cadencia sin comprar, la urgencia de recuperarlo ya es la máxima. */
export const TOPE_ATRASO = 3;
/** Cadencia que se supone si el cliente compró un solo día (mediana de la base ≈ 67 días). */
export const CADENCIA_REFERENCIA_DIAS = 60;

const acotar = (x: number) => Math.min(1, Math.max(0, x));

export type DatosCliente = {
  dias_sin_comprar: number | null;
  cadencia_dias: number | null;
  cajas_total: number | null;
  dias_con_compra: number | null;
  primera_compra: string | null;
  ultima_compra: string | null;
};

/**
 * Propuesta, sin acordar: pasados 6 meses sin comprar, recuperarlo es cada vez menos
 * probable. A los 18 meses vale como un cliente casi perdido (0,3) y no baja de ahí.
 */
export const DIAS_EMPIEZA_CAIDA = 180;
export const DIAS_FIN_CAIDA = 540;
export const PISO_CAIDA = 0.3;

/**
 * Recuperación: cuánto más de lo habitual lleva sin comprar.
 * Sube de 0 (dentro de su cadencia) a 1 (3 veces su cadencia) y, si pasaron más de
 * 6 meses, baja de a poco: el mejor momento para recuperarlo ya pasó.
 * Sin compras (prospecto o cliente que nunca compró): no aplica, null.
 */
export function recuperacion(c: Pick<DatosCliente, "dias_sin_comprar" | "cadencia_dias">, cadenciaReferencia = CADENCIA_REFERENCIA_DIAS): number | null {
  if (c.dias_sin_comprar === null || c.dias_sin_comprar === undefined) return null;
  const cadencia = c.cadencia_dias && c.cadencia_dias > 0 ? c.cadencia_dias : cadenciaReferencia;
  const atraso = c.dias_sin_comprar / cadencia;
  const sube = acotar((atraso - 1) / (TOPE_ATRASO - 1));
  const avance = acotar((c.dias_sin_comprar - DIAS_EMPIEZA_CAIDA) / (DIAS_FIN_CAIDA - DIAS_EMPIEZA_CAIDA));
  return sube * (1 - avance * (1 - PISO_CAIDA));
}

/** Cajas por mes y días de compra por mes, en el período en que fue cliente (mínimo un mes). */
export function ritmo(c: Pick<DatosCliente, "cajas_total" | "dias_con_compra" | "primera_compra" | "ultima_compra">) {
  if (!c.primera_compra || !c.ultima_compra) return null;
  const meses = Math.max(1, (Date.parse(c.ultima_compra) - Date.parse(c.primera_compra)) / (30.44 * 86_400_000));
  return { cajasMes: (c.cajas_total ?? 0) / meses, comprasMes: (c.dias_con_compra ?? 0) / meses };
}

/** Posición de un valor dentro de la base, de 0 (el menor) a 1 (el mayor). Resiste valores extremos. */
export function percentil(valor: number, base: number[]): number {
  if (!base.length) return NEUTRO;
  let menores = 0, iguales = 0;
  for (const x of base) {
    if (x < valor) menores++;
    else if (x === valor) iguales++;
  }
  return (menores + iguales / 2) / base.length;
}

export type BasePotencial = { cajasMes: number[]; comprasMes: number[] };

/** Arma la base de comparación una vez por corrida. */
export function basePotencial(clientes: Parameters<typeof ritmo>[0][]): BasePotencial {
  const ritmos = clientes.map(ritmo).filter((r): r is NonNullable<typeof r> => r !== null);
  return { cajasMes: ritmos.map((r) => r.cajasMes), comprasMes: ritmos.map((r) => r.comprasMes) };
}

/**
 * Potencial: cuánto compra y con qué frecuencia, comparado con el resto de la base.
 * Mitad cajas por mes, mitad días de compra por mes. Sin compras: null.
 */
export function potencial(c: Parameters<typeof ritmo>[0], base: BasePotencial): number | null {
  const r = ritmo(c);
  if (!r) return null;
  return 0.5 * percentil(r.cajasMes, base.cajasMes) + 0.5 * percentil(r.comprasMes, base.comprasMes);
}

export type Factores = Partial<Record<Factor, number | null>>;

/**
 * Valor de 0 a 100. Un factor que falta o no aplica queda en neutro.
 * Los pesos se normalizan: si suman distinto de 100, se respetan sus proporciones.
 */
export function valor(factores: Factores, pesos: Pesos = PESOS_POR_DEFECTO): number {
  const total = Object.values(pesos).reduce((s, p) => s + Math.max(0, p), 0);
  if (total <= 0) return 0;
  let suma = 0;
  for (const f of Object.keys(pesos) as Factor[]) {
    const x = factores[f];
    suma += Math.max(0, pesos[f]) * (x === null || x === undefined || !Number.isFinite(x) ? NEUTRO : acotar(x));
  }
  return Math.round((suma / total) * 1000) / 10;
}

/** Frases para el vendedor, escritas por código con los números reales. */
export function explicarValor(c: Pick<DatosCliente, "dias_sin_comprar" | "cadencia_dias">, f: Factores): string[] {
  const frases: string[] = [];
  if (c.dias_sin_comprar === null) {
    frases.push("Todavía no compró.");
  } else if (c.cadencia_dias && c.cadencia_dias > 0) {
    const veces = c.dias_sin_comprar / c.cadencia_dias;
    frases.push(veces > 1.2
      ? `Lleva ${c.dias_sin_comprar} días sin comprar y suele comprar cada ${c.cadencia_dias}.`
      : `Compró hace ${c.dias_sin_comprar} días; está dentro de su ritmo (cada ${c.cadencia_dias}).`);
  } else {
    frases.push(`Compró una sola vez, hace ${c.dias_sin_comprar} días.`);
  }
  if (f.potencial !== null && f.potencial !== undefined) {
    if (f.potencial >= 0.75) frases.push("Está entre los clientes que más compran.");
    else if (f.potencial <= 0.25) frases.push("Compra poco comparado con el resto.");
  }
  return frases;
}
