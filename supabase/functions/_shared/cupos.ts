// Cupos por ruta: cuántas visitas de cada tipo lleva cada ruta de 8.
// Decidido por Lautaro el 2026-11-17:
// - Por defecto, sin que nadie escriba nada: 5 activos, 2 inactivos, 1 prospecto.
// - Los perdidos no aparecen por defecto; el asignador los suma si quiere.
// - Los cupos siempre suman 8, nunca más (regla de CUPRA).
// - Si un tipo no alcanza, se completa con prospectos; si ni así alcanza, la ruta
//   sale con menos visitas.
// Lo usan el motor (_shared/seleccion.ts) y el panel del asignador.

export const TIPOS_VISITA = ["ACTIVO", "INACTIVO", "PERDIDO", "POTENCIAL"] as const;
export type TipoVisita = typeof TIPOS_VISITA[number];
export type Cupos = Record<TipoVisita, number>;

export const VISITAS_POR_RUTA = 8;
export const CUPOS_POR_DEFECTO: Cupos = { ACTIVO: 5, INACTIVO: 2, PERDIDO: 0, POTENCIAL: 1 };

/** Nombre en plural para los avisos. */
export const NOMBRE_TIPO: Record<TipoVisita, string> = {
  ACTIVO: "activos", INACTIVO: "inactivos", PERDIDO: "perdidos", POTENCIAL: "prospectos",
};

/** Tipo de visita de un candidato: los prospectos (y los clientes sin compras) son POTENCIAL. */
export function tipoVisita(c: { es_prospecto?: boolean; estado_comercial?: string | null }): TipoVisita {
  if (c.es_prospecto) return "POTENCIAL";
  return (TIPOS_VISITA as readonly string[]).includes(c.estado_comercial || "") ? c.estado_comercial as TipoVisita : "POTENCIAL";
}

/** Cupos válidos: enteros desde 0 que suman exactamente 8. Si no, null. */
export function cuposValidos(x: unknown): Cupos | null {
  if (!x || typeof x !== "object") return null;
  const g = x as Record<string, unknown>;
  const cupos = {} as Cupos;
  for (const t of TIPOS_VISITA) {
    const v = g[t] ?? 0;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > VISITAS_POR_RUTA) return null;
    cupos[t] = v;
  }
  return TIPOS_VISITA.reduce((s, t) => s + cupos[t], 0) === VISITAS_POR_RUTA ? cupos : null;
}
