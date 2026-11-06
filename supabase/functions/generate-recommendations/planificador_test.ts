// Recorrido completo del planificador con datos armados que reproducen el piloto.
import { ok as assert, deepStrictEqual as assertEquals } from "node:assert/strict";
import { type PlanDeps, type PlanInput, planificarRutas } from "./planificador.ts";
import { buildAreaFilter, belongsToArea } from "./portfolio-ranking.ts";
import { parseEstados } from "./reglas.ts";

const NOW = new Date("2026-09-23T15:00:00Z");
const CENTRO = { lat: -34.585, lng: -58.425 }; // Palermo
const diasAtras = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString().slice(0, 10);
// Desplazamiento aproximado en km → grados
const punto = (dxKm: number, dyKm: number) => ({
  lat: CENTRO.lat + dyKm / 111.32,
  lng: CENTRO.lng + dxKm / (111.32 * Math.cos((CENTRO.lat * Math.PI) / 180)),
});

let seq = 0;
function cliente(vendedor: string, dias: number | null, dx: number, dy: number, barrio = "Palermo") {
  const id = `c${++seq}`;
  const p = punto(dx, dy);
  return {
    row: {
      client_id: id, razon_social: `Cliente ${id}`, fantasia: `Cliente ${id}`, cuit_dni: `3070000${String(seq).padStart(4, "0")}`,
      vendedor_actual: vendedor, ultima_compra: dias === null ? null : diasAtras(dias),
      dias_desde_ultima_compra: dias, monto_total_historico: 2_000_000, cadencia_dias: 20, cantidad_ordenes: dias === null ? 0 : 5,
    },
    place: { client_id: id, lat: p.lat, long: p.lng, barrio_principal: barrio, direccion_principal: `Calle ${id} 100` },
  };
}
function prospecto(dx: number, dy: number, extra: Record<string, unknown> = {}) {
  const id = `excel-${++seq}`;
  const p = punto(dx, dy);
  return { place_id: id, nombre: `Prospecto ${seq}`, direccion: `Av ${seq}`, barrio: "Palermo", latitud: p.lat, longitud: p.lng, total_ratings: 0, rating: null, ...extra };
}

function armarInput(opts: {
  vendedores: string[];
  clientes: ReturnType<typeof cliente>[];
  clientesFuera?: ReturnType<typeof cliente>[];
  prospectos: any[];
  estados?: string[];
  feedbacks?: Map<string, any[]>;
  sinArea?: boolean;
}): PlanInput {
  const placesMap = new Map<string, any>();
  [...opts.clientes, ...(opts.clientesFuera || [])].forEach((c) => placesMap.set(c.row.client_id, c.place));
  const porVendedor = (lista: ReturnType<typeof cliente>[]) => {
    const m = new Map<string, any[]>();
    for (const v of opts.vendedores) m.set(v, lista.filter((c) => c.row.vendedor_actual === v).map((c) => c.row));
    return m;
  };
  const filtro = buildAreaFilter(["Palermo"], []);
  return {
    vendedores: opts.vendedores.map((v) => ({ user_id: v, nombre: v })),
    carteraEnZona: porVendedor(opts.clientes),
    carteraTotal: porVendedor([...opts.clientes, ...(opts.clientesFuera || [])]),
    placesMap,
    prospectosZona: opts.prospectos,
    feedbacksClientes: opts.feedbacks || new Map(),
    feedbacksProspectos: new Map(),
    revisitClientes: new Map(),
    revisitProspectos: new Map(),
    posiblesClientes: new Map(),
    estados: parseEstados(opts.estados || []),
    precioCajaCanal: 0,
    centroZona: CENTRO,
    enArea: (p) => opts.sinArea ? true : belongsToArea(p, filtro),
    areaActiva: !opts.sinArea,
    asignadosHoy: new Set(),
    now: NOW,
  };
}

const deps = (extra: Partial<PlanDeps> & { baseCercana?: any[] } = {}): PlanDeps => ({
  prospectosCerca: async (lat, lng, radio) => (extra.baseCercana || []).filter((p) => {
    const d = Math.hypot((p.latitud - lat) * 111.32, (p.longitud - lng) * 111.32 * Math.cos((lat * Math.PI) / 180));
    return d <= radio;
  }),
  pasaGate: () => true,
  ...extra,
});

const ids = (r: Awaited<ReturnType<typeof planificarRutas>>, i = 0) => r.porVendedor[i].elegidos.map((c) => c.client_id);

Deno.test("caso Micaela: 1 cliente propio + prospectos del Excel sin reseñas → 8 visitas", async () => {
  const clientes = [cliente("micaela", 40, 0.2, 0.1)];
  const prospectos = Array.from({ length: 10 }, (_, i) => prospecto(0.3 * (i % 4), 0.25 * Math.floor(i / 4)));
  const r = await planificarRutas(armarInput({ vendedores: ["micaela"], clientes, prospectos }), deps());
  assertEquals(r.porVendedor[0].elegidos.length, 8);
  assertEquals(r.porVendedor[0].elegidos.filter((c) => c.es_prospecto).length, 7);
  assertEquals(r.porVendedor[0].cobertura.fuera_de_zona, 0);
});

Deno.test("prospectos en pausa de 15 días igual completan si no hay otra cosa", async () => {
  const hace3 = new Date(NOW.getTime() - 3 * 86400000).toISOString();
  const prospectos = Array.from({ length: 9 }, (_, i) => prospecto(0.2 * i, 0.1, { last_recommendation_at: hace3 }));
  const r = await planificarRutas(armarInput({ vendedores: ["v"], clientes: [], prospectos }), deps());
  assertEquals(r.porVendedor[0].elegidos.length, 8);
});

Deno.test("sin prospectos en la base: Google Maps completa", async () => {
  const clientes = [cliente("v", 10, 0, 0), cliente("v", 12, 0.3, 0)];
  const google = Array.from({ length: 12 }, (_, i) => ({
    ...prospecto(0.2 * (i % 5), 0.2 * Math.floor(i / 5)),
    place_id: `ChIJ${i}`, total_ratings: 80, rating: 4.5, tipo_principal: "wine_bar",
  }));
  let llamadas = 0;
  const r = await planificarRutas(
    armarInput({ vendedores: ["v"], clientes, prospectos: [] }),
    deps({ descubrirEnGoogle: async () => { llamadas++; return google; } }),
  );
  assert(llamadas >= 1 && llamadas <= 5);
  assertEquals(r.porVendedor[0].elegidos.length, 8);
  assertEquals(r.porVendedor[0].cobertura.prospectos_de_maps, 6);
});

Deno.test("Google caído: nunca completa con destinos fuera de 1,5 km", async () => {
  const clientes = [cliente("v", 10, 0, 0)];
  const clientesFuera = Array.from({ length: 4 }, (_, i) => cliente("v", 50, 4 + i * 0.3, 0, "Belgrano"));
  const lejanos = Array.from({ length: 5 }, (_, i) => ({ ...prospecto(-4.5, 0.3 * i), barrio: "Villa Crespo" }));
  const r = await planificarRutas(
    armarInput({ vendedores: ["v"], clientes, clientesFuera, prospectos: [] }),
    deps({ baseCercana: lejanos, descubrirEnGoogle: async () => { throw new Error("403 API key not valid"); } }),
  );
  const v = r.porVendedor[0];
  assertEquals(v.elegidos.length, 1);
  assertEquals(v.cobertura.completa, false);
  assert(v.cobertura.radio_final_km <= 1.5);
  assertEquals(v.cobertura.error_google, "403 API key not valid");
});

Deno.test("cartera completa: se permiten prospectos cuando acortan el recorrido", async () => {
  const clientes = [
    ...Array.from({ length: 7 }, (_, i) => cliente("v", 5 + i, 0.2 * i, 0)),
    ...Array.from({ length: 3 }, (_, i) => cliente("v", 60, 0, 0.2 * (i + 1))),
    ...Array.from({ length: 3 }, (_, i) => cliente("v", 200, -0.2 * (i + 1), 0)),
  ];
  const prospectos = Array.from({ length: 4 }, (_, i) => prospecto(0.1 * i, -0.3));
  const r = await planificarRutas(armarInput({ vendedores: ["v"], clientes, prospectos }), deps());
  const cob = r.porVendedor[0].cobertura;
  assertEquals(r.porVendedor[0].elegidos.length, 8);
  assertEquals(cob.obtenido.cartera_activa + cob.obtenido.reactivacion + cob.obtenido.prospectos, 8);
});

Deno.test("filtro 'perdidos': 8 perdidos si hay", async () => {
  const clientes = [
    ...Array.from({ length: 6 }, (_, i) => cliente("v", 5, 0.2 * i, 0)),
    ...Array.from({ length: 10 }, (_, i) => cliente("v", 150 + i, 0.15 * i, 0.4)),
  ];
  const r = await planificarRutas(
    armarInput({ vendedores: ["v"], clientes, prospectos: [prospecto(0, 0)], estados: ["perdidos"] }),
    deps(),
  );
  const v = r.porVendedor[0];
  assertEquals(v.elegidos.length, 8);
  assert(v.elegidos.filter(c=>!c.es_prospecto).every(c=>c.estado_comercial==="PERDIDO"));
});

Deno.test("filtro 'perdidos + inactivos' que no alcanza: completa y lo informa", async () => {
  const clientes = [
    ...Array.from({ length: 6 }, (_, i) => cliente("v", 5, 0.2 * i, 0)),
    cliente("v", 45, 0, 0.3),
    cliente("v", 120, 0.3, 0.3),
  ];
  const prospectos = Array.from({ length: 3 }, (_, i) => prospecto(0.1 * i, -0.2));
  const r = await planificarRutas(
    armarInput({ vendedores: ["v"], clientes, prospectos, estados: ["Perdidos", "Inactivos"] }),
    deps(),
  );
  const v = r.porVendedor[0];
  assertEquals(v.elegidos.length, 8);
  assertEquals(v.cobertura.fuera_de_seleccion, v.elegidos.filter(c => !["INACTIVO", "PERDIDO"].includes(c.estado_comercial)).length);
});

Deno.test("dos vendedores en la misma zona: 8 cada uno y sin repetir", async () => {
  const clientes = [cliente("a", 10, 0, 0), cliente("b", 10, 0.5, 0.5)];
  const prospectos = Array.from({ length: 20 }, (_, i) => prospecto(0.2 * (i % 5), 0.2 * Math.floor(i / 5)));
  const r = await planificarRutas(armarInput({ vendedores: ["a", "b"], clientes, prospectos }), deps());
  assertEquals(ids(r, 0).length, 8);
  assertEquals(ids(r, 1).length, 8);
  assertEquals(new Set([...ids(r, 0), ...ids(r, 1)]).size, 16);
});

Deno.test("un 'Cerrado' de hace un mes no saca al cliente de la ruta", async () => {
  const c = cliente("v", 10, 0, 0);
  const feedbacks = new Map([[c.row.client_id, [{ motivo_no_visita: "Cerrado", created_at: new Date(NOW.getTime() - 30 * 86400000).toISOString() }]]]);
  const r = await planificarRutas(
    armarInput({ vendedores: ["v"], clientes: [c], prospectos: Array.from({ length: 8 }, (_, i) => prospecto(0.1 * i, 0.1)), feedbacks }),
    deps(),
  );
  assert(ids(r).includes(c.row.client_id));
});

Deno.test("prospectos nuevos de Google y del Excel pueden completar sin reseñas", async () => {
  const google = { ...prospecto(0.1, 0), place_id: "ChIJmalo", total_ratings: 3, rating: 5 };
  const excel = prospecto(0.2, 0);
  const r = await planificarRutas(armarInput({ vendedores: ["v"], clientes: [], prospectos: [google, excel] }), deps());
  const elegidos = ids(r);
  assert(elegidos.includes(excel.place_id));
  assert(elegidos.includes("ChIJmalo"));
});

Deno.test("filtro sin cuentas de ese estado: la ruta cae en la cartera del vendedor, no en la de otro", async () => {
  // Sin área. A tiene perdidos en Palermo; B solo tiene activos a ~17 km.
  const clientesA = Array.from({ length: 8 }, (_, i) => cliente("a", 150, 0.2 * i, 0));
  const clientesB = Array.from({ length: 10 }, (_, i) => cliente("b", 5, 17 + 0.2 * i, 0, "Lejano"));
  const input = armarInput({ vendedores: ["a", "b"], clientes: [...clientesA, ...clientesB], prospectos: [], estados: ["perdidos"], sinArea: true });
  const r = await planificarRutas(input, deps());
  assertEquals(r.porVendedor[0].elegidos.length, 8);
  const b = r.porVendedor[1];
  assertEquals(b.elegidos.length, 8);
  assert(b.elegidos.every((c) => c.vendedor_actual === "b"));
  assertEquals(b.cobertura.fuera_de_seleccion, 8);
});

Deno.test("cartera a más de 15 km del área: informa el déficit sin inventar una ruta larga", async () => {
  const lejos = Array.from({ length: 9 }, (_, i) => cliente("v", 10, 25 + 0.2 * i, 0, "Tigre"));
  const r = await planificarRutas(
    armarInput({ vendedores: ["v"], clientes: [], clientesFuera: lejos, prospectos: [] }),
    deps(),
  );
  assertEquals(r.porVendedor[0].elegidos.length, 0);
  assertEquals(r.porVendedor[0].cobertura.total, 0);
});

Deno.test("ocho clientes dispersos no detienen la búsqueda de vecinos", async () => {
  let llamadas = 0;
  const r = await planificarRutas(
    armarInput({ vendedores: ["v"], clientes: Array.from({ length: 8 }, (_, i) => cliente("v", 150, i * 0.1, 0)), prospectos: [], estados: ["PERDIDO"] }),
    deps({ descubrirEnGoogle: async () => { llamadas++; return []; } }),
  );
  assertEquals(r.porVendedor[0].elegidos.length, 8);
  assert(llamadas > 0);
});

Deno.test("los negocios cerrados se excluyen aunque sean prospectos manuales sin reseñas", async () => {
  const cerrados = [prospecto(0, 0, { estado_negocio: "CLOSED_PERMANENTLY" }), prospecto(0.1, 0, { estado_negocio: "CLOSED_TEMPORARILY" })];
  const r = await planificarRutas(armarInput({ vendedores: ["v"], clientes: [], prospectos: cerrados }), deps());
  assertEquals(r.porVendedor[0].elegidos.length, 0);
});

Deno.test("visitas ocupadas hoy no reaparecen aunque se relaje la pausa", async () => {
  const clientes = [cliente("v", 10, 0, 0)];
  const prospectos = Array.from({ length: 10 }, (_, i) => prospecto(i * 0.1, 0));
  const input = armarInput({ vendedores: ["v"], clientes, prospectos });
  input.asignadosHoy = new Set([clientes[0].row.client_id, prospectos[0].place_id]);
  const r = await planificarRutas(input, deps());
  assertEquals(r.porVendedor[0].elegidos.length, 8);
  assert(r.porVendedor[0].elegidos.every((c) => !input.asignadosHoy.has(c.client_id)));
});

Deno.test("dos núcleos de cartera: elige el que permite completar con siete prospectos", async () => {
  const clientes = [cliente("micaela",45,0,0),cliente("micaela",45,5,0)];
  const prospectos = [prospecto(0.1,0),prospecto(0.2,0),...Array.from({length:8},(_,i)=>prospecto(5+i*0.08,0.1))];
  const r = await planificarRutas(armarInput({vendedores:["micaela"],clientes,prospectos}),deps());
  assertEquals(r.porVendedor[0].cobertura.completa,true);
  assert(ids(r).includes(clientes[1].row.client_id));
  assertEquals(r.porVendedor[0].cobertura.obtenido.prospectos,7);
  assert(r.porVendedor[0].cobertura.radio_final_km<=1.5);
});

Deno.test("si ningún cliente tiene vecinos suficientes, completa ocho prospectos en otro núcleo de la zona", async () => {
  const clientes = [cliente("v",45,0,0)];
  const prospectos = Array.from({length:8},(_,i)=>prospecto(5+i*0.08,0.1));
  const r = await planificarRutas(armarInput({vendedores:["v"],clientes,prospectos}),deps());
  assertEquals(r.porVendedor[0].cobertura.completa,true);
  assertEquals(r.porVendedor[0].cobertura.obtenido.prospectos,8);
});

Deno.test("Google no puede completar con un octavo destino a más de 1,6 km", async () => {
  const clientes = [cliente("v",10,0,0)];
  // A 1,61 km queda fuera incluso de la franja (1,5 a 1,6 km).
  const encontrados = [...Array.from({length:6},(_,i)=>prospecto(0.1*i,0)),prospecto(1.61,0)];
  const radios: number[] = [];
  const r = await planificarRutas(armarInput({vendedores:["v"],clientes,prospectos:[]}),deps({descubrirEnGoogle: async (_lat,_lng,radio)=>{radios.push(radio);return encontrados;}}));
  assertEquals(r.porVendedor[0].elegidos.length,7);
  assertEquals(r.porVendedor[0].cobertura.completa,false);
  assert(radios.every(r=>r<=1.5));
});

Deno.test("un error de Google para un vendedor no impide buscar para los demás", async () => {
  const clientes = [cliente("a",10,0,0),cliente("b",10,5,0)];
  const encontrados = Array.from({length:8},(_,i)=>prospecto(5+0.1*i,0));
  const r=await planificarRutas(armarInput({vendedores:["a","b"],clientes,prospectos:[]}),deps({
    descubrirEnGoogle:async (_lat,_lng,_radio,_objetivo,_excluir,id)=>{if(id==='a') throw Error('503 temporal');return encontrados;}
  }));
  assertEquals(r.porVendedor[0].cobertura.completa,false);
  assertEquals(r.porVendedor[1].cobertura.completa,true);
});

Deno.test("Google reemplaza destinos dispersos por siete prospectos de la misma calle", async () => {
  const clientes = Array.from({length:8},(_,i)=>cliente("v",10,i*0.15,0));
  let busquedas=0;
  const r=await planificarRutas(armarInput({vendedores:["v"],clientes,prospectos:[]}),deps({
    descubrirEnGoogle:async(lat,lng,radio)=>{
      busquedas++;
      return Array.from({length:7},(_,i)=>({...prospecto(0,0),place_id:`vecino-${i}`,nombre:`Comercio distinto ${i}`,
        direccion:`Calle comercial ${100+i*10}`,latitud:lat,longitud:lng+(i+1)*0.00005}));
    }
  }));
  const ruta=r.porVendedor[0];
  assert(busquedas>0);assertEquals(ruta.elegidos.length,8);
  assertEquals(ruta.elegidos.filter(c=>c.es_prospecto).length,7);
  assert(ruta.cobertura.radio_final_km<0.15);
});
