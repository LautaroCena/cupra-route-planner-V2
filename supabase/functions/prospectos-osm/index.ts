// Importa prospectos de OpenStreetMap para un barrio de CABA (gratis, sin clave de Google).
// Solo agrega o actualiza prospectos propios de OSM (place_id "osm-..."): nunca toca los
// que vinieron de Google, del Excel o que cargó el equipo. Los que coinciden con un cliente
// actual los aparta el motor al generar, igual que con Google.
import { authorize, corsHeaders, failure, json, RequestError } from "../_shared/location-service.ts";
import { barrioValido, consultaOverpass, prospectosDesdeOsm } from "../_shared/osm.ts";

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function consultar(barrio: string) {
  let ultimo = "";
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, {
        method: "POST", signal: AbortSignal.timeout(100_000),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "cupra-rutas/0.1" },
        body: "data=" + encodeURIComponent(consultaOverpass(barrio)),
      });
      if (r.ok) return await r.json();
      ultimo = `OpenStreetMap respondió ${r.status}`;
    } catch (e) { ultimo = e instanceof Error ? e.message : String(e); }
  }
  console.error("Overpass:", ultimo);
  throw new RequestError("OpenStreetMap no respondió. Probá de nuevo en unos minutos.", 502, "OSM_ERROR");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const { db } = await authorize(req, true);
    const body = await req.json().catch(() => ({}));
    const barrio = barrioValido(body.barrio);
    if (!barrio) throw new RequestError("Elegí un barrio de CABA.", 400, "BAD_REQUEST");
    const filas = prospectosDesdeOsm(await consultar(barrio), barrio);
    if (!filas.length) return json({ success: true, barrio, encontrados: 0, nuevos: 0, actualizados: 0 });
    // No pisar prospectos de otro origen ni los ya convertidos en clientes.
    const ids = filas.map((f) => f.place_id);
    const existentes = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await db.from("prospectos").select("place_id").in("place_id", ids.slice(i, i + 300));
      if (error) throw new Error(error.message);
      (data || []).forEach((p: any) => existentes.add(p.place_id));
    }
    for (let i = 0; i < filas.length; i += 300) {
      const { error } = await db.from("prospectos").upsert(filas.slice(i, i + 300), { onConflict: "place_id" });
      if (error) throw new Error(error.message);
    }
    const nuevos = filas.filter((f) => !existentes.has(f.place_id)).length;
    console.log(`OSM ${barrio}: ${filas.length} negocios, ${nuevos} nuevos`);
    return json({ success: true, barrio, encontrados: filas.length, nuevos, actualizados: filas.length - nuevos, atribucion: "© OpenStreetMap" });
  } catch (error) { return failure(error); }
});
