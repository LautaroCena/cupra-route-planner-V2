import { seleccionarPorValor } from "../_shared/seleccion.ts";
import { factoresProspecto } from "../_shared/prospecto-valor.ts";
import { addressKey } from "../_shared/prospect-identity.ts";
import { googleMapsFetch, type GooglePlace, PLACES_FIELD_MASK } from "../_shared/google-maps.ts";
import { centroClientes, coordenadaMapaValida, distanciaAlCliente, RADIOS_BUSQUEDA_MAPA, type PuntoMapa } from "../_shared/map-selection.ts";
import { distanciaKm, RADIO_RUTA_KM, type Coordenada } from "../_shared/ruta.ts";
import { esProspectoComercialmenteValido, normalizeFantasyName } from "../_shared/portfolio-ranking.ts";
import { origenProspecto, rubroKey } from "../_shared/reglas.ts";
import { candidatoRegalos, rubroDeTipos, tiposGoogleParaRubros } from "../_shared/prospect-categories.ts";
import { ProspectPersistenceError } from "../_shared/prospect-review-service.ts";

export interface ProspectoMapa {
  place_id: string; google_place_id?: string | null; nombre: string; huella?: string; website?: string | null; resumen_google?: string | null;
  latitud: number | null; longitud: number | null; direccion?: string | null;
  barrio?: string | null; ciudad?: string | null; comuna?: string | null; provincia?: string | null;
  rubro?: string | null; telefono?: string | null; rating?: number | null; total_ratings?: number | null;
  tipo_principal?: string | null; tipos?: string[] | null; estado_negocio?: string | null;
  client_id?: string | null; es_cliente_cupra?: boolean | null;
}
export const TIPOS_MAPA = ["liquor_store", "wine_bar", "restaurant", "bar", "hotel"];
export function tiposBusquedaMapa(rubros: string[], regalos = false): string[] {
  return tiposGoogleParaRubros(new Set(rubros), regalos);
}
export function prospectoDeGoogle(place: GooglePlace): ProspectoMapa | null {
  const lat = place.location?.latitude, lng = place.location?.longitude;
  if (!place.id || !place.displayName?.text?.trim() || !coordenadaMapaValida({ lat, lng })) return null;
  const component = (...types: string[]) => place.addressComponents?.find(c => c.types?.some(t => types.includes(t)))?.longText || null;
  const pais = place.addressComponents?.find(c => c.types?.includes("country"));
  if (pais && pais.shortText !== "AR" && pais.longText !== "Argentina") return null;
  const comuna = component("administrative_area_level_2");
  const rubro = rubroDeTipos(place.primaryType, place.types);
  return { place_id: place.id, nombre: place.displayName.text.trim(), latitud: lat!, longitud: lng!,
    direccion: place.formattedAddress || place.displayName.text.trim(), barrio: component("neighborhood", "sublocality_level_1", "sublocality"),
    ciudad: component("locality") || comuna || "", provincia: component("administrative_area_level_1") || "",
    comuna: comuna?.toLowerCase().startsWith("comuna") ? comuna : null,
    rubro, telefono: place.nationalPhoneNumber || place.internationalPhoneNumber || null,
    website: place.websiteUri || null, resumen_google: place.editorialSummary?.text || null,
    tipo_principal: place.primaryType || null, tipos: place.types || [],
    rating: place.rating || null, total_ratings: place.userRatingCount || null,
    estado_negocio: place.businessStatus || null, es_cliente_cupra: false };
}

export function prospectoDisponible(p: ProspectoMapa): boolean {
  return Boolean(p.place_id && p.nombre) && !p.es_cliente_cupra && !p.client_id
    && !["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"].includes(p.estado_negocio || "")
    && coordenadaMapaValida({ lat: p.latitud, lng: p.longitud })
    && (origenProspecto(p) !== "google" || esProspectoComercialmenteValido(p));
}
export function puntoProspecto(p: ProspectoMapa, clientes: Coordenada[], centroZona?: Coordenada): PuntoMapa {
  const point = { lat: p.latitud!, lng: p.longitud! };
  const centro = clientes.length ? centroClientes(clientes) : centroZona;
  if (!centro) throw new Error("Falta el centro de la búsqueda.");
  return { key: `P:${p.place_id}`, tipo: "prospecto", id: p.place_id, nombre: p.nombre, ...point,
    direccion: p.direccion || "", barrio: p.barrio || null, ciudad: p.ciudad || null, comuna: p.comuna || null,
    rubro: p.rubro || null, estado: "POTENCIAL", vendedor: null, dias: null, ventas: null,
    telefono: p.telefono || null, rating: p.rating || null, resenas: p.total_ratings || null,
    distancia_centro_m: Math.round(distanciaKm(centro, point) * 1000),
    distancia_cliente_m: clientes.length ? Math.round(distanciaAlCliente(point, clientes) * 1000) : undefined };
}

export function mismoProspecto(a: ProspectoMapa, b: ProspectoMapa): boolean {
  if (a.place_id === b.place_id || (a.google_place_id || a.place_id) === (b.google_place_id || b.place_id)) return true;
  const nombre = normalizeFantasyName(a.nombre);
  return Boolean(nombre) && nombre === normalizeFantasyName(b.nombre)
    && Boolean(addressKey(a.direccion)) && addressKey(a.direccion) === addressKey(b.direccion)
    && distanciaKm({lat:a.latitud!,lng:a.longitud!},{lat:b.latitud!,lng:b.longitud!}) < 0.05;
}

/** Distancia primero; la valoración sólo desempata lugares a igual distancia. */
export function ordenarProspectos(lista: ProspectoMapa[], centro: Coordenada): ProspectoMapa[] {
  const ordered = [...lista].sort((a, b) =>
    Math.round(distanciaKm(centro, { lat: a.latitud!, lng: a.longitud! }) * 1000)
    - Math.round(distanciaKm(centro, { lat: b.latitud!, lng: b.longitud! }) * 1000)
    || (b.rating || 0) - (a.rating || 0) || (b.total_ratings || 0) - (a.total_ratings || 0) || a.place_id.localeCompare(b.place_id));
  const unique: ProspectoMapa[] = [];
  for (const p of ordered) if (!unique.some(prev => mismoProspecto(prev, p))) unique.push(p);
  return unique;
}

export interface BusquedaMapa {
  clientes: Coordenada[];
  centroZona?: Coordenada;
  objetivo: number;
  base: ProspectoMapa[];
  rubros: string[];
  regalos?: boolean;
  pasaGate: (p: ProspectoMapa) => boolean;
  descubrir?: (centro: Coordenada, radioKm: number, tipos: string[]) => Promise<ProspectoMapa[]>;
  cubrirZona?: (centro: Coordenada, tipos: string[]) => Promise<ProspectoMapa[]>;
}
/** Busca desde el centro sin moverlo, empezando a 150 m y ampliando sólo si faltan visitas. */
export async function buscarComplementoMapa(opts: BusquedaMapa) {
  const centro = opts.clientes.length ? centroClientes(opts.clientes) : opts.centroZona;
  if (!centro || !coordenadaMapaValida(centro)) throw new Error("Elegí un barrio o seleccioná clientes para definir el centro.");
  if (opts.clientes.some(c => distanciaKm(centro, c) > RADIO_RUTA_KM)) throw new Error("Los clientes superan el radio de 1,5 km respecto de su centro.");
  if (!Number.isInteger(opts.objetivo) || opts.objetivo < 1 || opts.objetivo > 8 - opts.clientes.length) throw new Error("Cantidad de prospectos inválida.");
  const todos = new Map(opts.base.map(p => [p.place_id, p]));
  const rubros = new Set(opts.rubros.map(rubroKey));
  const tipos = tiposBusquedaMapa(opts.rubros, opts.regalos);
  let radio = 0, googleError = false;
  const avisos: string[] = [];
  if (!opts.descubrir) avisos.push("La búsqueda en Google no está disponible; se usaron los prospectos guardados.");
  else if (!tipos.length) avisos.push("Este rubro no tiene una búsqueda disponible en Google; se usaron los prospectos guardados de ese rubro.");
  const validos = () => ordenarProspectos([...todos.values()].filter(p => prospectoDisponible(p)
    && distanciaKm(centro, { lat: p.latitud!, lng: p.longitud! }) <= radio
    && (!opts.regalos || candidatoRegalos(p))
    && (!rubros.size || rubros.has(rubroKey(p.rubro))) && opts.pasaGate(p)), centro);
  const agregar = (nuevos: ProspectoMapa[]) => {
    // La base es autoridad: no reabrir negocios cerrados ni reemplazar IDs de Excel.
    for (const p of nuevos) {
      const known = todos.get(p.place_id);
      if (known) todos.set(p.place_id, { ...known, ...p,
        client_id: known.client_id || p.client_id, es_cliente_cupra: known.es_cliente_cupra || p.es_cliente_cupra,
        estado_negocio: ["CLOSED_PERMANENTLY","CLOSED_TEMPORARILY"].includes(known.estado_negocio || "") ? known.estado_negocio : p.estado_negocio });
      else if (!opts.base.some(known => mismoProspecto(known, p))) todos.set(p.place_id, p);
    }
  };
  for (radio of RADIOS_BUSQUEDA_MAPA) {
    if (opts.descubrir && tipos.length && !googleError) {
      try {
        agregar(await opts.descubrir(centro, radio, tipos));
      } catch (error) {
        if (error instanceof ProspectPersistenceError) throw error;
        googleError = true;
        avisos.push("Google no pudo completar la búsqueda. Podés reintentar; se conservaron los prospectos disponibles.");
      }
    }
    if (validos().length >= opts.objetivo) break;
  }
  // Nearby sólo devuelve veinte por rubro. Si esos veinte ya eran clientes o
  // estaban asignados, ampliar el mismo círculo repite la misma lista. Se cubre
  // el interior con consultas adicionales, pero se mantiene el centro y el límite.
  if (validos().length < opts.objetivo && opts.cubrirZona && tipos.length && !googleError) {
    try { agregar(await opts.cubrirZona(centro, tipos)); }
    catch (error) { if (error instanceof ProspectPersistenceError) throw error; avisos.push("No se pudo terminar de recorrer la zona en Google. Podés reintentar la búsqueda."); }
  }
  const candidatos = validos().slice(0, 100);
  // Igual que el motor: se completa por valor (potencial del lugar y cuánto alarga la ruta).
  const seleccion=seleccionarPorValor(centro,candidatos.map(p=>({id:p.place_id,factores:factoresProspecto(p),locales:[{lat:p.latitud!,lng:p.longitud!}]})),
    distanciaKm,distanciaKm,{limite:opts.objetivo+opts.clientes.length},opts.clientes);
  const elegidos=seleccion.elegidos.flatMap(s=>candidatos.filter(p=>p.place_id===s.id));
  return {centro,candidatos,elegidos,radio_m:Math.round(radio*1000),avisos};
}

/** Una consulta por rubro evita que 20 restaurantes oculten hoteles o vinotecas. */
export async function descubrirProspectosMapa(centro: Coordenada, radioKm: number, tipos: string[], deadline: number, consumirConsulta: () => void = () => {}): Promise<ProspectoMapa[]> {
  const responses = await Promise.allSettled(tipos.map(async tipo => {
    if (Date.now() >= deadline) throw new Error("Tiempo de búsqueda agotado");
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ms = Math.min(10_000, deadline - Date.now());
      if (ms <= 0) throw new Error("Tiempo de búsqueda agotado");
      consumirConsulta();
      response = await googleMapsFetch("/places/v1/places:searchNearby", {
        method: "POST", signal: AbortSignal.timeout(ms),
        headers: { "Content-Type": "application/json", "X-Goog-FieldMask": PLACES_FIELD_MASK },
        body: JSON.stringify({ includedTypes: [tipo], maxResultCount: 20, rankPreference: "DISTANCE", languageCode: "es", regionCode: "AR",
          locationRestriction: { circle: { center: { latitude: centro.lat, longitude: centro.lng }, radius: radioKm * 1000 } } }),
      });
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) { await response.body?.cancel(); continue; }
      break;
    }
    if (!response?.ok) throw new Error("Google Places no completó la búsqueda");
    const payload = await response.json();
    return (payload.places || []).map(prospectoDeGoogle).filter((p: ProspectoMapa | null): p is ProspectoMapa => Boolean(p));
  }));
  // No afirmar que la búsqueda está completa si un rubro falló.
  if (responses.some(r => r.status === "rejected")) throw new Error("No se pudieron consultar todos los rubros en Google");
  return responses.flatMap(r => r.status === "fulfilled" ? r.value : []);
}

export async function cubrirZonaMapa(centro: Coordenada, tipos: string[], deadline: number, consumirConsulta: () => void): Promise<ProspectoMapa[]> {
  const radios = Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 3 * i, d = RADIO_RUTA_KM * 0.55;
    return { lat: centro.lat + d / 111.32 * Math.sin(a), lng: centro.lng + d / (111.32 * Math.cos(centro.lat * Math.PI / 180)) * Math.cos(a) };
  });
  const encontrados: ProspectoMapa[] = [];
  for (let i = 0; i < radios.length; i += 2) {
    const tandas = await Promise.all(radios.slice(i, i + 2).map(c => descubrirProspectosMapa(c, RADIO_RUTA_KM * 0.66, tipos, deadline, consumirConsulta)));
    encontrados.push(...tandas.flat());
  }
  return encontrados;
}
