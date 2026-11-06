// Selección de visitas por valor (Etapa 3). Módulo puro: la distancia se inyecta.
//
// Acordado con Lautaro (DECISIONES.md, 2026-11-04 a 06):
// - Se elige por valor, no por cercanía. La distancia entra como el factor recorrido
//   (peso 35): cuánto alarga la ruta cada candidato, comparado con los demás. 1 = no la
//   alarga, 0 = el que más la alarga. No hay otra penalización por distancia.
// - Límite duro: la ruta completa no puede pasar el tope de recorrido.
// - Franja: un local entre el radio y la franja entra si su valor menos la penalización
//   supera al peor elegido. Máximo un cambio por ruta.
// - Un cliente con varios locales entra una sola vez, en el local que menos alarga la ruta.
// - Si no hay suficientes, se devuelven los que haya, con aviso.
// - El orden final es el óptimo exacto (con 8 puntos es barato).
import { type Factores, PESOS_POR_DEFECTO, type Pesos, valor } from "./valor.ts";

export type Punto = { lat: number; lng: number };
export type Distancia = (a: Punto, b: Punto) => number;
export type Local = Punto & { place_id?: string | null };

export interface CandidatoRuta {
  id: string;
  /** Factores sin recorrido: lo agrega la selección. */
  factores: Omit<Factores, "recorrido">;
  locales: Local[];
}

export interface ParametrosSeleccion {
  limite: number;
  radioKm: number;
  franjaKm: number;
  /** En puntos de valor (0 a 100). */
  penalizacionFranja: number;
  maxCambiosFranja: number;
  /** Largo máximo de la ruta, desde el punto de partida. */
  topeKm: number;
  pesos: Pesos;
}

export const PARAMETROS_POR_DEFECTO: ParametrosSeleccion = {
  limite: 8,
  radioKm: 1.5,
  franjaKm: 1.6,
  penalizacionFranja: 17,
  maxCambiosFranja: 1,
  topeKm: 3.5,
  pesos: PESOS_POR_DEFECTO,
};

export interface Elegido {
  id: string;
  local: Local;
  /** Valor sin el factor recorrido: es el que se compara para la franja. */
  valorSinRecorrido: number;
  /** Valor con el que entró, incluido el recorrido en ese momento. */
  valor: number;
  enFranja: boolean;
}

export interface ResultadoSeleccion {
  elegidos: Elegido[];
  km: number;
  avisos: string[];
}

/** Largo de un recorrido abierto, en el orden dado. */
export function largo(puntos: Punto[], dist: Distancia): number {
  let km = 0;
  for (let i = 1; i < puntos.length; i++) km += dist(puntos[i - 1], puntos[i]);
  return km;
}

/**
 * Orden exacto que minimiza el recorrido, empezando en cualquiera de los puntos
 * (programación dinámica sobre subconjuntos). Con 8 puntos son unas 16.000 cuentas.
 * Si se da `inicio`, el recorrido sale desde ahí.
 */
export function ordenExacto<T extends Punto>(puntos: T[], dist: Distancia, inicio?: Punto): T[] {
  const n = puntos.length;
  if (n <= 1) return [...puntos];
  if (n > 12) throw new Error("Demasiados puntos para el orden exacto");
  const d = puntos.map((a) => puntos.map((b) => dist(a, b)));
  const total = 1 << n;
  const costo = new Float64Array(total * n).fill(Infinity);
  const previo = new Int8Array(total * n).fill(-1);
  for (let j = 0; j < n; j++) costo[(1 << j) * n + j] = inicio ? dist(inicio, puntos[j]) : 0;
  for (let mask = 1; mask < total; mask++) {
    for (let j = 0; j < n; j++) {
      const actual = costo[mask * n + j];
      if (!(mask & (1 << j)) || actual === Infinity) continue;
      for (let k = 0; k < n; k++) {
        if (mask & (1 << k)) continue;
        const siguiente = mask | (1 << k);
        const c = actual + d[j][k];
        if (c < costo[siguiente * n + k]) {
          costo[siguiente * n + k] = c;
          previo[siguiente * n + k] = j;
        }
      }
    }
  }
  const lleno = total - 1;
  let fin = 0;
  for (let j = 1; j < n; j++) if (costo[lleno * n + j] < costo[lleno * n + fin]) fin = j;
  const orden: T[] = [];
  for (let mask = lleno, j = fin; j >= 0;) {
    orden.push(puntos[j]);
    const p = previo[mask * n + j];
    mask &= ~(1 << j);
    j = p;
  }
  return orden.reverse();
}

/** Cuánto alarga la ruta insertar `p` en el mejor lugar. La ruta empieza en ruta[0]. */
function costoInsercion(ruta: Punto[], p: Punto, dist: Distancia): number {
  let mejor = dist(ruta[ruta.length - 1], p);
  for (let i = 0; i < ruta.length - 1; i++) {
    const extra = dist(ruta[i], p) + dist(p, ruta[i + 1]) - dist(ruta[i], ruta[i + 1]);
    if (extra < mejor) mejor = extra;
  }
  return mejor;
}

function insertar(ruta: Punto[], p: Punto, dist: Distancia): Punto[] {
  let mejor = [...ruta, p], extraMejor = dist(ruta[ruta.length - 1], p);
  for (let i = 0; i < ruta.length - 1; i++) {
    const extra = dist(ruta[i], p) + dist(p, ruta[i + 1]) - dist(ruta[i], ruta[i + 1]);
    if (extra < extraMejor) {
      extraMejor = extra;
      mejor = [...ruta.slice(0, i + 1), p, ...ruta.slice(i + 1)];
    }
  }
  return mejor;
}

/**
 * Elige hasta `limite` visitas que maximizan el valor sin pasarse del tope.
 * `distRecta` sirve para descartar (nunca supera a la real); `dist` decide.
 */
export function seleccionarPorValor(
  centro: Punto,
  candidatos: CandidatoRuta[],
  dist: Distancia,
  distRecta: Distancia,
  parametros: Partial<ParametrosSeleccion> = {},
): ResultadoSeleccion {
  const p = { ...PARAMETROS_POR_DEFECTO, ...parametros, pesos: { ...PARAMETROS_POR_DEFECTO.pesos, ...parametros.pesos } };
  const avisos: string[] = [];
  const sinRecorrido = (c: CandidatoRuta) => valor({ ...c.factores, recorrido: null }, p.pesos);

  // Prefiltro en línea recta: lo que está más lejos que la franja no puede entrar.
  const preparados = candidatos.map((c) => ({
    c,
    adentro: c.locales.filter((l) => distRecta(centro, l) <= p.radioKm),
    franja: c.locales.filter((l) => { const d = distRecta(centro, l); return d > p.radioKm && d <= p.franjaKm; }),
  })).filter((x) => x.adentro.length || x.franja.length);

  // 1) Dentro del radio, de a uno: el de mayor valor con su recorrido en ese momento.
  let ruta: Punto[] = [centro];
  const elegidos: Elegido[] = [];
  let restantes = preparados.filter((x) => x.adentro.length);
  while (elegidos.length < p.limite && restantes.length) {
    const opciones = restantes.map((x) => {
      let local = x.adentro[0], extra = Infinity;
      for (const l of x.adentro) {
        const e = costoInsercion(ruta, l, dist);
        if (e < extra) { extra = e; local = l; }
      }
      return { x, local, extra };
    }).filter((o) => largo(ruta, dist) + o.extra <= p.topeKm + 1e-9);
    if (!opciones.length) {
      avisos.push(`El tope de ${p.topeKm} km no deja sumar más visitas.`);
      break;
    }
    const maxExtra = Math.max(...opciones.map((o) => o.extra));
    const puntuar = (o: typeof opciones[number]) =>
      valor({ ...o.x.c.factores, recorrido: maxExtra > 0 ? 1 - o.extra / maxExtra : 1 }, p.pesos);
    opciones.sort((a, b) => puntuar(b) - puntuar(a) || a.x.c.id.localeCompare(b.x.c.id));
    const gana = opciones[0];
    elegidos.push({ id: gana.x.c.id, local: gana.local, valorSinRecorrido: sinRecorrido(gana.x.c), valor: puntuar(gana), enFranja: false });
    ruta = insertar(ruta, gana.local, dist);
    restantes = restantes.filter((x) => x !== gana.x);
  }

  // 2) Franja: un local apenas afuera reemplaza al peor (o completa un lugar libre) si,
  //    aun penalizado, vale más. Máximo un cambio, y la ruta tiene que seguir dentro del tope.
  const elegidosIds = new Set(elegidos.map((e) => e.id));
  const franja = preparados.filter((x) => !elegidosIds.has(x.c.id) && x.franja.length)
    .map((x) => ({ x, valor: sinRecorrido(x.c) - p.penalizacionFranja }))
    .sort((a, b) => b.valor - a.valor || a.x.c.id.localeCompare(b.x.c.id));
  let cambios = 0;
  for (const f of franja) {
    if (cambios >= p.maxCambiosFranja) break;
    const lleno = elegidos.length >= p.limite;
    const peor = lleno ? elegidos.reduce((a, b) => (b.valorSinRecorrido < a.valorSinRecorrido ? b : a)) : null;
    if (peor && f.valor <= peor.valorSinRecorrido) continue;
    const base = elegidos.filter((e) => e !== peor);
    const local = f.x.franja.reduce((a, b) =>
      costoInsercion([centro, ...base.map((e) => e.local)], b, dist) < costoInsercion([centro, ...base.map((e) => e.local)], a, dist) ? b : a);
    const prueba = ordenExacto([...base.map((e) => e.local), local], dist, centro);
    if (largo([centro, ...prueba], dist) > p.topeKm + 1e-9) continue;
    if (peor) elegidos.splice(elegidos.indexOf(peor), 1);
    elegidos.push({ id: f.x.c.id, local, valorSinRecorrido: sinRecorrido(f.x.c), valor: f.valor, enFranja: true });
    cambios++;
  }

  if (elegidos.length < p.limite) {
    avisos.push(`Hay ${elegidos.length} visitas que valen la pena en la zona; no se completan las ${p.limite}.`);
  }
  const orden = ordenExacto(elegidos.map((e) => ({ ...e.local, e })), dist, centro).map((x) => x.e);
  return { elegidos: orden, km: largo([centro, ...orden.map((e) => e.local)], dist), avisos };
}
