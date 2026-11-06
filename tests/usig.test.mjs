import { test } from "node:test";
import assert from "node:assert/strict";
import { geocodificarUsig, datosUtilesUsig } from "../supabase/functions/_shared/usig.ts";

// Respuestas con la forma real de USIG (copiadas de una consulta del 06/11), sin red.
const respuestas = (normalizar, datos) => async (url) => ({
  ok: true,
  json: async () => (String(url).includes("normalizar") ? normalizar : datos),
});
const SANTA_FE = { direccionesNormalizadas: [{ altura: 3200, cod_partido: "caba", tipo: "calle_altura", direccion: "SANTA FE AV. 3200, CABA",
  coordenadas: { srid: 4326, x: "-58.409974", y: "-34.589255" } }] };
const RECOLETA = { comuna: "Comuna 2", barrio: "Recoleta", codigo_postal: "1425" };

test("ubica una dirección de CABA con barrio y comuna", async () => {
  const r = await geocodificarUsig("Av. Santa Fe 3200, Palermo, CABA, Argentina", respuestas(SANTA_FE, RECOLETA));
  assert.equal(r.lat, -34.589255);
  assert.equal(r.lng, -58.409974);
  assert.equal(r.barrio, "Recoleta");
  assert.equal(r.comuna, "Comuna 2");
  assert.equal(r.location_type, "USIG");
});

test("no acepta resultados fuera de CABA, sin altura o sin número", async () => {
  const pba = { direccionesNormalizadas: [{ ...SANTA_FE.direccionesNormalizadas[0], cod_partido: "lanus" }] };
  assert.equal(await geocodificarUsig("Santa Fe 3200", respuestas(pba, RECOLETA)), null);
  const calle = { direccionesNormalizadas: [{ ...SANTA_FE.direccionesNormalizadas[0], tipo: "calle" }] };
  assert.equal(await geocodificarUsig("Santa Fe 3200", respuestas(calle, RECOLETA)), null);
  assert.equal(await geocodificarUsig("Santa Fe", respuestas(SANTA_FE, RECOLETA)), null);
  assert.equal(await geocodificarUsig("Calle Falsa 123", respuestas({ direccionesNormalizadas: [] }, RECOLETA)), null);
});

test("si falla el barrio, igual devuelve la ubicación", async () => {
  const f = async (url) => String(url).includes("normalizar") ? { ok: true, json: async () => SANTA_FE } : { ok: false, status: 500 };
  const r = await geocodificarUsig("Santa Fe 3200", f);
  assert.equal(r.lat, -34.589255);
  assert.equal(r.barrio, null);
});

test("datos útiles fuera de CABA devuelve null", async () => {
  assert.equal(await datosUtilesUsig(-34.7, -58.39, respuestas(null, { comuna: "", barrio: "" })), null);
});
