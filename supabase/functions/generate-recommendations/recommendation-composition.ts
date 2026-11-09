// Composición de la ruta: mismos filtros de siempre (estados pedidos y ya asignados),
// y la selección por valor de _shared/seleccion.ts.
import { distanciaKm, type Coordenada } from "../_shared/ruta.ts";
import { type ParametrosSeleccion, seleccionarPorValor } from "../_shared/seleccion.ts";
import type { ScoredCandidate } from "./candidatos.ts";

export interface ComposicionPorValor {
  ids: string[];
  fueraDeSeleccion: string[];
  /** El local elegido de cada cliente (puede no ser el principal). */
  locales: Map<string, NonNullable<ScoredCandidate["locales"]>[number]>;
  km: number;
  valor: number;
  avisos: string[];
  enFranja: string[];
  /** Siguientes mejores, con el local en el que entrarían. */
  alternativas: { id: string; local: NonNullable<ScoredCandidate["locales"]>[number] }[];
}

/**
 * Filtra por los estados pedidos y lo ya asignado, y elige por
 * valor con _shared/seleccion.ts. La distancia todavía es en línea recta; con clave de
 * Google se pasa la distancia por calles en `dist`.
 */
export function componerPorValor(input: {
  clients: ScoredCandidate[]; prospects: ScoredCandidate[]; centro: Coordenada;
  unavailableIds?: ReadonlySet<string>; estados?: ReadonlySet<string>; permitirOtrosEstados?: boolean;
  parametros?: Partial<ParametrosSeleccion>; dist?: (a: Coordenada, b: Coordenada) => number;
}): ComposicionPorValor {
  const { clients, prospects, centro, unavailableIds = new Set<string>(), estados = new Set<string>(), permitirOtrosEstados = false } = input;
  const elegido = (c: ScoredCandidate) => !estados.size || estados.has(c.es_prospecto ? "POTENCIAL" : c.estado_comercial);
  const candidatas = [
    ...clients.filter((c) => !unavailableIds.has(c.client_id) && (elegido(c) || permitirOtrosEstados)),
    ...prospects.filter((c) => !unavailableIds.has(c.client_id)),
  ].filter((c) => c.locales?.length);
  const porId = new Map(candidatas.map((c) => [c.client_id, c]));
  const r = seleccionarPorValor(
    centro,
    candidatas.map((c) => ({ id: c.client_id, factores: c.factores ?? { recuperacion: null, potencial: null }, locales: c.locales! })),
    input.dist ?? distanciaKm,
    distanciaKm,
    input.parametros,
  );
  const ids = r.elegidos.map((e) => e.id);
  return {
    ids,
    fueraDeSeleccion: ids.filter((id) => !elegido(porId.get(id)!)),
    locales: new Map(r.elegidos.map((e) => [e.id, e.local as NonNullable<ScoredCandidate["locales"]>[number]])),
    km: r.km,
    valor: r.elegidos.reduce((s, e) => s + e.valorSinRecorrido, 0),
    avisos: r.avisos,
    enFranja: r.elegidos.filter((e) => e.enFranja).map((e) => e.id),
    alternativas: r.alternativas.map((a) => ({ id: a.id, local: a.local as NonNullable<ScoredCandidate["locales"]>[number] })),
  };
}
