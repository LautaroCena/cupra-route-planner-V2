import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seleccionarPorValor } from '../supabase/functions/_shared/seleccion.ts';
import { CUPOS_POR_DEFECTO, cuposValidos, tipoVisita } from '../supabase/functions/_shared/cupos.ts';

const P = (x, y) => ({ lat: y, lng: x });
const dist = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng);
const centro = P(0, 0);
let n = 0;
// Candidato de un tipo, con más o menos valor, en un punto cercano distinto.
const C = (tipo, recuperacion = 0.5, extra = {}) => {
  n++;
  return { id: `${tipo}-${n}`, tipo, factores: { recuperacion, potencial: 0.5 }, locales: [P((n % 7) * 0.1, Math.floor(n / 7) * 0.1)], ...extra };
};
const varios = (tipo, k, rec) => Array.from({ length: k }, () => C(tipo, rec));
const sel = (cands, cupos = CUPOS_POR_DEFECTO) => seleccionarPorValor(centro, cands, dist, dist, { cupos });
const cuenta = (r) => r.elegidos.reduce((m, e) => ({ ...m, [e.tipo]: (m[e.tipo] || 0) + 1 }), {});

test('por defecto: 5 activos, 2 inactivos y 1 prospecto, aunque los perdidos valgan más', () => {
  const r = sel([...varios('ACTIVO', 8, 0.2), ...varios('INACTIVO', 4, 0.3), ...varios('PERDIDO', 5, 1), ...varios('POTENCIAL', 4, 0.1)]);
  assert.deepEqual(cuenta(r), { ACTIVO: 5, INACTIVO: 2, POTENCIAL: 1 });
  assert.equal(r.avisos.length, 0);
});

test('dentro de cada tipo manda el valor', () => {
  const buenos = varios('INACTIVO', 2, 1);
  const r = sel([...varios('ACTIVO', 5, 0.2), ...varios('INACTIVO', 3, 0.1), ...buenos, C('POTENCIAL')]);
  const ids = new Set(r.elegidos.map((e) => e.id));
  assert.ok(buenos.every((b) => ids.has(b.id)));
});

test('los perdidos entran si el asignador los pide', () => {
  const r = sel([...varios('ACTIVO', 8), ...varios('INACTIVO', 4), ...varios('PERDIDO', 5), ...varios('POTENCIAL', 4)],
    { ACTIVO: 3, INACTIVO: 2, PERDIDO: 2, POTENCIAL: 1 });
  assert.deepEqual(cuenta(r), { ACTIVO: 3, INACTIVO: 2, PERDIDO: 2, POTENCIAL: 1 });
});

test('si un tipo no alcanza se completa con prospectos y se avisa dónde faltó', () => {
  const r = sel([...varios('ACTIVO', 3), ...varios('INACTIVO', 4), ...varios('PERDIDO', 5), ...varios('POTENCIAL', 6)]);
  assert.deepEqual(cuenta(r), { ACTIVO: 3, INACTIVO: 2, POTENCIAL: 3 });
  assert.ok(r.avisos.some((a) => a.includes('5 activos y hay 3') && a.includes('2 prospectos')), r.avisos.join(' | '));
});

test('si ni con prospectos alcanza, la ruta sale con menos visitas (no usa otros tipos)', () => {
  const r = sel([...varios('ACTIVO', 3), ...varios('INACTIVO', 1), ...varios('PERDIDO', 5)]);
  assert.equal(r.elegidos.length, 4);
  assert.deepEqual(cuenta(r), { ACTIVO: 3, INACTIVO: 1 });
});

test('un recordatorio vencido entra aunque su tipo no tenga cupo', () => {
  const recordado = C('PERDIDO', 0.1, { obligatorio: true });
  const r = sel([...varios('ACTIVO', 8), ...varios('INACTIVO', 4), ...varios('POTENCIAL', 4), recordado]);
  assert.ok(r.elegidos.some((e) => e.id === recordado.id));
  assert.equal(r.elegidos.length, 8);
});

test('los cupos son enteros que suman exactamente 8', () => {
  assert.deepEqual(cuposValidos({ ACTIVO: 5, INACTIVO: 2, POTENCIAL: 1 }), CUPOS_POR_DEFECTO);
  assert.equal(cuposValidos({ ACTIVO: 5, INACTIVO: 2, POTENCIAL: 2 }), null);
  assert.equal(cuposValidos({ ACTIVO: 5, INACTIVO: 2 }), null);
  assert.equal(cuposValidos({ ACTIVO: 4.5, INACTIVO: 2.5, POTENCIAL: 1 }), null);
  assert.equal(cuposValidos({ ACTIVO: -1, INACTIVO: 8, POTENCIAL: 1 }), null);
});

test('un cliente sin compras cuenta como prospecto', () => {
  assert.equal(tipoVisita({ es_prospecto: true }), 'POTENCIAL');
  assert.equal(tipoVisita({ estado_comercial: 'PERDIDO' }), 'PERDIDO');
  assert.equal(tipoVisita({ estado_comercial: null }), 'POTENCIAL');
});
