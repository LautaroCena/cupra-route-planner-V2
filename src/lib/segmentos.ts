// ============================================================
// Segmentos comerciales compartidos por todos los dashboards,
// los mapas y el pedido de recomendaciones.
//
// Mismos umbrales que el motor (supabase/functions/generate-recommendations/reglas.ts):
//   Activo     ≤ 30 días sin comprar
//   Inactivo   31–90 días
//   Perdido    > 90 días
//   Potencial  prospecto, o cliente de cartera que nunca compró CUPRA
// Los días se calculan HOY desde `ultima_compra` (el valor guardado al importar queda viejo).
// ============================================================

import { type EstadoComercial, diasDesdeUltimaCompra, estadoPorDias } from "../../supabase/functions/_shared/estado-comercial";
export { fechaReferencia, fijarFechaCorte, obtenerFechaCorte } from "../../supabase/functions/_shared/estado-comercial";
export { type EstadoComercial, DIAS_ACTIVO, DIAS_INACTIVO, hoyArgentina, estadoPorDias } from "../../supabase/functions/_shared/estado-comercial";
export const diasSinComprar = diasDesdeUltimaCompra;

export const ESTADOS: { value: EstadoComercial; label: string; plural: string; color: string }[] = [
  { value: "ACTIVO", label: "Activo", plural: "Activos", color: "#16a34a" },
  { value: "INACTIVO", label: "Inactivo", plural: "Inactivos", color: "#d97706" },
  { value: "PERDIDO", label: "Perdido", plural: "Perdidos", color: "#dc2626" },
  { value: "POTENCIAL", label: "Potencial", plural: "Potenciales", color: "#2563eb" },
];

const ESTADO_POR_VALOR = new Map(ESTADOS.map((e) => [e.value, e]));

export function colorEstado(estado: string | null | undefined): string {
  return ESTADO_POR_VALOR.get((estado || "").toUpperCase() as EstadoComercial)?.color || "#9ca3af";
}

export function labelEstado(estado: string | null | undefined): string {
  return ESTADO_POR_VALOR.get((estado || "").toUpperCase() as EstadoComercial)?.label || "Sin estado";
}

/** Estado de cualquier fila (cliente o prospecto). */
export function estadoDe(row: {
  es_prospecto?: boolean | null;
  ultima_compra?: string | null;
  dias_desde_ultima_compra?: number | null;
}): EstadoComercial {
  if (row.es_prospecto) return "POTENCIAL";
  return estadoPorDias(diasSinComprar(row));
}

// ------------------------------------------------------------
// Volumen y canal
// ------------------------------------------------------------

export const VOLUMENES = [
  { value: "TOP_10", label: "Top 10%" },
  { value: "ALTO", label: "Alto" },
  { value: "MEDIO", label: "Medio" },
  { value: "BAJO", label: "Bajo" },
];

export const CANALES = [
  { value: "ON_TRADE", label: "On trade (restaurantes, bares, hoteles)" },
  { value: "OFF_TRADE", label: "Off trade (vinotecas, almacenes)" },
];

// ------------------------------------------------------------
// Filtros por segmento
// ------------------------------------------------------------

export interface FiltrosSegmento {
  estados: string[];
  rubros: string[];
  canales: string[];
  volumenes: string[];
  vendedores: string[];
  comunas: string[];
  barrios: string[];
}

export const FILTROS_VACIOS: FiltrosSegmento = {
  estados: [], rubros: [], canales: [], volumenes: [], vendedores: [], comunas: [], barrios: [],
};

export const hayFiltros = (f: FiltrosSegmento) => Object.values(f).some((v) => v.length > 0);

/** Clave comparable (sin acentos ni mayúsculas) para cruzar textos de distintas fuentes. */
export const claveTexto = (v: string | null | undefined) =>
  (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

export interface SegmentoDeFila {
  estado?: string | null;
  rubro?: string | null;
  canal?: string | null;
  volumen?: string | null;
  vendedor?: string | null;
  comuna?: string | null;
  barrio?: string | null;
}

/**
 * Aplica los filtros de segmento. `acceso` traduce cada fila a sus segmentos,
 * así el mismo filtro sirve para clientes, prospectos, ventas y asignaciones.
 * Un filtro vacío no filtra. Barrio compara también sub-barrios ("Palermo Soho" ∈ "Palermo").
 */
export function filtrarPorSegmentos<T>(filas: T[], f: FiltrosSegmento, acceso: (fila: T) => SegmentoDeFila): T[] {
  if (!hayFiltros(f)) return filas;
  const set = (xs: string[]) => new Set(xs.map(claveTexto));
  const estados = set(f.estados), rubros = set(f.rubros), canales = set(f.canales), volumenes = set(f.volumenes);
  const vendedores = set(f.vendedores), comunas = set(f.comunas), barrios = set(f.barrios);
  const enBarrio = (b: string) => barrios.has(b) || [...barrios].some((k) => b.startsWith(`${k} `));
  return filas.filter((fila) => {
    const s = acceso(fila);
    if (estados.size && !estados.has(claveTexto(s.estado))) return false;
    if (rubros.size && !rubros.has(claveTexto(s.rubro))) return false;
    if (canales.size && !canales.has(claveTexto(s.canal))) return false;
    if (volumenes.size && !volumenes.has(claveTexto(s.volumen))) return false;
    if (vendedores.size && !vendedores.has(claveTexto(s.vendedor))) return false;
    if (comunas.size && !comunas.has(claveTexto(s.comuna))) return false;
    if (barrios.size && !enBarrio(claveTexto(s.barrio))) return false;
    return true;
  });
}
