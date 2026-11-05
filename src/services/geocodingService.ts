// Servicio de geocodificación. La clave de navegador de Google sólo sirve para
// Maps JS/Places, NO para Geocoding (devuelve REQUEST_DENIED), así que todas las
// geocodificaciones pasan por la función backend `geocode-address`.

import { supabase } from "@/integrations/supabase/client";

export interface GeocodingRequest {
  direccion: string;
  barrio?: string;
  ciudad: string;
  provincia: string;
  pais: string; // Siempre "Argentina"
  codigo_postal?: string;
}

export interface GeocodingResponse {
  status: "OK" | "ERROR";
  lat?: number;
  lng?: number;
  formatted_address?: string;
  location_type?: string;
  error_code?: string;
  message?: string;
  barrio?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  provincia?: string | null;
  postal_code?: string | null;
  admin_area_level_2?: string | null;
  barrio_fallback_admin2?: string | null;
  place_id?: string;
}

/**
 * Geocodifica una dirección vía la función backend (Google Maps).
 */
export async function geocodeAddress(request: GeocodingRequest): Promise<GeocodingResponse> {
  try {
    const { data, error } = await supabase.functions.invoke("geocode-address", {
      body: {
        direccion: request.direccion,
        barrio: request.barrio || "",
        ciudad: request.ciudad,
        provincia: request.provincia,
        codigo_postal: request.codigo_postal || "",
      },
    });

    if (error) {
      let detalle = error.message;
      try {
        const ctx = (error as any)?.context;
        if (ctx?.text) {
          const raw = await ctx.text();
          const parsed = JSON.parse(raw);
          if (parsed?.message) detalle = parsed.message;
        }
      } catch {
        /* sin detalle adicional */
      }
      console.error("Error al geocodificar:", detalle);
      return {
        status: "ERROR",
        error_code: "NETWORK_ERROR",
        message: detalle || "No se pudo validar la dirección. Intentá nuevamente.",
      };
    }

    return data as GeocodingResponse;
  } catch (error: any) {
    console.error("Error al geocodificar:", error);
    return {
      status: "ERROR",
      error_code: "NETWORK_ERROR",
      message: "No se pudo conectar con el servicio de mapas. Verificá tu conexión e intentá nuevamente.",
    };
  }
}


/**
 * Valida que las coordenadas estén dentro del rango de Argentina
 */
export function isValidArgentinaCoordinate(lat: number, lng: number): boolean {
  const LAT_MIN = -56;
  const LAT_MAX = -21;
  const LNG_MIN = -74;
  const LNG_MAX = -53;
  return lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;
}

/**
 * Genera un place_id único para prospectos manuales
 */
export function generateManualPlaceId(): string {
  return `manual-${crypto.randomUUID()}`;
}

/**
 * Lista de provincias argentinas para el selector
 */
export const PROVINCIAS_ARGENTINA = [
  "Buenos Aires",
  "Ciudad Autónoma de Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];
