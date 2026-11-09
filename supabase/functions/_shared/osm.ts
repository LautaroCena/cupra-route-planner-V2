// Prospectos desde OpenStreetMap (gratis, sin clave), por barrio de CABA.
// Sirven mientras no haya clave de Google. Traen menos datos: sin reseñas ni estado de
// cerrado, y pocas veces teléfono. Por eso el potencial sale del rubro (ver potencialOsm).
// Datos © OpenStreetMap, licencia ODbL: hay que citarlo donde se muestren.

export const PREFIJO_OSM = "osm-";
const CAJA_CABA = "(-34.71,-58.54,-34.52,-58.33)";

/** Etiqueta de OSM → tipo con el que la base ya calcula el rubro (los mismos de Google). */
const TIPO_POR_ETIQUETA: Record<string, string> = {
  "shop=wine": "liquor_store", "shop=alcohol": "liquor_store", "shop=beverages": "liquor_store",
  "amenity=restaurant": "restaurant", "amenity=bar": "bar", "amenity=pub": "pub",
  "shop=deli": "deli", "shop=supermarket": "supermarket", "shop=convenience": "convenience_store",
  "tourism=hotel": "hotel",
};

/**
 * Potencial (0 a 100) por rubro, porque OSM no trae reseñas. Criterio propio, a revisar
 * con datos: las vinotecas compran vino seguro; un almacén, a veces. Más bajo que un
 * prospecto que cargó el equipo (70), que ya fue filtrado por alguien que conoce el negocio.
 */
const POTENCIAL_POR_TIPO: Record<string, number> = {
  liquor_store: 60, restaurant: 50, bar: 50, pub: 45, hotel: 50, deli: 45, supermarket: 35, convenience_store: 30,
};
export const potencialOsm = (tipo: string | null | undefined) => POTENCIAL_POR_TIPO[String(tipo || "")] ?? 30;

/** Los 48 barrios de CABA, escritos como en OpenStreetMap (límite administrativo nivel 9). */
export const BARRIOS_CABA = ["Agronomía", "Almagro", "Balvanera", "Barracas", "Belgrano", "Boedo", "Caballito", "Chacarita", "Coghlan", "Colegiales", "Constitución", "Flores", "Floresta", "La Boca", "La Paternal", "Liniers", "Mataderos", "Monserrat", "Monte Castro", "Nueva Pompeya", "Núñez", "Palermo", "Parque Avellaneda", "Parque Chacabuco", "Parque Chas", "Parque Patricios", "Puerto Madero", "Recoleta", "Retiro", "Saavedra", "San Cristóbal", "San Nicolás", "San Telmo", "Vélez Sarsfield", "Versalles", "Villa Crespo", "Villa del Parque", "Villa Devoto", "Villa General Mitre", "Villa Lugano", "Villa Luro", "Villa Ortúzar", "Villa Pueyrredón", "Villa Real", "Villa Riachuelo", "Villa Santa Rita", "Villa Soldati", "Villa Urquiza"] as const;

const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Devuelve el barrio de CABA tal como está en OSM, o null si no es uno de los 48. */
export function barrioValido(barrio: unknown): string | null {
  const b = typeof barrio === "string" ? clave(barrio) : "";
  return BARRIOS_CABA.find((x) => clave(x) === b) ?? null;
}

/** Consulta Overpass: negocios del rubro dentro del barrio (límite administrativo nivel 9). */
export function consultaOverpass(barrio: string): string {
  const area = `area["boundary"="administrative"]["admin_level"="9"]["name"="${barrio.replace(/"/g, "")}"]${CAJA_CABA}->.a;`;
  return `[out:json][timeout:90];${area}(` +
    `nwr["shop"~"^(wine|alcohol|beverages|deli|supermarket|convenience)$"](area.a);` +
    `nwr["amenity"~"^(restaurant|bar|pub)$"](area.a);` +
    `nwr["tourism"="hotel"](area.a););out center tags;`;
}

export interface ProspectoOsm {
  place_id: string; nombre: string; direccion: string | null; telefono: string | null; website: string | null;
  latitud: number; longitud: number; tipo_principal: string; tipos: string[];
  barrio: string; ciudad: string; provincia: string;
}

/** Convierte la respuesta de Overpass en filas de prospectos. Descarta lo que no tiene nombre o tipo. */
export function prospectosDesdeOsm(respuesta: any, barrio: string): ProspectoOsm[] {
  const filas: ProspectoOsm[] = [];
  for (const e of Array.isArray(respuesta?.elements) ? respuesta.elements : []) {
    const t = e?.tags || {};
    const etiqueta = ["shop", "amenity", "tourism"].map((k) => (t[k] ? `${k}=${t[k]}` : "")).find((k) => TIPO_POR_ETIQUETA[k]);
    const lat = Number(e.lat ?? e.center?.lat), lng = Number(e.lon ?? e.center?.lon);
    const nombre = String(t.name || "").trim();
    if (!etiqueta || !nombre || !Number.isFinite(lat) || !Number.isFinite(lng) || !["node", "way", "relation"].includes(e.type)) continue;
    const calle = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ").trim();
    filas.push({
      place_id: `${PREFIJO_OSM}${e.type}-${e.id}`, nombre: nombre.slice(0, 200),
      direccion: calle || null,
      telefono: String(t.phone || t["contact:phone"] || "").trim().slice(0, 60) || null,
      website: String(t.website || t["contact:website"] || "").trim().slice(0, 300) || null,
      latitud: lat, longitud: lng, tipo_principal: TIPO_POR_ETIQUETA[etiqueta], tipos: [TIPO_POR_ETIQUETA[etiqueta]],
      barrio, ciudad: "CABA", provincia: "Ciudad Autónoma de Buenos Aires",
    });
  }
  return filas;
}
