import { test } from "node:test";
import assert from "node:assert/strict";
import { barrioValido, consultaOverpass, potencialOsm, prospectosDesdeOsm } from "../supabase/functions/_shared/osm.ts";
import { puntajeProspecto } from "../supabase/functions/_shared/prospecto-valor.ts";

const respuesta = { elements: [
  { type: "node", id: 1, lat: -34.58, lon: -58.42, tags: { shop: "wine", name: "Vinoteca Uno", "addr:street": "Gorriti", "addr:housenumber": "4800", phone: "+54 11 5555-0000" } },
  { type: "way", id: 2, center: { lat: -34.59, lon: -58.43 }, tags: { amenity: "restaurant", name: "Parrilla Dos" } },
  { type: "node", id: 3, lat: -34.6, lon: -58.4, tags: { amenity: "cafe", name: "Café (no es del rubro)" } },
  { type: "node", id: 4, lat: -34.6, lon: -58.4, tags: { amenity: "bar" } }, // sin nombre
  { type: "node", id: 5, tags: { amenity: "bar", name: "Sin coordenadas" } },
] };

test("convierte negocios del rubro y descarta los que no sirven", () => {
  const filas = prospectosDesdeOsm(respuesta, "Palermo");
  assert.deepEqual(filas.map((f) => f.place_id), ["osm-node-1", "osm-way-2"]);
  const [vino, parrilla] = filas;
  assert.equal(vino.tipo_principal, "liquor_store");
  assert.equal(vino.direccion, "Gorriti 4800");
  assert.equal(vino.telefono, "+54 11 5555-0000");
  assert.equal(vino.barrio, "Palermo");
  assert.equal(parrilla.latitud, -34.59);
  assert.equal(parrilla.direccion, null);
});

test("el potencial sale del rubro y el teléfono suma", () => {
  assert.equal(potencialOsm("liquor_store"), 60);
  assert.ok(potencialOsm("restaurant") > potencialOsm("convenience_store"));
  const [vino, parrilla] = prospectosDesdeOsm(respuesta, "Palermo");
  assert.equal(puntajeProspecto(vino), 70); // 60 + 10 por teléfono
  assert.equal(puntajeProspecto(parrilla), 50);
});

test("solo acepta nombres de barrio, sin texto que rompa la consulta", () => {
  assert.equal(barrioValido("Villa Crespo"), "Villa Crespo");
  assert.equal(barrioValido("nunez"), "Núñez");
  assert.equal(barrioValido("Lanús"), null); // solo CABA
  assert.equal(barrioValido('Palermo"];out;'), null);
  assert.equal(barrioValido(""), null);
  assert.match(consultaOverpass("Palermo"), /\["admin_level"="9"\]\["name"="Palermo"\]/);
});
