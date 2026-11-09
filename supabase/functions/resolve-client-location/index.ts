import { authorize, corsHeaders, failure, geocodeAddress, reverseGeocode, json, RequestError } from "../_shared/location-service.ts";
import { coordinateNumber } from "../_shared/import-values.ts";
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const { db } = await authorize(req, true);
    const body = await req.json();
    if (typeof body.client_id !== "string" || !body.client_id.trim()) throw new RequestError("Falta el cliente", 400, "BAD_REQUEST");
    if (body.manual !== true) throw new RequestError("Confirmá la corrección de la ubicación", 400, "CONFIRM_LOCATION");
    const { data: client, error } = await db.from("clientes").select("client_id").eq("client_id", body.client_id).maybeSingle();
    if (error || !client) throw new RequestError("Cliente inexistente", 404, "NOT_FOUND");
    const lat = coordinateNumber(body.lat), lng = coordinateNumber(body.lng);
    const address = typeof body.direccion === "string" ? body.direccion.trim().slice(0, 700) : "";
    if ((lat === null) !== (lng === null)) throw new RequestError("Completá ambas coordenadas", 422, "INVALID_COORDINATES");
    if (lat === null && !address) throw new RequestError("Falta dirección o coordenadas", 400, "BAD_REQUEST");
    // Un punto marcado a mano se guarda aunque no se identifique el barrio (por ejemplo,
    // fuera de CABA sin clave de Google): la ubicación es lo que importa para las rutas.
    const sinBarrio = (la: number, ln: number) => ({ lat: la, lng: ln, formatted_address: "", location_type: "MANUAL", barrio: null,
      comuna: null, ciudad: null, provincia: null, postal_code: null, admin_area_level_2: null, barrio_fallback_admin2: null, place_id: null });
    const barrioDe = async (la: number, ln: number) => {
      try { return await reverseGeocode(la, ln); }
      catch (e) { if (lat !== null && e instanceof RequestError && e.code === "NO_NEIGHBORHOOD") return sinBarrio(la, ln); throw e; }
    };
    let location: any = lat !== null && lng !== null ? await barrioDe(lat, lng) : await geocodeAddress(`${address}, Argentina`);
    if (!location.barrio) location = { ...location, ...await barrioDe(location.lat, location.lng) };
    const { data: saved, error: saveError } = await db.rpc("guardar_ubicacion_cliente", {
      p_client_id: body.client_id, p_manual: true,
      p_datos: {
        lat: location.lat, long: location.lng, direccion_principal: location.formatted_address || address,
        barrio_principal: location.barrio, provincia_principal: location.provincia, comuna: location.comuna,
        codigo_postal: location.postal_code, place_id: location.place_id, precision_geocoding: location.location_type,
      },
    });
    if (saveError) throw new Error(saveError.message);
    return json({ ok: true, ...saved, ...location, direccion: location.formatted_address });
  } catch (error) { return failure(error); }
});
