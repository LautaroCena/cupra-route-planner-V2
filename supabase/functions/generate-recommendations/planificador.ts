// Ocho visitas dentro de un radio fijo de 1,5 km. Sin cupos por estado.
// El planificador no accede a la red ni a la base: las dependencias se inyectan.
import { type AnchorPoint, findDensestHotspot } from "./geo-hotspot.ts";
import { componerPorValor } from "./recommendation-composition.ts";
import type { ParametrosSeleccion } from "../_shared/seleccion.ts";
import { dedupeByIdentity, isValidCoord, type RevisitInfo, type ScoredCandidate, scoreClients, scoreProspects } from "./candidatos.ts";
import { diasDesdeUltimaCompra, type EstadoComercial, estadoPorDias } from "./reglas.ts";
import { distanciaKm, errorRuta, FRANJA_RUTA_KM, RADIO_RUTA_KM, VISITAS_POR_DIA } from "../_shared/ruta.ts";
export { RADIO_RUTA_KM, VISITAS_POR_DIA } from "../_shared/ruta.ts";
export const COOLDOWN_DIAS = 0;
import { RADIOS_CERCANIA } from "../_shared/compact-route.ts";
export interface Vendedor { user_id: string; nombre: string }
export interface PlanInput {
  vendedores: Vendedor[];
  carteraEnZona: Map<string, any[]>;
  carteraTotal: Map<string, any[]>;
  placesMap: Map<string, any>;
  /** Todos los locales de cada cliente (también los no principales). */
  localesMap?: Map<string, any[]>;
  /** Parámetros de selección (motor_config); por defecto, los de _shared/seleccion.ts. */
  parametros?: Partial<ParametrosSeleccion>;
  prospectosZona: any[];
  feedbacksClientes: Map<string, any[]>;
  feedbacksProspectos: Map<string, any[]>;
  revisitClientes: Map<string, RevisitInfo>;
  revisitProspectos: Map<string, RevisitInfo>;
  posiblesClientes: Map<string, unknown>;
  estados: Set<EstadoComercial>;
  precioCajaCanal: number;
  centroZona: AnchorPoint | null;
  enArea: (p: { barrio?: string | null; comuna?: string | null; ciudad?: string | null }) => boolean;
  areaActiva: boolean;
  asignadosHoy: Set<string>;
  now?: Date;
}
export interface PlanDeps {
  prospectosCerca(lat: number, lng: number, radioKm: number): Promise<any[]>;
  descubrirEnGoogle?(lat: number, lng: number, radioKm: number, objetivo: number, excluir: Set<string>, vendedorId?: string): Promise<any[]>;
  pasaGate(p: any): boolean;
  preferidosIA?: Map<string, string[]>;
  log?: (msg: string) => void;
}
export interface Cobertura {
  vendedor: string;
  vendedor_id: string;
  total: number;
  faltantes: number;
  completa: boolean;
  centro: AnchorPoint | null;
  radio_maximo_km: number;
  obtenido: { cartera_activa: number; reactivacion: number; potencial: number; prospectos: number };
  estados_elegidos: string[];
  fuera_de_seleccion: number;
  fuera_de_zona: number;
  prospectos_de_maps: number;
  radio_final_km: number;
  clientes_propios_en_zona: number;
  cuentas_prioritarias_fuera_de_zona: { nombre: string; barrio: string | null; dias_sin_comprar: number | null }[];
  centros_evaluados: number;
  /** Largo del recorrido elegido (línea recta mientras no haya distancias por calle). */
  km_recorrido: number;
  valor_total: number;
  avisos: string[];
  en_franja: number;
  error_google?: string;
  error_base?: string;
}
export interface PlanVendedor {
  vendedor: Vendedor;
  hotspot: AnchorPoint | null;
  elegidos: ScoredCandidate[];
  fueraDeSeleccion: Set<string>;
  cobertura: Cobertura;
  pool: Map<string, ScoredCandidate>;
}
export interface PlanResult { porVendedor: PlanVendedor[]; descubiertosGoogle: any[] }

export async function planificarRutas(input: PlanInput, deps: PlanDeps): Promise<PlanResult> {
  const now = input.now ?? new Date();
  const usadosIds = new Set(input.asignadosHoy), usadosIdentidades = new Set<string>();
  const nuevos = new Map<string, any>();
  const porVendedor: PlanVendedor[] = [];
  const opciones = { now, precioCajaCanal: input.precioCajaCanal, posiblesClientes: input.posiblesClientes };

  for (const vendedor of input.vendedores) {
    const cartera = (input.carteraEnZona.get(vendedor.user_id) || []).filter(c => !usadosIds.has(c.client_id));
    const elegible = (c: any) => !input.estados.size || input.estados.has(estadoPorDias(diasDesdeUltimaCompra(c, now)));
    const puntosPropios = (filas: any[]) => filas.map(c => input.placesMap.get(c.client_id))
      .filter(p => p && isValidCoord(p.lat, p.long)).map(p => ({ lat: Number(p.lat), lng: Number(p.long) }));
    const propios = puntosPropios(cartera.filter(elegible));
    const todosPropios = puntosPropios(cartera);
    const prospectos = new Map<string, any>([...input.prospectosZona, ...nuevos.values()].filter(deps.pasaGate).map(p => [p.place_id, p]));
    const puntosProspectos = [...prospectos.values()].filter(p => !usadosIds.has(p.place_id) && isValidCoord(p.latitud, p.longitud) && (!input.areaActiva || input.enArea(p)))
      .map(p => ({ lat: Number(p.latitud), lng: Number(p.longitud) }));
    // Cada alternativa es un centro en la zona de trabajo, nunca un radio mayor.
    const opcionesCentro = [...propios, ...todosPropios];
    if (!opcionesCentro.length) {
      const denso = findDensestHotspot(puntosProspectos, RADIO_RUTA_KM);
      if (denso) opcionesCentro.push(denso);
      if (input.centroZona) opcionesCentro.push(input.centroZona);
      opcionesCentro.push(...puntosProspectos);
    }
    const centros = opcionesCentro.filter((p, i, xs) => !xs.slice(0, i).some(q => p.lat === q.lat && p.lng === q.lng));
    const cobertura: Cobertura = {
      vendedor: vendedor.nombre, vendedor_id: vendedor.user_id, total: 0, faltantes: 8, completa: false,
      centro: null, radio_maximo_km: RADIO_RUTA_KM,
      obtenido: { cartera_activa: 0, reactivacion: 0, potencial: 0, prospectos: 0 },
      estados_elegidos: [...input.estados], fuera_de_seleccion: 0, fuera_de_zona: 0,
      prospectos_de_maps: 0, radio_final_km: 0, clientes_propios_en_zona: cartera.length,
      cuentas_prioritarias_fuera_de_zona: [], centros_evaluados: 0, km_recorrido: 0, valor_total: 0, avisos: [], en_franja: 0,
    };
    const evaluar = (h: AnchorPoint, pausa: number, otrosEstados = false) => {
      // Se buscan candidatos hasta la franja; la selección decide quién entra.
      const clients = dedupeByIdentity(scoreClients(cartera, input.placesMap, input.feedbacksClientes, h, FRANJA_RUTA_KM,
        { ...opciones, revisitMap: input.revisitClientes, cooldownDays: pausa, localesMap: input.localesMap }).filter(c => !usadosIds.has(c.client_id)), usadosIdentidades);
      const identidades = new Set([...usadosIdentidades, ...clients.map(c => c.identity_key)]);
      const prospects = dedupeByIdentity(scoreProspects([...prospectos.values()], input.feedbacksProspectos, h, FRANJA_RUTA_KM,
        { ...opciones, revisitMap: input.revisitProspectos, cooldownDays: pausa, ignorarTerritorio: true }).filter(c => !usadosIds.has(c.client_id)), identidades)
        .map(c => ({ ...c, origen: nuevos.has(c.client_id) ? "maps_live" as const : "base" as const, fuera_de_zona: input.areaActiva && !input.enArea(prospectos.get(c.client_id)) }));
      const pool = new Map<string, ScoredCandidate>([...clients, ...prospects].map(c => [c.client_id, c]));
      const compuesto = componerPorValor({ clients, prospects, centro: h, unavailableIds: usadosIds,
        estados: input.estados, permitirOtrosEstados: otrosEstados, parametros: input.parametros });
      // Cada elegido va con el local en el que entró (puede no ser el principal).
      const elegidos = compuesto.ids.map(id => {
        const c = pool.get(id)!, l = compuesto.locales.get(id);
        return l ? { ...c, lat: l.lat, long: l.lng, direccion: l.direccion ?? c.direccion, barrio: l.barrio ?? c.barrio, client_place_id: c.es_prospecto ? null : l.place_id ?? null } : c;
      });
      return { h, pool, compuesto, elegidos, propios: elegidos.filter(c => !c.es_prospecto && (!input.estados.size || input.estados.has(c.estado_comercial))).length };
    };
    const extension = (r:ReturnType<typeof evaluar>) => Math.max(0,...r.elegidos.map(c=>distanciaKm(r.h,{lat:Number(c.lat),lng:Number(c.long)})));
    // Entre centros: más visitas, después más valor y, a igual valor, menos recorrido.
    const ordenar = (a:ReturnType<typeof evaluar>,b:ReturnType<typeof evaluar>) =>
      b.elegidos.length-a.elegidos.length || Number(b.propios>0)-Number(a.propios>0)
      || b.compuesto.valor-a.compuesto.valor || a.compuesto.km-b.compuesto.km;
    let candidatos=centros.map(h=>evaluar(h,0)).sort(ordenar);
    let mejor=candidatos[0];
    const agregarCentro=(h:AnchorPoint)=>{if(!centros.some(c=>c.lat===h.lat&&c.lng===h.lng))centros.push(h);};
    if(!mejor || mejor.elegidos.length<VISITAS_POR_DIA) {
      const denso=findDensestHotspot(puntosProspectos,RADIO_RUTA_KM);
      if(denso)agregarCentro(denso);
      puntosProspectos.forEach(agregarCentro);
      if(input.centroZona && !centros.length)agregarCentro(input.centroZona);
    }
    candidatos=centros.map(h=>evaluar(h,0)).sort(ordenar);
    for(const c of candidatos.slice(0,3)) {
      try { for(const p of await deps.prospectosCerca(c.h.lat,c.h.lng,RADIO_RUTA_KM)) if(deps.pasaGate(p))prospectos.set(p.place_id,p); }
      catch(e) { cobertura.error_base=e instanceof Error?e.message:String(e); }
    }
    candidatos=centros.map(h=>evaluar(h,0)).sort(ordenar);mejor=candidatos[0];
    // Se busca también con ocho clientes disponibles cuando aún están dispersos.
    if(deps.descubrirEnGoogle && (!mejor || mejor.elegidos.length<8 || extension(mejor)>0.15)) {
      for(const c of candidatos.slice(0,3)) {
        for(const radio of RADIOS_CERCANIA) {
          try {
            const encontrados=await deps.descubrirEnGoogle(c.h.lat,c.h.lng,radio,16,new Set([...usadosIds,...prospectos.keys()]),vendedor.user_id);
            for(const p of encontrados) if(deps.pasaGate(p)) {nuevos.set(p.place_id,p);prospectos.set(p.place_id,p);}
          } catch(e) { cobertura.error_google=e instanceof Error?e.message:String(e);break; }
          candidatos=centros.map(h=>evaluar(h,0)).sort(ordenar);mejor=candidatos[0];
          if(mejor?.elegidos.length===8 && extension(mejor)<=radio)break;
        }
        if(mejor?.elegidos.length===8)break;
      }
    }
    if(!mejor || mejor.elegidos.length<8) mejor=centros.map(h=>evaluar(h,0,true)).sort(ordenar)[0];
    cobertura.centros_evaluados = centros.length;
    const elegidos = mejor?.elegidos || [];
    const h = mejor?.h || null;
    cobertura.centro = h;
    cobertura.total = elegidos.length;
    cobertura.faltantes = VISITAS_POR_DIA - elegidos.length;
    cobertura.completa = errorRuta(elegidos.map(c => ({ id: c.client_id, lat: Number(c.lat), lng: Number(c.long) })), h, true) === null;
    cobertura.km_recorrido = Math.round((mejor?.compuesto.km ?? 0) * 100) / 100;
    cobertura.valor_total = Math.round(mejor?.compuesto.valor ?? 0);
    cobertura.avisos = mejor?.compuesto.avisos ?? [];
    cobertura.en_franja = mejor?.compuesto.enFranja.length ?? 0;
    for (const c of elegidos) {
      usadosIds.add(c.client_id); usadosIdentidades.add(c.identity_key);
      if (c.es_prospecto) cobertura.obtenido.prospectos++;
      else if (c.estado_comercial === "ACTIVO") cobertura.obtenido.cartera_activa++;
      else if (c.estado_comercial === "POTENCIAL") cobertura.obtenido.potencial++;
      else cobertura.obtenido.reactivacion++;
      if (c.fuera_de_zona) cobertura.fuera_de_zona++;
      if (c.origen === "maps_live") cobertura.prospectos_de_maps++;
      if (h) cobertura.radio_final_km = Math.max(cobertura.radio_final_km, distanciaKm(h, { lat: Number(c.lat), lng: Number(c.long) }));
    }
    cobertura.fuera_de_seleccion = mejor?.compuesto.fueraDeSeleccion.length || 0;
    deps.log?.(`${vendedor.nombre}: ${cobertura.total}/8, ${cobertura.km_recorrido} km, valor ${cobertura.valor_total}; ${cobertura.obtenido.prospectos} prospectos.`);
    porVendedor.push({ vendedor, hotspot: h, elegidos, fueraDeSeleccion: new Set(mejor?.compuesto.fueraDeSeleccion), cobertura, pool: mejor?.pool || new Map() });
  }
  return { porVendedor, descubiertosGoogle: [...nuevos.values()] };
}
