// ============================================================
// Reglas de negocio puras (sin I/O) del motor de recomendaciones.
// Todo lo que decide "quién entra" vive acá y tiene tests propios.
// Espejo en el frontend: src/lib/segmentos.ts (mismos umbrales).
// ============================================================

import { type EstadoComercial } from "./estado-comercial.ts";
export { type EstadoComercial, DIAS_ACTIVO, DIAS_INACTIVO, hoyArgentina, diasDesdeUltimaCompra, estadoPorDias } from "./estado-comercial.ts";
export const ESTADOS_COMERCIALES: EstadoComercial[] = ["ACTIVO", "INACTIVO", "PERDIDO", "POTENCIAL"];
const MS_DIA = 24 * 60 * 60 * 1000;

/** Normaliza la lista de estados que llega del frontend (acepta minúsculas y plurales). */
export function parseEstados(raw: unknown): Set<EstadoComercial> {
  const out = new Set<EstadoComercial>();
  if (!Array.isArray(raw)) return out;
  for (const v of raw) {
    const key = String(v || "").trim().toUpperCase().replace(/ES$|S$/, "");
    const alias: Record<string, EstadoComercial> = {
      ACTIVO: "ACTIVO", INACTIVO: "INACTIVO", PERDIDO: "PERDIDO", POTENCIAL: "POTENCIAL", PROSPECTO: "POTENCIAL",
    };
    if (alias[key]) out.add(alias[key]);
  }
  return out;
}

// ------------------------------------------------------------
// Feedback del vendedor → exclusiones
// ------------------------------------------------------------

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Frases que significan "no se vuelve a visitar". */
const EXCLUSION_DEFINITIVA = [
  /cerrado definitiv/,
  /cerro definitiv/,
  /cerrado permanente/,
  /cerro permanente/,
  /cierre definitiv/,
  /no volver/,
  /no trabaja mas/,
  /cambio de rubro/,
  /ya no existe/,
];

/** Un "Cerrado" suelto (ese día estaba cerrado) solo aparta al negocio unos días. */
export const DIAS_EXCLUSION_CERRADO_TEMPORAL = 7;

export interface FeedbackLike {
  feedback?: string | null;
  motivo_no_visita?: string | null;
  created_at?: string | null;
}

/** Frases que vuelven a habilitar un negocio apartado. */
const REACTIVAR = [/reactivar/, /volver a visitar/, /se puede volver/, /reabri/, /abrio de nuevo/, /volvio a abrir/];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * "no volver hasta mayo" o "no volver hasta el 15/5": la fecha desde la que se puede volver.
 * Siempre la próxima después del comentario. Sin fecha reconocible, null.
 */
export function volverDesde(texto: string, comentario: Date): Date | null {
  const t = sinAcentos(texto);
  const hasta = t.match(/hasta (?:el |la |principios de |mediados de |fin(?:es)? de )?(.+)/)?.[1];
  if (!hasta) return null;
  const proxima = (mes: number, dia: number) => {
    const anio = comentario.getUTCFullYear();
    const f = new Date(Date.UTC(anio, mes, dia));
    return f > comentario ? f : new Date(Date.UTC(anio + 1, mes, dia));
  };
  const numerica = hasta.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (numerica) {
    const [dia, mes] = [Number(numerica[1]), Number(numerica[2]) - 1];
    if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null;
    if (numerica[3]) {
      const anio = Number(numerica[3]) < 100 ? 2000 + Number(numerica[3]) : Number(numerica[3]);
      return new Date(Date.UTC(anio, mes, dia));
    }
    return proxima(mes, dia);
  }
  const mes = MESES.findIndex((m) => hasta.startsWith(m));
  return mes >= 0 ? proxima(mes, 1) : null;
}

export type Exclusion = { excluido: boolean; hasta?: string };

/**
 * ¿El último comentario del vendedor aparta a este negocio de la ruta de hoy?
 * Manda solo el más reciente: un "no volver" viejo no pesa si después hubo otra visita
 * o un "reactivar".
 * - "no volver hasta mayo" → apartado hasta esa fecha.
 * - Definitivo ("Cerrado definitivo", "no volver"...) → apartado hasta que alguien comente otra cosa.
 * - "Cerrado" suelto (ese día estaba cerrado) → solo 7 días.
 */
export function exclusionPorFeedback(feedbacks: FeedbackLike[], now: Date = new Date()): Exclusion {
  const ultimo = [...(feedbacks || [])].sort((a, b) =>
    (b.created_at ? Date.parse(b.created_at) : 0) - (a.created_at ? Date.parse(a.created_at) : 0))[0];
  if (!ultimo) return { excluido: false };
  const texto = sinAcentos(`${ultimo.feedback || ""} | ${ultimo.motivo_no_visita || ""}`);
  if (REACTIVAR.some((re) => re.test(texto))) return { excluido: false };
  const fecha = ultimo.created_at ? new Date(ultimo.created_at) : null;
  if (/no volver/.test(texto) && fecha && Number.isFinite(fecha.getTime())) {
    const desde = volverDesde(texto, fecha);
    if (desde) return desde > now ? { excluido: true, hasta: desde.toISOString().slice(0, 10) } : { excluido: false };
  }
  if (EXCLUSION_DEFINITIVA.some((re) => re.test(texto))) return { excluido: true };
  if (/\bcerrad[oa]\b/.test(texto) && fecha && now.getTime() - fecha.getTime() < DIAS_EXCLUSION_CERRADO_TEMPORAL * MS_DIA) {
    return { excluido: true, hasta: new Date(fecha.getTime() + DIAS_EXCLUSION_CERRADO_TEMPORAL * MS_DIA).toISOString().slice(0, 10) };
  }
  return { excluido: false };
}

export function excluidoPorFeedback(feedbacks: FeedbackLike[], now: Date = new Date()): boolean {
  return exclusionPorFeedback(feedbacks, now).excluido;
}

// ------------------------------------------------------------
// Dueño de la cuenta: nombre del Excel → perfil del vendedor
// ------------------------------------------------------------

export function normalizarNombrePersona(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (s: string) => new Set(s.split(" ").filter((t) => t.length > 1));

export interface ResolvedorVendedores {
  resolver(nombre: string | null | undefined): string | null;
}

/**
 * Resuelve el nombre de vendedor que viene en el Excel al user_id del perfil.
 * 1) Coincidencia exacta normalizada ("LEANDRO PEREZ" = "Leandro Pérez").
 * 2) Mismas palabras en otro orden ("PEREZ LEANDRO").
 * 3) Todas las palabras del nombre corto están en el largo ("LEANDRO" → "Leandro Pérez"),
 *    SOLO si hay un único perfil posible.
 * Nunca por "contiene": "MARIANA" no es "ANA".
 */
export function crearResolvedorVendedores(perfiles: { user_id: string; nombre: string | null }[]): ResolvedorVendedores {
  const lista = perfiles
    .filter((p) => p?.user_id && p?.nombre)
    .map((p) => ({ id: p.user_id, key: normalizarNombrePersona(p.nombre), toks: tokens(normalizarNombrePersona(p.nombre)) }))
    .filter((p) => p.key);
  const cache = new Map<string, string | null>();

  const resolver = (nombre: string | null | undefined): string | null => {
    const key = normalizarNombrePersona(nombre);
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;

    let result: string | null = null;
    const exactos = new Set(lista.filter((p) => p.key === key).map((p) => p.id));
    if (exactos.size === 1) result = [...exactos][0];
    else if (exactos.size === 0) {
      const toks = tokens(key);
      const mismosTokens = new Set(lista
        .filter((p) => p.toks.size === toks.size && [...toks].every((t) => p.toks.has(t)))
        .map((p) => p.id));
      if (mismosTokens.size === 1) result = [...mismosTokens][0];
      else if (mismosTokens.size === 0 && toks.size > 0) {
        const contenidos = new Set(lista
          .filter((p) => {
            const [chico, grande] = toks.size <= p.toks.size ? [toks, p.toks] : [p.toks, toks];
            return chico.size > 0 && [...chico].every((t) => grande.has(t));
          })
          .map((p) => p.id));
        if (contenidos.size === 1) result = [...contenidos][0];
      }
    }
    cache.set(key, result);
    return result;
  };
  return { resolver };
}

// ------------------------------------------------------------
// Origen del prospecto
// ------------------------------------------------------------

export type OrigenProspecto = "google" | "excel" | "manual";

/**
 * Origen del prospecto a partir de sus identificadores y metadatos.
 * Ojo: el importador de Excel guarda el place_id de Google cuando logra geocodificar,
 * así que el prefijo no alcanza. Un prospecto SIN datos de reseñas (rating y cantidad
 * vacíos o en cero) no vino de una búsqueda de Google Places: lo cargó el equipo.
 */
export function origenProspecto(p: {
  place_id?: string | null;
  tipo_principal?: string | null;
  total_ratings?: number | null;
  rating?: number | null;
}): OrigenProspecto {
  const id = String(p.place_id || "");
  if (id.startsWith("manual-") || String(p.tipo_principal || "").toLowerCase() === "manual") return "manual";
  if (id.startsWith("excel-")) return "excel";
  const conResenas = Number(p.total_ratings) > 0 || Number(p.rating) > 0;
  return conResenas ? "google" : "excel";
}

// ------------------------------------------------------------
// Rubro
// ------------------------------------------------------------

export { rubroKey, TIPOS_GOOGLE_POR_RUBRO, TIPOS_GOOGLE_DEFAULT, tiposGoogleParaRubros } from "./prospect-categories.ts";
