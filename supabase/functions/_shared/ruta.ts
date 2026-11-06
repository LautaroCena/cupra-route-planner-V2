/** Contrato comercial compartido por el servidor, la interfaz y la base (guardar_ruta_mapa). */
export const VISITAS_POR_DIA = 8;
export const RADIO_RUTA_KM = 1.5;
/** Un local apenas afuera del radio puede entrar si vale mucho (_shared/seleccion.ts). */
export const FRANJA_RUTA_KM = 1.6;
export const MAX_EN_FRANJA = 1;
export interface Coordenada { lat: number; lng: number }

export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Valida una ruta antes de guardarla. Hasta 8 visitas (menos es válido: no hay 8 que
 * valgan la pena en la zona). `completa` exige exactamente 8.
 */
export function errorRuta(puntos: (Coordenada & { id: string })[], centro: Coordenada | null, completa = false): string | null {
  if (!puntos.length) return "La ruta no tiene visitas.";
  if (puntos.length > VISITAS_POR_DIA) return `La ruta no puede tener más de ${VISITAS_POR_DIA} visitas.`;
  if (completa && puntos.length !== VISITAS_POR_DIA) return `La ruta debe tener ${VISITAS_POR_DIA} visitas.`;
  if (!centro || !Number.isFinite(centro.lat) || !Number.isFinite(centro.lng)) return "Falta el centro de la ruta.";
  if (new Set(puntos.map(p => p.id)).size !== puntos.length) return "La ruta contiene destinos repetidos.";
  if (puntos.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || distanciaKm(centro, p) > FRANJA_RUTA_KM)) {
    return "Hay destinos fuera del radio máximo de 1,5 km (1,6 km para uno solo).";
  }
  if (puntos.filter(p => distanciaKm(centro, p) > RADIO_RUTA_KM).length > MAX_EN_FRANJA) {
    return "Solo un destino puede estar entre 1,5 y 1,6 km.";
  }
  return null;
}
