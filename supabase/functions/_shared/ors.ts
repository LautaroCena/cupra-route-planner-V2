// Distancias a pie con OpenRouteService (gratis con cuenta: 500 matrices y 2.000 recorridos por día).
// Se usa solo si está el secreto ORS_API_KEY; si no, todo sigue en línea recta.
// En la prueba del 06/11, caminar fue 1,26 veces la línea recta (mediana; 1,14 a 1,39).

export interface Punto { lat: number; lng: number }
type Fetch = typeof fetch;

// api.openrouteservice.org quedó obsoleta; la nueva dirección es api.heigit.org (misma clave y cupo).
const BASE = "https://api.heigit.org/openrouteservice/v2";
/** Lo que se camina de más, en promedio, frente a la línea recta. Solo para pares sin dato. */
export const FACTOR_CAMINATA = 1.26;
/** 50 × 50 = 2.500 tramos, debajo del límite de 3.500 por consulta. */
export const MAX_PUNTOS_MATRIZ = 50;

export function claveOrs(): string | null {
  try { return Deno.env.get("ORS_API_KEY")?.trim() || null; } catch { return null; }
}

async function pedir(ruta: string, cuerpo: unknown, clave: string, f: Fetch) {
  const r = await f(`${BASE}${ruta}`, {
    method: "POST", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: clave, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw new Error(`OpenRouteService respondió ${r.status}`);
  return r.json();
}

/** Matriz de km caminando entre todos los puntos. Null si no hay clave. */
export async function matrizCaminata(puntos: Punto[], clave = claveOrs(), f: Fetch = fetch): Promise<number[][] | null> {
  if (!clave || puntos.length < 2) return null;
  if (puntos.length > MAX_PUNTOS_MATRIZ) throw new Error(`Máximo ${MAX_PUNTOS_MATRIZ} puntos por consulta`);
  const j = await pedir("/matrix/foot-walking", { locations: puntos.map((p) => [p.lng, p.lat]), metrics: ["distance"], units: "km" }, clave, f);
  const m = j?.distances;
  if (!Array.isArray(m) || m.length !== puntos.length || m.some((fila: unknown) => !Array.isArray(fila) || fila.length !== puntos.length)) {
    throw new Error("OpenRouteService devolvió una matriz incompleta");
  }
  return m.map((fila: unknown[]) => fila.map((v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : NaN)));
}

/** Función de distancia que usa la matriz y, si falta un par, la línea recta por el factor promedio. */
export function distanciaDesdeMatriz(puntos: Punto[], matriz: number[][], recta: (a: Punto, b: Punto) => number) {
  const clave = (p: Punto) => `${p.lat},${p.lng}`;
  const idx = new Map(puntos.map((p, i) => [clave(p), i]));
  return (a: Punto, b: Punto) => {
    const i = idx.get(clave(a)), j = idx.get(clave(b));
    const v = i === undefined || j === undefined ? NaN : matriz[i][j];
    return Number.isFinite(v) ? v : recta(a, b) * FACTOR_CAMINATA;
  };
}

/** Recorrido a pie en el orden dado: metros y minutos totales. Null si no hay clave. */
export async function recorridoCaminata(puntos: Punto[], clave = claveOrs(), f: Fetch = fetch): Promise<{ metros: number; minutos: number } | null> {
  if (!clave || puntos.length < 2) return null;
  const j = await pedir("/directions/foot-walking", { coordinates: puntos.map((p) => [p.lng, p.lat]) }, clave, f);
  const s = j?.routes?.[0]?.summary;
  if (!Number.isFinite(s?.distance) || !Number.isFinite(s?.duration)) throw new Error("OpenRouteService no devolvió el recorrido");
  return { metros: Math.round(s.distance), minutos: Math.ceil(s.duration / 60) };
}
