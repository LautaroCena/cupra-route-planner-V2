import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seleccionarPorValor, ordenExacto, largo } from '../supabase/functions/_shared/seleccion.ts';

// Plano en km para poder razonar los casos: (x, y) → lat/lng.
const P = (x, y) => ({ lat: y, lng: x });
const dist = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng);
const C = (id, x, y, recuperacion = 0, potencial = 0.5, extra = []) => ({
  id, factores: { recuperacion, potencial }, locales: [P(x, y), ...extra],
});
const centro = P(0, 0);
const sel = (cands, params = {}) => seleccionarPorValor(centro, cands, dist, dist, params);

test('orden exacto: encuentra el recorrido más corto', () => {
  const puntos = [P(0, 0), P(3, 0), P(1, 0), P(2, 0)];
  const orden = ordenExacto(puntos, dist).map((p) => p.lng);
  assert.ok(['0,1,2,3', '3,2,1,0'].includes(orden.join()), orden.join());
  const desde = ordenExacto([P(3, 0), P(1, 0), P(2, 0)], dist, P(0, 0));
  assert.equal(largo([P(0, 0), ...desde], dist), 3);
});

test('elige por valor, no por cercanía', () => {
  // Uno pegado al centro pero sin urgencia; otro a 1 km, muy atrasado.
  const r = sel([C('cerca', 0.05, 0, 0, 0.2), C('urgente', 1, 0, 1, 0.8)], { limite: 1 });
  assert.equal(r.elegidos[0].id, 'urgente');
});

test('a igual valor, gana el que menos alarga la ruta', () => {
  const r = sel([C('lejos', 1.4, 0), C('cerca', 0.2, 0)], { limite: 1 });
  assert.equal(r.elegidos[0].id, 'cerca');
});

test('respeta el tope de recorrido y avisa si no completa', () => {
  const cands = [C('a', 1.4, 0, 1), C('b', -1.4, 0, 1), C('c', 0, 1.4, 1)];
  // a y b juntos: 1,4 + 2,8 = 4,2 km. Sumar c lo pasa de 4,5.
  const r = sel(cands, { topeKm: 4.5 });
  assert.ok(r.km <= 4.5);
  assert.equal(r.elegidos.length, 2);
  assert.ok(r.avisos.some((a) => a.includes('no se completan')));
});

test('franja: entra si penalizado supera al peor, una sola vez', () => {
  const adentro = Array.from({ length: 8 }, (_, i) => C('in' + i, 0.1 * i, 0, 0, 0.1));
  const franjaBuena = C('franja', 1.55, 0, 1, 1);
  const franjaOtra = C('franja2', 0, 1.55, 1, 1);
  const r = sel([...adentro, franjaBuena, franjaOtra], { topeKm: 10 });
  assert.equal(r.elegidos.length, 8);
  assert.equal(r.elegidos.filter((e) => e.enFranja).length, 1);
  // Si la penalización es enorme, no entra ninguno.
  assert.equal(sel([...adentro, franjaBuena], { topeKm: 10, penalizacionFranja: 100 }).elegidos.some((e) => e.enFranja), false);
  // Más allá de la franja nunca entra.
  assert.equal(sel([C('afuera', 1.7, 0, 1, 1)]).elegidos.length, 0);
});

test('un cliente con varios locales entra una vez, en el que menos alarga', () => {
  const r = sel([C('multi', 1.4, 0, 1, 0.5, [P(0.1, 0)]), C('otro', 0.2, 0, 1)], { limite: 8 });
  assert.equal(r.elegidos.filter((e) => e.id === 'multi').length, 1);
  assert.equal(r.elegidos.find((e) => e.id === 'multi').local.lng, 0.1);
});

test('parámetros guardados: se usa lo válido y lo demás queda por defecto', async () => {
  const { parametrosValidos } = await import('../supabase/functions/_shared/seleccion.ts');
  assert.deepEqual(parametrosValidos({ limite: 6, topeKm: 'mucho', penalizacionFranja: -3, pesos: { recorrido: 50 } }),
    { limite: 6, pesos: { recorrido: 50, recuperacion: 25, oportunidad: 25, potencial: 15 } });
  assert.deepEqual(parametrosValidos(null), {});
  assert.deepEqual(parametrosValidos({ limite: 20 }), {});
});

test('con visitas fijas (ruta desde el mapa) completa los lugares libres y las cuenta en el recorrido', () => {
  const fijos = [P(0.1, 0), P(0.2, 0)];
  const r = seleccionarPorValor(centro, [C('a', 0.3, 0), C('b', -0.3, 0), C('c', 0, 0.3)], dist, dist, { limite: 4 }, fijos);
  assert.equal(r.elegidos.length, 2);
  assert.ok(r.km >= 0.2);
});

test('devuelve las siguientes mejores que quedaron afuera, sin repetir las elegidas', () => {
  const cands = Array.from({ length: 12 }, (_, i) => C(`c${i}`, 0.1 * (i % 4), 0.1 * Math.floor(i / 4), i / 12));
  const r = sel(cands);
  assert.equal(r.elegidos.length, 8);
  assert.ok(r.alternativas.length > 0 && r.alternativas.length <= 5);
  const elegidos = new Set(r.elegidos.map((e) => e.id));
  assert.ok(r.alternativas.every((a) => !elegidos.has(a.id)));
  // Ordenadas de mayor a menor valor.
  assert.deepEqual([...r.alternativas].sort((a, b) => b.valor - a.valor), r.alternativas);
});

test('sin candidatos de sobra, no hay alternativas', () => {
  assert.deepEqual(sel([C('a', 0.1, 0), C('b', 0.2, 0)]).alternativas, []);
});

test('un recordatorio vencido entra aunque valga poco, y la franja no lo saca', () => {
  // 9 candidatos de alto valor y uno obligatorio de valor bajo: entra el obligatorio.
  const cands = Array.from({ length: 9 }, (_, i) => C(`alto${i}`, 0.1 * (i % 3), 0.1 * Math.floor(i / 3), 1, 1));
  const obligatorio = { ...C('pidio-volver', 0.05, 0.05, 0, 0), obligatorio: true };
  const r = sel([...cands, obligatorio, C('franja', 1.55, 0, 1, 1)]);
  assert.equal(r.elegidos.length, 8);
  assert.ok(r.elegidos.some((e) => e.id === 'pidio-volver' && e.obligatorio));
});

test('sin obligatorios, el de valor bajo queda afuera', () => {
  const cands = Array.from({ length: 9 }, (_, i) => C(`alto${i}`, 0.1 * (i % 3), 0.1 * Math.floor(i / 3), 1, 1));
  const r = sel([...cands, C('pidio-volver', 0.05, 0.05, 0, 0)]);
  assert.ok(!r.elegidos.some((e) => e.id === 'pidio-volver'));
});
