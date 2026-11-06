import { test } from "node:test";
import assert from "node:assert/strict";
import { distanciaDesdeMatriz, FACTOR_CAMINATA, matrizCaminata, recorridoCaminata } from "../supabase/functions/_shared/ors.ts";

const A = { lat: -34.58, lng: -58.42 }, B = { lat: -34.59, lng: -58.41 }, C = { lat: -34.60, lng: -58.40 };
const responde = (cuerpo, ok = true) => {
  const pedidos = [];
  const f = async (url, init) => { pedidos.push({ url, init }); return { ok, status: ok ? 200 : 429, json: async () => cuerpo }; };
  return { f, pedidos };
};

test("sin clave no consulta y sigue en línea recta", async () => {
  const { f, pedidos } = responde({});
  assert.equal(await matrizCaminata([A, B], null, f), null);
  assert.equal(await recorridoCaminata([A, B], null, f), null);
  assert.equal(pedidos.length, 0);
});

test("pide la matriz a pie con [lng, lat] y la clave en el encabezado", async () => {
  const { f, pedidos } = responde({ distances: [[0, 1.2], [1.3, 0]] });
  assert.deepEqual(await matrizCaminata([A, B], "clave-prueba", f), [[0, 1.2], [1.3, 0]]);
  assert.match(pedidos[0].url, /matrix\/foot-walking$/);
  assert.equal(pedidos[0].init.headers.Authorization, "clave-prueba");
  assert.deepEqual(JSON.parse(pedidos[0].init.body).locations, [[A.lng, A.lat], [B.lng, B.lat]]);
});

test("una matriz incompleta o un error del servicio se informan", async () => {
  await assert.rejects(matrizCaminata([A, B], "k", responde({ distances: [[0]] }).f), /incompleta/);
  await assert.rejects(matrizCaminata([A, B], "k", responde({}, false).f), /429/);
});

test("un tramo sin dato usa la línea recta por el factor promedio", () => {
  const recta = () => 1;
  const dist = distanciaDesdeMatriz([A, B], [[0, 1.5], [null, 0]].map((f) => f.map((v) => (v === null ? NaN : v))), recta);
  assert.equal(dist(A, B), 1.5);
  assert.equal(dist(B, A), FACTOR_CAMINATA);
  assert.equal(dist(A, C), FACTOR_CAMINATA);
});

test("recorrido: metros y minutos del resumen", async () => {
  const { f } = responde({ routes: [{ summary: { distance: 2345.6, duration: 1801 } }] });
  assert.deepEqual(await recorridoCaminata([A, B, C], "k", f), { metros: 2346, minutos: 31 });
});
