import { seleccionarCercanos } from "../_shared/compact-route.ts";
import { distanciaKm, type Coordenada } from "../_shared/ruta.ts";
export interface CompositionCandidate {
  client_id: string; es_prospecto: boolean; estado_comercial: string;
  lat: number | null; long: number | null; prioridad_comercial?: number; score_total?: number;
}
interface CompositionInput<T extends CompositionCandidate> {
  preferredIds: string[]; clients: T[]; prospects: T[];
  unavailableIds?: ReadonlySet<string>; limit?: number; estados?: ReadonlySet<string>;
  permitirOtrosEstados?: boolean; centro?: Coordenada;
}
export interface CompositionResult { ids: string[]; fueraDeSeleccion: string[] }
export function composeRoute<T extends CompositionCandidate>({clients,prospects,unavailableIds=new Set<string>(),limit=8,
  estados=new Set<string>(),permitirOtrosEstados=false,centro}: CompositionInput<T>): CompositionResult {
  const elegido=(c:T)=>!estados.size || estados.has(c.es_prospecto?"POTENCIAL":c.estado_comercial);
  const valida=(c:T)=>c.lat!=null&&c.long!=null&&Number.isFinite(c.lat)&&Number.isFinite(c.long);
  const cartera=clients.filter(c=>valida(c)&&!unavailableIds.has(c.client_id)&&(elegido(c)||permitirOtrosEstados));
  const candidatas=[...cartera,...prospects.filter(c=>valida(c)&&!unavailableIds.has(c.client_id))];
  if(!candidatas.length) return {ids:[],fueraDeSeleccion:[]};
  const h=centro??{lat:candidatas[0].lat!,lng:candidatas[0].long!};
  const referencia=[...cartera].sort((a,b)=>
    Number(distanciaKm(h,{lat:b.lat!,lng:b.long!})<0.001)-Number(distanciaKm(h,{lat:a.lat!,lng:a.long!})<0.001)
    || Number(elegido(b))-Number(elegido(a)) || (b.prioridad_comercial??b.score_total??0)-(a.prioridad_comercial??a.score_total??0)
    || a.client_id.localeCompare(b.client_id))[0];
  const punto=(c:T)=>({id:c.client_id,lat:c.lat!,lng:c.long!,prioridad:c.prioridad_comercial??0,cliente:!c.es_prospecto});
  const ids=seleccionarCercanos(h,candidatas.map(punto),referencia?[punto(referencia)]:[],limit).map(p=>p.id);
  return {ids,fueraDeSeleccion:ids.filter(id=>!elegido(candidatas.find(c=>c.client_id===id)!))};
}
export function composeRecommendationIds<T extends CompositionCandidate>(input:CompositionInput<T>):string[] {return composeRoute(input).ids;}

// ---------------- Etapa 3: selección por valor ----------------
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
}

/**
 * Mismos filtros que composeRoute (estados pedidos y ya asignados), pero elige por
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
  };
}
