// Locales e identidad de clientes. Módulo puro.

/** Dos coordenadas del mismo cliente a menos de esta distancia son el mismo local. */
export const RADIO_MISMO_LOCAL_M = 300;

export type Punto = { lat: number; long: number; peso: number };
export type Local<T extends Punto> = { principal: T; peso: number; puntos: T[] };

function metros(a: Punto, b: Punto): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.long - a.long) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * Agrupa las coordenadas de un cliente en locales. Cada local queda representado por la
 * coordenada más usada. Se devuelven de menor a mayor peso: el último es el local principal.
 */
export function agruparLocales<T extends Punto>(puntos: T[], radio = RADIO_MISMO_LOCAL_M): Local<T>[] {
  const locales: Local<T>[] = [];
  for (const punto of [...puntos].sort((a, b) => b.peso - a.peso)) {
    const cercano = locales.find((l) => metros(l.principal, punto) <= radio);
    if (cercano) {
      cercano.puntos.push(punto);
      cercano.peso += punto.peso;
    } else {
      locales.push({ principal: punto, peso: punto.peso, puntos: [punto] });
    }
  }
  return locales.sort((a, b) => a.peso - b.peso);
}

const SUFIJOS = /\b(S\s?R\s?L|S\s?A\s?S|S\s?A\s?U|S\s?A|S\s?H|S\s?C|SOCIEDAD ANONIMA|SRL|SAS|SAU|SH|SC|CIA|LTDA)\b/g;

/** Clave para comparar nombres de comercio: sin mayúsculas, acentos, puntos ni sufijos societarios. */
export function claveNombre(nombre: string | null | undefined): string | null {
  if (!nombre) return null;
  const clave = nombre.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\./g, "").replace(/[^A-Z0-9 ]/g, " ").replace(SUFIJOS, " ").replace(/\s+/g, " ").trim();
  return clave.length >= 4 ? clave : null;
}

export type ClienteParaComparar = { client_id: string; documento: string | null; nombres: string[] };
export type PosibleDuplicado = { nombre: string; clientes: { client_id: string; documento: string | null }[] };

/** Clientes distintos con el mismo nombre. Se avisan para revisar: nunca se unen solos. */
export function posiblesDuplicados(clientes: ClienteParaComparar[]): PosibleDuplicado[] {
  const porClave = new Map<string, { nombre: string; ids: Map<string, string | null> }>();
  for (const cliente of clientes) {
    for (const nombre of cliente.nombres) {
      const clave = claveNombre(nombre);
      if (!clave) continue;
      const grupo = porClave.get(clave) || { nombre, ids: new Map() };
      grupo.ids.set(cliente.client_id, cliente.documento);
      porClave.set(clave, grupo);
    }
  }
  const vistos = new Set<string>();
  const resultado: PosibleDuplicado[] = [];
  for (const { nombre, ids } of porClave.values()) {
    if (ids.size < 2) continue;
    const firma = [...ids.keys()].sort().join("|");
    if (vistos.has(firma)) continue;
    vistos.add(firma);
    resultado.push({ nombre, clientes: [...ids].map(([client_id, documento]) => ({ client_id, documento })) });
  }
  return resultado;
}

/** Otros nombres con que aparece un mismo cliente, sin repetir variantes de escritura. */
export function nombresAlternativos(principal: string | null, nombres: Iterable<string>): string[] {
  const vistas = new Set([claveNombre(principal)]);
  const resultado: string[] = [];
  for (const nombre of nombres) {
    const clave = claveNombre(nombre);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    resultado.push(nombre);
  }
  return resultado;
}
