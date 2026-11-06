// Ubicación de direcciones de CABA con USIG (Gobierno de la Ciudad): gratis y sin clave.
// Se usa solo cuando no hay clave de Google. En la prueba del 06/11 ubicó 21 de 25
// direcciones reales de clientes, todas a menos de 100 m. No cubre provincia.

const NORMALIZAR = "https://servicios.usig.buenosaires.gob.ar/normalizar/";
const DATOS_UTILES = "https://ws.usig.buenosaires.gob.ar/datos_utiles";

export interface UbicacionUsig {
  lat: number; lng: number; formatted_address: string; location_type: string;
  barrio: string | null; comuna: string | null; ciudad: string; provincia: string;
  postal_code: string | null; admin_area_level_2: string | null; barrio_fallback_admin2: string | null; place_id: null;
}

type Fetch = typeof fetch;
const pedir = async (url: string, f: Fetch) => {
  const r = await f(url, { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`USIG ${r.status}`);
  return r.json();
};

/** Barrio, comuna y código postal de un punto de CABA. Null si el punto no es de CABA. */
export async function datosUtilesUsig(lat: number, lng: number, f: Fetch = fetch) {
  const d = await pedir(`${DATOS_UTILES}?${new URLSearchParams({ x: String(lng), y: String(lat) })}`, f);
  if (!d?.barrio) return null;
  return { barrio: String(d.barrio), comuna: d.comuna ? String(d.comuna) : null, postal_code: d.codigo_postal ? String(d.codigo_postal) : null };
}

/** Ubica "calle altura" en CABA. Null si USIG no encuentra una dirección exacta de CABA. */
export async function geocodificarUsig(direccion: string, f: Fetch = fetch): Promise<UbicacionUsig | null> {
  const calle = direccion.split(",")[0].trim();
  if (!/\d/.test(calle)) return null;
  const j = await pedir(`${NORMALIZAR}?${new URLSearchParams({ direccion: `${calle}, caba`, geocodificar: "TRUE", srid: "4326" })}`, f);
  const d = Array.isArray(j?.direccionesNormalizadas) ? j.direccionesNormalizadas[0] : null;
  const lat = Number(d?.coordenadas?.y), lng = Number(d?.coordenadas?.x);
  if (!d || d.cod_partido !== "caba" || d.tipo !== "calle_altura" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const extra = await datosUtilesUsig(lat, lng, f).catch(() => null);
  return {
    lat, lng, formatted_address: String(d.direccion), location_type: "USIG",
    barrio: extra?.barrio ?? null, comuna: extra?.comuna ?? null, ciudad: "CABA",
    provincia: "Ciudad Autónoma de Buenos Aires", postal_code: extra?.postal_code ?? null,
    admin_area_level_2: extra?.comuna ?? null, barrio_fallback_admin2: extra?.barrio ?? null, place_id: null,
  };
}
