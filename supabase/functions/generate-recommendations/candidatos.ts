// ============================================================
// Candidatos: puntaje y filtros de clientes y prospectos.
// Funciones puras (sin base de datos ni red): se testean con datos armados.
// ============================================================

import { type AnchorPoint, calcularDistanciaKm } from "./geo-hotspot.ts";
import { recuperacion } from "../_shared/valor.ts";
import { factoresProspecto } from "../_shared/prospecto-valor.ts";
import {
  alertaNotaCredito,
  esProspectoComercialmenteValido,
  normalizeBarrio,
  potencialProspecto,
  prioridadEscala100,
  prioridadVisita,
} from "./portfolio-ranking.ts";
import {
  diasDesdeUltimaCompra,
  type EstadoComercial,
  estadoPorDias,
  excluidoPorFeedback,
  pausaPorVisita,
  origenProspecto,
} from "./reglas.ts";

export const MS_DIA = 24 * 60 * 60 * 1000;

export interface RevisitInfo { dueAt: number; source: string; recordatorio?: boolean }

/** Recordatorio que dejó el vendedor al cerrar una visita ("volver en 3 días", con fecha). */
export interface RecordatorioVendedor { fecha_recordatorio: string; created_at: string; nota?: string | null; titulo?: string | null }

/** Días después de la fecha pedida en los que el negocio sube al máximo de Oportunidad. */
export const DIAS_REVISITA_PRIORITARIA = 14;

export interface ScoreOptions {
  /** Todos los locales de cada cliente (client_places), además del principal. */
  localesMap?: Map<string, any[]>;
  /** Días mínimos desde la última asignación (0 = sin pausa). */
  cooldownDays?: number;
  revisitMap?: Map<string, RevisitInfo>;
  /** Precio promedio por caja del canal, para el margen realizado. */
  precioCajaCanal?: number;
  /** Prospectos apartados por "posible cliente existente". */
  posiblesClientes?: Map<string, unknown>;
  /** Hotspots de otros vendedores de la misma corrida. */
  otherAnchors?: AnchorPoint[];
  /** No descartar prospectos que quedan más cerca de otro vendedor (último recurso). */
  ignorarTerritorio?: boolean;
  now?: Date;
}

export interface ScoredCandidate {
  client_id: string;
  identity_key: string;
  razon_social: string;
  es_prospecto: boolean;
  estado_comercial: EstadoComercial;
  score_geo: number;
  score_comercial: number;
  score_rotacion: number;
  score_total: number;
  distancia_km: number;
  lat: number | null;
  long: number | null;
  barrio: string | null;
  direccion: string | null;
  rubro: string | null;
  vendedor_actual: string | null;
  dias_desde_ultima_compra: number | null;
  ticket_promedio: number | null;
  monto_total_historico: number | null;
  feedbacks_recientes: { feedback: string | null; tipo: string | null; fecha: string | null }[];
  tipo_negocio?: string | null;
  rating?: number | null;
  total_ratings?: number | null;
  prioridad_comercial: number;
  cadencia_dias?: number | null;
  alerta_nc?: { ratio: number; fecha: string | null } | null;
  /** Cómo entró a la ruta: base, búsqueda en vivo en Google, o ampliación de último recurso. */
  origen?: "cartera" | "base" | "maps_live";
  fuera_de_zona?: boolean;
  /** Local de la cuenta en el que entró a la ruta (client_places.id). */
  client_place_id?: string | null;
  /** Factores de valor sin recorrido (_shared/valor.ts); el recorrido lo agrega la selección. */
  factores?: { recuperacion: number | null; potencial: number | null; oportunidad?: number | null };
  /** El vendedor pidió volver y la fecha ya llegó: va con Oportunidad al máximo. */
  revisita?: { fecha: string; motivo: string; recordatorio: boolean } | null;
  /** Locales del cliente dentro del alcance. El primero es el principal. */
  locales?: { lat: number; lng: number; place_id?: string | null; direccion?: string | null; barrio?: string | null }[];
}

// ---------------- helpers ----------------

export function isValidCoord(lat: unknown, lng: unknown): boolean {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && a >= -60 && a <= -20 && b >= -80 && b <= -40;
}

function normalizeIdentityText(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Identidad de negocio para no recomendar el mismo lugar dos veces (registros duplicados). */
export function buildIdentityKey(opts: {
  id: string;
  cuit?: string | null;
  nombre?: string | null;
  direccion?: string | null;
  lat?: number | null;
  long?: number | null;
}): string {
  const nombre = normalizeIdentityText(opts.nombre);
  const dir = normalizeIdentityText(opts.direccion).split(" ").slice(0, 4).join(" ");
  // CUIT + dirección: dos sucursales del mismo CUIT son dos visitas distintas.
  const cuit = (opts.cuit || "").replace(/\D/g, "");
  if (cuit.length >= 8) return `cuit:${cuit}|${dir || opts.id}`;
  if (nombre && dir) return `nd:${nombre}|${dir}`;
  if (nombre && opts.lat != null && opts.long != null) return `ng:${nombre}|${opts.lat.toFixed(3)},${opts.long.toFixed(3)}`;
  return `id:${opts.id}`;
}

/** Un candidato por identidad (el de mayor puntaje), sin los ya usados. */
export function dedupeByIdentity(candidates: ScoredCandidate[], usedIdentities: Set<string>): ScoredCandidate[] {
  const best = new Map<string, ScoredCandidate>();
  for (const c of candidates) {
    if (usedIdentities.has(c.identity_key)) continue;
    const prev = best.get(c.identity_key);
    if (!prev || c.score_total > prev.score_total) best.set(c.identity_key, c);
  }
  // Mantiene el orden original del pool (ya viene ordenado por cercanía/prioridad).
  const keep = new Set(best.values());
  return candidates.filter((c) => keep.has(c));
}

// ---------------- feedback → revisita ----------------

/** "volver en 2 semanas", "revisitar en 10 días", "la semana que viene", "mañana"... */
export function parseRevisitDays(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const wantsReturn = /(volver|revisit|re visitar|regresar|pasar de nuevo|volvemos|contactar)/.test(t);
  if (!wantsReturn && !/(en \d+\s*(dia|semana|mes))/.test(t)) return null;

  const num = t.match(/(\d+)\s*(dias?|semanas?|meses?|mes)/);
  if (num) {
    const value = parseInt(num[1], 10);
    if (!Number.isFinite(value) || value <= 0) return null;
    if (num[2].startsWith("dia")) return value;
    if (num[2].startsWith("semana")) return value * 7;
    return value * 30;
  }
  if (/(una semana|la semana que viene|proxima semana|semana proxima)/.test(t)) return 7;
  if (/(quincena|15 dias)/.test(t)) return 15;
  if (/(un mes|el mes que viene|proximo mes|mes proximo)/.test(t)) return 30;
  if (/(manana)/.test(t)) return 1;
  return null;
}

export interface FeedbackExtraccion {
  feedback_id: string;
  revisit_date?: string | null;
  resumen?: string | null;
  confianza?: number | null;
}

const MIN_CONFIANZA_EXTRACCION = 0.5;

/** negocio → fecha mínima de próxima visita según su feedback más reciente. */
export function buildRevisitMap(
  feedbacksMap: Map<string, any[]>,
  extracciones?: Map<string, FeedbackExtraccion>,
  recordatorios?: Map<string, RecordatorioVendedor[]>,
): Map<string, RevisitInfo> {
  const map = new Map<string, RevisitInfo>();
  // El recordatorio con fecha manda sobre lo que se deduce del texto. Deja de valer si
  // después de crearlo hubo otra visita (ya se cumplió).
  for (const [id, lista] of recordatorios ?? []) {
    const ultimaVisita = Math.max(0, ...(feedbacksMap.get(id) || []).map((fb: any) => new Date(fb.created_at).getTime() || 0));
    const vigente = lista
      .filter((r) => Number.isFinite(new Date(r.fecha_recordatorio).getTime()) && new Date(r.created_at).getTime() + 60_000 >= ultimaVisita)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (!vigente) continue;
    const nota = (vigente.nota || vigente.titulo || "").trim();
    map.set(id, { dueAt: new Date(vigente.fecha_recordatorio).getTime(), source: nota ? `Recordatorio del vendedor: ${nota}` : "Recordatorio del vendedor", recordatorio: true });
  }
  for (const [id, feedbacks] of feedbacksMap) {
    if (map.has(id)) continue;
    const fb = feedbacks[0]; // vienen ordenados por fecha desc: vale el más reciente
    if (!fb) continue;
    const base = fb.created_at ? new Date(fb.created_at).getTime() : Date.now();
    let dueAt: number | null = null;
    let source = "";
    const ext = fb.id ? extracciones?.get(fb.id) : undefined;
    if (ext?.revisit_date && Number(ext.confianza ?? 0) >= MIN_CONFIANZA_EXTRACCION) {
      const parsed = new Date(`${ext.revisit_date}T12:00:00Z`).getTime();
      if (Number.isFinite(parsed)) {
        dueAt = parsed;
        source = ext.resumen || `Revisita sugerida por el vendedor (${ext.revisit_date})`;
      }
    }
    if (dueAt === null) {
      const days = parseRevisitDays(fb.feedback) ?? parseRevisitDays(fb.motivo_no_visita);
      if (days === null) continue;
      dueAt = base + days * MS_DIA;
      source = `${fb.feedback || fb.motivo_no_visita} (+${days}d)`;
    }
    map.set(id, { dueAt, source });
  }
  return map;
}

const resumirFeedbacks = (feedbacks: any[]) => feedbacks.slice(0, 2).map((fb: any) => ({
  feedback: fb.feedback ?? null,
  tipo: fb.tipo_interaccion ?? null,
  fecha: fb.created_at?.split("T")[0] ?? null,
}));

const enCooldown = (lastRec: string | null | undefined, cooldownDays: number, now: Date): { bloqueado: boolean; rotacion: number } => {
  if (!lastRec) return { bloqueado: false, rotacion: 100 };
  const daysSince = (now.getTime() - new Date(lastRec).getTime()) / MS_DIA;
  if (cooldownDays > 0 && daysSince < cooldownDays) return { bloqueado: true, rotacion: 0 };
  return { bloqueado: false, rotacion: Math.min(100, Math.max(0, daysSince * 5)) };
};

const penalidadSolapamiento = (lat: number, lng: number, others: AnchorPoint[]): { minDist: number; penalty: number } => {
  if (others.length === 0) return { minDist: Infinity, penalty: 0 };
  const minDist = Math.min(...others.map((a) => calcularDistanciaKm(a.lat, a.lng, lat, lng)));
  return { minDist, penalty: minDist < 0.3 ? -100 : 0 };
};

// ---------------- clientes ----------------

/**
 * Puntúa clientes PROPIOS del vendedor dentro de `radiusKm` del núcleo de la ruta.
 * El estado (activo/inactivo/perdido/potencial) se calcula con la fecha de hoy.
 */
export function scoreClients(
  clientes: any[],
  placesMap: Map<string, any>,
  feedbacksMap: Map<string, any[]>,
  hotspot: AnchorPoint,
  radiusKm: number,
  options: ScoreOptions = {},
): ScoredCandidate[] {
  const now = options.now ?? new Date();
  const out: ScoredCandidate[] = [];
  for (const c of clientes) {
    const place = placesMap.get(c.client_id);
    if (!place || !isValidCoord(place.lat, place.long)) continue;
    const lat = Number(place.lat), long = Number(place.long);
    const distancia_km = calcularDistanciaKm(hotspot.lat, hotspot.lng, lat, long);
    // Todos sus locales: el cliente entra si alguno queda al alcance.
    const locales = [place, ...(options.localesMap?.get(c.client_id) || []).filter((l: any) => l.id !== place.id)]
      .filter((l: any) => isValidCoord(l.lat, l.long))
      .map((l: any) => ({ lat: Number(l.lat), lng: Number(l.long), place_id: l.id ?? null, direccion: l.direccion_principal ?? null, barrio: l.barrio_principal ?? null }))
      .filter((l) => calcularDistanciaKm(hotspot.lat, hotspot.lng, l.lat, l.lng) <= radiusKm);
    if (!locales.length) continue;

    const feedbacks = feedbacksMap.get(c.client_id) || [];
    if (excluidoPorFeedback(feedbacks, now)) continue;

    const revisit = options.revisitMap?.get(c.client_id);
    if (revisit && revisit.dueAt > now.getTime()) continue;
    // Pausa después de una visita con contacto, salvo que el vendedor haya dejado fecha de revisita.
    if (!revisit && pausaPorVisita(feedbacks, false, now).excluido) continue;
    const revisitBonus = revisit ? 30 : 0;
    const revisitaVencida = !!revisit && now.getTime() - revisit.dueAt <= DIAS_REVISITA_PRIORITARIA * MS_DIA;

    const cd = enCooldown(c.last_recommendation_at, options.cooldownDays ?? 0, now);
    if (cd.bloqueado) continue;

    const dias = diasDesdeUltimaCompra(c, now);
    const estado = estadoPorDias(dias);
    const score_geo = Math.max(0, 100 - (distancia_km / Math.max(radiusKm, 0.1)) * 100);
    const score_comercial = Math.min(100, ((c.score_comercial ?? 0) / 5) * 100);
    const prioridad = prioridadVisita({ ...c, dias_desde_ultima_compra: dias }, distancia_km, options.precioCajaCanal ?? 0);
    const score_prioridad = prioridadEscala100(prioridad);
    const { penalty } = penalidadSolapamiento(lat, long, options.otherAnchors || []);

    const score_total = score_prioridad * 0.45 + score_geo * 0.30 + score_comercial * 0.10
      + cd.rotacion * 0.15 + penalty + revisitBonus;

    out.push({
      client_id: c.client_id,
      identity_key: buildIdentityKey({
        id: c.client_id,
        cuit: c.cuit_dni,
        nombre: c.fantasia || c.razon_social,
        direccion: place.direccion_principal || c.direccion_principal,
        lat, long,
      }),
      razon_social: c.fantasia || c.razon_social || "Sin nombre",
      es_prospecto: false,
      estado_comercial: estado,
      score_geo: Math.round(score_geo),
      score_comercial: Math.round(score_comercial),
      score_rotacion: Math.round(cd.rotacion),
      score_total: Math.round(score_total),
      distancia_km: Math.round(distancia_km * 10) / 10,
      lat, long,
      barrio: place.barrio_principal || c.barrio_principal || null,
      direccion: place.direccion_principal || c.direccion_principal || null,
      rubro: c.rubro ?? null,
      vendedor_actual: c.vendedor_actual || c.vendedor_principal || null,
      dias_desde_ultima_compra: dias,
      ticket_promedio: c.ticket_promedio ?? null,
      monto_total_historico: c.monto_total_historico ?? null,
      feedbacks_recientes: resumirFeedbacks(feedbacks),
      prioridad_comercial: score_prioridad,
      cadencia_dias: c.cadencia_dias ?? null,
      alerta_nc: alertaNotaCredito(c),
      origen: "cartera",
      factores: { recuperacion: recuperacion({ dias_sin_comprar: dias, cadencia_dias: c.cadencia_dias ?? null }), potencial: c.factor_potencial ?? null, oportunidad: revisitaVencida ? 1 : c.factor_oportunidad ?? null },
      revisita: revisitaVencida ? { fecha: new Date(revisit!.dueAt).toISOString().slice(0, 10), motivo: revisit!.source, recordatorio: !!revisit!.recordatorio } : null,
      locales,
    });
  }
  out.sort((a, b) => b.score_total - a.score_total);
  return out;
}

// ---------------- prospectos ----------------

/**
 * Puntúa prospectos dentro de `radiusKm`. El filtro de reseñas de Google se aplica
 * SOLO a prospectos que vienen de Google: los del Excel y los cargados por los
 * vendedores no tienen reseñas y antes se descartaban todos.
 */
export function scoreProspects(
  prospectos: any[],
  feedbacksMap: Map<string, any[]>,
  hotspot: AnchorPoint,
  radiusKm: number,
  options: ScoreOptions = {},
): ScoredCandidate[] {
  const now = options.now ?? new Date();
  const out: ScoredCandidate[] = [];
  for (const p of prospectos) {
    if (!p?.place_id || p.client_id || p.es_cliente_cupra) continue;
    if (p.estado_negocio === "CLOSED_PERMANENTLY" || p.estado_negocio === "CLOSED_TEMPORARILY") continue;
    if (!isValidCoord(p.latitud, p.longitud)) continue;
    const lat = Number(p.latitud), long = Number(p.longitud);
    const distancia_km = calcularDistanciaKm(hotspot.lat, hotspot.lng, lat, long);
    if (distancia_km > radiusKm) continue;

    if (options.posiblesClientes?.has(p.place_id)) continue;
    const origen = origenProspecto(p);
    if (origen === "google" && !esProspectoComercialmenteValido(p)) continue;

    const { minDist, penalty } = penalidadSolapamiento(lat, long, options.otherAnchors || []);
    // Coherencia territorial: si queda claramente en la zona de otro vendedor, no va acá.
    if (!options.ignorarTerritorio && minDist + 1 < distancia_km) continue;

    const feedbacks = feedbacksMap.get(p.place_id) || [];
    if (excluidoPorFeedback(feedbacks, now)) continue;
    const revisit = options.revisitMap?.get(p.place_id);
    if (revisit && revisit.dueAt > now.getTime()) continue;
    if (!revisit && pausaPorVisita(feedbacks, true, now).excluido) continue;
    const revisitBonus = revisit ? 30 : 0;
    const revisitaVencida = !!revisit && now.getTime() - revisit.dueAt <= DIAS_REVISITA_PRIORITARIA * MS_DIA;

    const cd = enCooldown(p.last_recommendation_at, options.cooldownDays ?? 0, now);
    if (cd.bloqueado) continue;

    const tieneTelefono = Boolean(String(p.telefono || "").trim());
    // Excel/manual: los cargó el equipo comercial → potencial base alto.
    const potencial = origen === "google" ? potencialProspecto(p) : 70;
    const score_comercial = Math.min(100, potencial + (tieneTelefono ? 10 : 0));
    const score_geo = Math.max(0, 100 - (distancia_km / Math.max(radiusKm, 0.1)) * 100);
    const score_total = score_geo * 0.70 + score_comercial * 0.15 + cd.rotacion * 0.15 + penalty + revisitBonus;

    out.push({
      client_id: p.place_id,
      identity_key: buildIdentityKey({ id: p.place_id, nombre: p.nombre, direccion: p.direccion, lat, long }),
      razon_social: p.nombre,
      es_prospecto: true,
      estado_comercial: "POTENCIAL",
      score_geo: Math.round(score_geo),
      score_comercial: Math.round(score_comercial),
      score_rotacion: Math.round(cd.rotacion),
      score_total: Math.round(score_total),
      distancia_km: Math.round(distancia_km * 10) / 10,
      lat, long,
      barrio: p.barrio ?? null,
      direccion: p.direccion ?? null,
      rubro: p.rubro ?? null,
      vendedor_actual: null,
      dias_desde_ultima_compra: null,
      ticket_promedio: null,
      monto_total_historico: null,
      feedbacks_recientes: resumirFeedbacks(feedbacks),
      tipo_negocio: p.tipo_principal ?? null,
      rating: p.rating ?? null,
      total_ratings: p.total_ratings ?? null,
      prioridad_comercial: Math.round(score_comercial * 0.4),
      origen: "base",
      // Un prospecto no se recupera: no compró nunca. Su potencial sale de lo que se sabe del lugar.
      factores: { ...factoresProspecto(p), oportunidad: revisitaVencida ? 1 : p.factor_oportunidad ?? null },
      revisita: revisitaVencida ? { fecha: new Date(revisit!.dueAt).toISOString().slice(0, 10), motivo: revisit!.source, recordatorio: !!revisit!.recordatorio } : null,
      locales: [{ lat, lng: long, place_id: p.place_id, direccion: p.direccion ?? null, barrio: p.barrio ?? null }],
    });
  }
  out.sort((a, b) => a.distancia_km - b.distancia_km);
  return out;
}

// ---------------- textos para el asignador ----------------

/** Limpia jerga interna y coordenadas de los textos que ve el asignador. */
export function limpiarJustificacion(texto: string | null | undefined, fallback: string, maxLen = 320): string {
  let out = String(texto ?? "").trim();
  if (!out) return fallback;
  out = out
    .replace(/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, "la zona")
    .replace(/\b(hotspot|cluster|centroide|score_[a-z_]*|score\s*(final|total|geo|geográfico)?\s*[:=]?\s*\d+(\.\d+)?)\b/gi, "")
    .replace(/\bdist(ancia)?\s*[:=]?\s*\d+(\.\d+)?\s*km\b/gi, "")
    .replace(/\blat(itud)?\s*[:=]?\s*-?\d+(\.\d+)?/gi, "")
    .replace(/\blong(itud)?\s*[:=]?\s*-?\d+(\.\d+)?/gi, "")
    .replace(/^\s*Auto\s*:\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–,;]\s*(?=[.,;]|$)/g, "")
    .trim();
  out = out.replace(/^[\s\-–,;.]+/, "").trim();
  if (out.length < 12) return fallback;
  return out.length > maxLen ? `${out.slice(0, maxLen - 3)}...` : out;
}

const cuadras = (km: number) => Math.max(1, Math.round((km * 1000) / 100));

/** Etiqueta de rubro para anteponer a la descripción ("Restaurante · ..."). */
export function etiquetaRubro(c: Pick<ScoredCandidate, "rubro">): string {
  return c.rubro ? `${c.rubro} · ` : "";
}

/** Justificación en lenguaje comercial, sin depender de la IA. */
export function justificacionComercial(c: ScoredCandidate): string {
  const zona = normalizeBarrio(c.barrio) || "la zona";
  const cerca = c.fuera_de_zona
    ? "Queda fuera de la zona elegida: se sumó para completar las 8 visitas"
    : (cuadras(c.distancia_km) <= 1 ? "Queda a una cuadra del resto de la ruta" : `Queda a unas ${cuadras(c.distancia_km)} cuadras del resto de la ruta`);
  const rubro = etiquetaRubro(c);
  if (c.es_prospecto) {
    const rep = c.total_ratings ? ` con ${c.total_ratings} reseñas` : "";
    return `${rubro}Lugar de ${zona}${rep} que todavía no nos compra. ${cerca}.`;
  }
  const dias = c.dias_desde_ultima_compra;
  if (c.alerta_nc) {
    return `${rubro}Visita de servicio y recupero: devolvió el ${Math.round(c.alerta_nc.ratio * 100)}% de lo facturado`
      + `${c.alerta_nc.fecha ? ` (nota de crédito del ${c.alerta_nc.fecha})` : ""}. ${cerca}. Revisar el motivo de la `
      + `devolución y la cobranza antes de ofrecer producto.`;
  }
  const ritmo = c.cadencia_dias && dias != null && dias > c.cadencia_dias
    ? ` Compra cada ${Math.round(c.cadencia_dias)} días, así que ya está atrasado.`
    : "";
  switch (c.estado_comercial) {
    case "ACTIVO":
      return `${rubro}Cliente activo de ${zona}${dias != null ? `, compró hace ${dias} días` : ""}.${ritmo} ${cerca}: visita de mantenimiento.`;
    case "INACTIVO":
      return `${rubro}Bajó el ritmo${dias != null ? `: hace ${dias} días que no compra` : ""}.${ritmo} ${cerca}: conviene pasar antes de que se enfríe.`;
    case "PERDIDO":
      return `${rubro}Cliente a recuperar${dias != null ? `: hace ${dias} días que no compra` : ""}.${ritmo} ${cerca}: visita de reconquista.`;
    default:
      return `${rubro}Está en tu cartera pero todavía no compró CUPRA. ${cerca}: visita de primera venta.`;
  }
}
