// Potencial de un prospecto (0 a 1), igual para el motor y para la ruta desde el mapa.
// Los de Google se miden por reseñas; los que cargó el equipo comercial (Excel o a mano)
// arrancan altos. Tener teléfono suma. Un prospecto no tiene recuperación: nunca compró.
import { potencialProspecto } from "./portfolio-ranking.ts";
import { origenProspecto } from "./reglas.ts";
import { potencialOsm } from "./osm.ts";

export function puntajeProspecto(p: Parameters<typeof origenProspecto>[0] & { rating?: number | null; total_ratings?: number | null; telefono?: string | null }): number {
  // OpenStreetMap no trae reseñas: el potencial sale del rubro.
  const origen = origenProspecto(p);
  const base = origen === "google" ? potencialProspecto(p) : origen === "osm" ? potencialOsm(p.tipo_principal) : 70;
  return Math.min(100, base + (String(p.telefono || "").trim() ? 10 : 0));
}

export function factoresProspecto(p: Parameters<typeof puntajeProspecto>[0]) {
  return { recuperacion: 0, potencial: puntajeProspecto(p) / 100 };
}
