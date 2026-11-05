import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { googleMapsFetch } from "./google-maps.ts";
import { argentinaCoordinates } from "./import-values.ts";
import { type GeocodeResult, preciseArgentinaResult, locationFields } from "./geocoding-values.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
export class RequestError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}
export async function authorize(req: Request, write: boolean) {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new RequestError("Sesión requerida", 401, "UNAUTHORIZED");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new RequestError("Sesión inválida o vencida", 401, "UNAUTHORIZED");
  const { data: profile, error: profileError } = await db.from("profiles").select("rol").eq("user_id", data.user.id).eq("activo", true).single();
  if (profileError || !profile || write && !["administrador", "asignador"].includes(profile.rol)) {
    throw new RequestError(write ? "Se requiere un asignador o administrador activo" : "Se requiere un usuario activo", 403, "FORBIDDEN");
  }
  return { db, user: data.user, profile };
}
export function failure(error: unknown) {
  const known = error instanceof RequestError;
  const message = error instanceof Error ? error.message : "No se pudo completar la operación";
  return json({ success: false, status: "ERROR", error: message, message, error_code: known ? error.code : "NETWORK_ERROR" }, known ? error.status : 500);
}

export async function googleGeocode(params: URLSearchParams): Promise<GeocodeResult[]> {
  params.set("language", "es");
  params.set("region", "ar");
  let response: Response;
  try { response = await googleMapsFetch(`/maps/api/geocode/json?${params}`); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("Falta GOOGLE_MAPS_API_KEY")) {
      throw new RequestError("Falta configurar la clave de Google Maps. Sin ella no se pueden ubicar direcciones.", 503, "GOOGLE_KEY_MISSING");
    }
    throw new RequestError("No se pudo conectar con Google Maps. Intentá nuevamente.", 502, "GOOGLE_ERROR");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !["OK", "ZERO_RESULTS"].includes(data.status)) {
    throw new RequestError(`Google Maps no pudo resolver la consulta (${data.status || response.status}). Intentá nuevamente o revisá la configuración del servicio.`, 502, "GOOGLE_ERROR");
  }
  return data.results || [];
}
export async function geocodeAddress(address: string) {
  const results = await googleGeocode(new URLSearchParams({ address, components: "country:AR" }));
  const valid = results.filter(r => preciseArgentinaResult(r, /\d/.test(address)));
  if (valid.length !== 1) throw new RequestError("La dirección no identifica una ubicación precisa y única. Completá calle, altura y localidad.", 422, "NO_PRECISE_RESULT");
  return locationFields(valid[0]);
}
export async function reverseGeocode(lat: number, lng: number) {
  if (!argentinaCoordinates(lat, lng)) throw new RequestError("Coordenadas inválidas para Argentina", 422, "INVALID_COORDINATES");
  const results = await googleGeocode(new URLSearchParams({ latlng: `${lat},${lng}` }));
  const result = results.find(r => r.address_components?.some(c => c.types.includes("country") && c.short_name === "AR") && locationFields(r).barrio);
  if (!result) throw new RequestError("Google Maps no identificó el barrio de estas coordenadas. Revisá la dirección.", 422, "NO_NEIGHBORHOOD");
  return { ...locationFields(result), lat, lng };
}
