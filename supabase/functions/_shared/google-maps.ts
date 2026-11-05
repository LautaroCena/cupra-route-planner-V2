// Cliente de Google Maps: conexión directa con la clave de servidor.

export function googleMapsKey(): string {
  return Deno.env.get("GOOGLE_MAPS_API_KEY") || "";
}

export function hayGoogleMaps(): boolean {
  return Boolean(googleMapsKey());
}

function directUrl(path: string, key: string): { url: string; headers: Record<string, string> } {
  if (path.startsWith("/routes/")) {
    return { url: `https://routes.googleapis.com${path.slice("/routes".length)}`, headers: { "X-Goog-Api-Key": key } };
  }
  if (path.startsWith("/places/")) {
    return { url: `https://places.googleapis.com${path.slice("/places".length)}`, headers: { "X-Goog-Api-Key": key } };
  }
  const sep = path.includes("?") ? "&" : "?";
  return { url: `https://maps.googleapis.com${path}${sep}key=${encodeURIComponent(key)}`, headers: {} };
}

/** 400 de Places (New) por clave inválida o vencida. */
function esClaveInvalida(status: number, body: any): boolean {
  if (status !== 400) return false;
  const texto = JSON.stringify(body?.error || body || "");
  return /API_KEY_INVALID|API key not valid|API key expired/i.test(texto);
}

export async function googleMapsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = googleMapsKey();
  if (!key) throw new Error("Falta GOOGLE_MAPS_API_KEY en los secretos de Supabase.");
  const baseHeaders = Object.fromEntries(new Headers(init.headers).entries());
  const direct = directUrl(path, key);
  return fetch(direct.url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(12_000),
    headers: { ...baseHeaders, ...direct.headers },
  });
}

// ------------------------------------------------------------
// Búsqueda de lugares cercanos (Places API New · searchNearby)
// ------------------------------------------------------------

export interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  editorialSummary?: { text?: string };
}

export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.businessStatus",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.editorialSummary",
].join(",");

/**
 * Puntos de búsqueda que cubren un círculo: el centro y 6 alrededor.
 * searchNearby devuelve como máximo 20 lugares por pedido; varios círculos
 * chicos traen lugares distintos en vez de repetir siempre los mismos 20.
 */
export function circulosDeCobertura(lat: number, lng: number, radioKm: number): { lat: number; lng: number; radioM: number }[] {
  const out = [{ lat, lng, radioM: Math.round(radioKm * 1000 * 0.6) }];
  const d = radioKm * 0.55;
  const dLat = d / 111.32;
  const dLng = d / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    out.push({ lat: lat + dLat * Math.sin(a), lng: lng + dLng * Math.cos(a), radioM: Math.round(radioKm * 1000 * 0.5) });
  }
  return out;
}

export interface NearbyOptions {
  agruparTipos?: boolean;
  soloCentro?: boolean;
  lat: number;
  lng: number;
  radioKm: number;
  tipos: string[];
  /** Cortar cuando se juntaron tantos lugares nuevos. */
  objetivo: number;
  /** IDs a ignorar (ya conocidos). */
  excluir?: Set<string>;
  /** Presupuesto compartido de búsquedas de una generación completa. */
  consumirConsulta?: () => void;
  /** Persistir la información recibida, incluso de lugares ya conocidos. */
  onResults?: (places: GooglePlace[]) => Promise<void>;
}

export async function buscarLugaresCercanos(opts: NearbyOptions): Promise<GooglePlace[]> {
  const encontrados = new Map<string, GooglePlace>();
  const excluir = opts.excluir || new Set<string>();
  const errores: string[] = [];
  let respuestasOk = 0;

  const circulos = opts.soloCentro ? [{ lat: opts.lat, lng: opts.lng, radioM: opts.radioKm * 1000 }] : circulosDeCobertura(opts.lat, opts.lng, opts.radioKm);
  const grupos = opts.agruparTipos && opts.tipos.length ? [opts.tipos] : opts.tipos.map(t => [t]);
  for (const circulo of circulos) {
    for (const tipos of grupos) {
      if (encontrados.size >= opts.objetivo) break;
      try {
        opts.consumirConsulta?.();
      } catch (error) {
        if (encontrados.size > 0) return [...encontrados.values()];
        throw error;
      }
      let res: Response | undefined;
      for (let intento = 0; intento < 2; intento++) {
        try {
          if (intento > 0) opts.consumirConsulta?.();
          res = await googleMapsFetch("/places/v1/places:searchNearby", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-FieldMask": PLACES_FIELD_MASK },
        body: JSON.stringify({
          includedTypes: tipos,
          maxResultCount: 20,
          rankPreference: "DISTANCE",
          languageCode: "es",
          regionCode: "AR",
          locationRestriction: {
            circle: { center: { latitude: circulo.lat, longitude: circulo.lng }, radius: circulo.radioM },
          },
        }),
      });
          if (intento === 0 && (res.status === 429 || res.status >= 500)) {
            await res.body?.cancel();
            res = undefined;
            await new Promise(resolve => setTimeout(resolve, 150));
            continue;
          }
          break;
        } catch (error) {
          errores.push(error instanceof Error ? error.message : String(error));
          if (intento === 1) res = undefined;
        }
      }
      if (!res) continue;
      const payload = await res.json().catch(() => ({})) as { places?: GooglePlace[]; error?: { message?: string } };
      if (!res.ok) {
        errores.push(`${res.status} ${payload.error?.message || ""}`.trim());
        // Clave inválida o sin cuota: no tiene sentido seguir pidiendo.
        if (res.status === 401 || res.status === 403 || res.status === 429 || esClaveInvalida(res.status, payload)) {
          if (encontrados.size) return [...encontrados.values()];
          throw new Error(`Google Places rechazó la búsqueda (${errores[errores.length - 1]})`);
        }
        continue;
      }
      respuestasOk++;
      await opts.onResults?.(payload.places || []);
      for (const place of payload.places || []) {
        if (!place.id || excluir.has(place.id) || encontrados.has(place.id)) continue;
        if (place.businessStatus === "CLOSED_PERMANENTLY" || place.businessStatus === "CLOSED_TEMPORARILY") continue;
        encontrados.set(place.id, place);
      }
    }
    if (encontrados.size >= opts.objetivo) break;
  }
  // Si ningún pedido funcionó no es "zona vacía": es un error que el asignador tiene que ver.
  if (respuestasOk === 0 && errores.length > 0) {
    throw new Error(`Google Places no respondió (${[...new Set(errores)].slice(0, 2).join(" | ")})`);
  }
  return [...encontrados.values()];
}
