// Si Google rechaza la clave (API sin habilitar, sin facturación, tope diario), CABA se ubica igual con USIG.
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { geocodeAddress, reverseGeocode } from "./location-service.ts";

const SANTA_FE = { direccionesNormalizadas: [{ altura: 3200, cod_partido: "caba", tipo: "calle_altura", direccion: "SANTA FE AV. 3200, CABA",
  coordenadas: { srid: 4326, x: "-58.409974", y: "-34.589255" } }] };
const RECOLETA = { comuna: "Comuna 2", barrio: "Recoleta", codigo_postal: "1425" };

async function conGoogleRechazado<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const antes = Deno.env.get("GOOGLE_MAPS_API_KEY");
  Deno.env.set("GOOGLE_MAPS_API_KEY", "clave-de-prueba");
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url instanceof Request ? url.url : url);
    if (u.includes("maps.googleapis.com")) return new Response(JSON.stringify({ status: "REQUEST_DENIED" }), { status: 200 });
    return new Response(JSON.stringify(u.includes("normalizar") ? SANTA_FE : RECOLETA), { status: 200 });
  }) as typeof fetch;
  try { return await fn(); }
  finally {
    globalThis.fetch = original;
    if (antes === undefined) Deno.env.delete("GOOGLE_MAPS_API_KEY"); else Deno.env.set("GOOGLE_MAPS_API_KEY", antes);
  }
}

Deno.test("Google rechaza la clave: la dirección se ubica con USIG", async () => {
  const r = await conGoogleRechazado(() => geocodeAddress("Av. Santa Fe 3200, CABA"));
  assertEquals([r.location_type, r.barrio], ["USIG", "Recoleta"]);
});

Deno.test("Google rechaza la clave: el barrio de un punto sale de USIG", async () => {
  const r = await conGoogleRechazado(() => reverseGeocode(-34.589, -58.41));
  assertEquals([r.location_type, r.barrio], ["USIG", "Recoleta"]);
});
