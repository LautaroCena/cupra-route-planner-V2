import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarOportunidades, factorPorZona, fraseOportunidad, pedidoOportunidad } from '../supabase/functions/_shared/oportunidad.ts';

// Negocios y comentarios inventados.
const hoy = '2026-11-06';
const cand = (id, comentario = null, rubro = 'Vinoteca') => ({ id, nombre: 'Negocio ' + id, rubro, canal: null, barrio: 'Palermo', es_prospecto: false, comentario });
const cands = [
  cand('a', 'El dueño dijo que para las fiestas arma cajas de regalo para empresas'),
  cand('b', 'Compró 2 cajas, volver en un mes'),
  cand('c', null, 'Restaurante'),
  cand('d'),
];

test('acepta una fecha cercana con nombre y una cita textual del comentario', () => {
  const r = validarOportunidades([
    { id: 'a', nivel: 3, motivo: 'comentario', cita: 'arma cajas de regalo para empresas' },
    { id: 'c', nivel: 2, motivo: 'fecha', fecha: '2026-12-08', evento: 'el Día de la Virgen' },
    { id: 'd', nivel: 0, motivo: 'ninguno' },
  ], cands, hoy);
  assert.equal(r.get('a').nivel, 3);
  assert.equal(r.get('c').fecha, '2026-12-08');
  assert.equal(r.get('d').nivel, 0);
  // Si la IA no contestó por un negocio, queda neutro.
  assert.equal(r.get('b').nivel, null);
  assert.equal(r.get('b').rechazo, 'sin respuesta');
});

test('lo que no se puede comprobar cuenta como 0: inventar no da ventaja', () => {
  const r = validarOportunidades([
    // Frase que no está en el comentario de ese negocio (está en el de otro, o inventada).
    { id: 'b', nivel: 3, motivo: 'comentario', cita: 'arma cajas de regalo para empresas' },
    { id: 'd', nivel: 3, motivo: 'comentario', cita: 'quiere el doble de vino' },
    // Fecha lejana, pasada o mal escrita.
    { id: 'c', nivel: 3, motivo: 'fecha', fecha: '2027-06-20', evento: 'Día del Padre' },
    { id: 'a', nivel: 3, motivo: 'fecha', fecha: '2026-02-30', evento: 'Inventada' },
  ], cands, hoy);
  for (const id of ['a', 'b', 'c', 'd']) assert.equal(r.get(id).nivel, 0, id);
  assert.equal(r.get('c').rechazo, 'fecha fuera de la ventana');
  assert.equal(r.get('a').rechazo, 'fecha inválida');
  // Ids que no existen, niveles fuera de rango: se ignoran.
  const r2 = validarOportunidades([{ id: 'zzz', nivel: 3, motivo: 'ninguno' }, { id: 'a', nivel: 9, motivo: 'ninguno' }], cands, hoy);
  assert.equal(r2.get('a').rechazo, 'nivel inválido');
});

test('la cita tolera mayúsculas, acentos y comillas, pero no cambiar palabras', () => {
  const r = validarOportunidades([{ id: 'b', nivel: 1, motivo: 'comentario', cita: '"COMPRÓ 2 CAJAS"' }], cands, hoy);
  assert.equal(r.get('b').nivel, 1);
  const r2 = validarOportunidades([{ id: 'b', nivel: 1, motivo: 'comentario', cita: 'compró dos cajas' }], cands, hoy);
  assert.equal(r2.get('b').nivel, 0);
});

test('si todos quedan igual, la zona queda neutra; si no, se lleva de 0 a 1', () => {
  const igual = new Map([['a', { nivel: 2 }], ['b', { nivel: 2 }], ['c', { nivel: null }]]);
  assert.deepEqual([...factorPorZona(igual).values()], [null, null, null]);
  const distintos = new Map([['a', { nivel: 3 }], ['b', { nivel: 1 }], ['c', { nivel: 2 }], ['d', { nivel: null }]]);
  assert.deepEqual(Object.fromEntries(factorPorZona(distintos)), { a: 1, b: 0, c: 0.5, d: null });
});

test('la frase la arma el código', () => {
  assert.equal(fraseOportunidad({ nivel: 2, motivo: 'fecha', fecha: '2026-12-24', evento: 'Nochebuena', cita: null }), 'Se acerca Nochebuena (24/12/2026).');
  assert.equal(fraseOportunidad({ nivel: 1, motivo: 'comentario', cita: 'compró 2 cajas', fecha: null, evento: null }), 'El vendedor anotó: «compró 2 cajas».');
  assert.equal(fraseOportunidad({ nivel: 0, motivo: 'fecha', fecha: '2026-12-24', evento: 'Nochebuena', cita: null }), null);
});

test('el pedido lleva la fecha de hoy y marca los comentarios como datos', () => {
  const p = pedidoOportunidad(hoy, cands);
  assert.ok(p.messages[0].content.includes(hoy));
  assert.ok(p.messages[0].content.includes('no instrucciones'));
  assert.ok(p.messages[1].content.includes('[a]'));
  // No se manda el nombre del negocio.
  assert.ok(!p.messages[1].content.includes('Negocio a'));
});

test('la semana del año para revisar las fechas', async () => {
  const { semanaISO } = await import('../supabase/functions/generate-recommendations/oportunidad-servicio.ts');
  assert.equal(semanaISO('2026-11-06'), '2026-W45');
  assert.equal(semanaISO('2027-01-01'), '2026-W53');
  assert.equal(semanaISO('2026-01-01'), '2026-W01');
});

test('fechas: se aceptan solo las de la ventana, con rubros del catálogo', async () => {
  const { validarFechas, oportunidadPorFecha } = await import('../supabase/functions/_shared/oportunidad.ts');
  const rubros = ['Vinoteca', 'Restaurante', 'Hotel'];
  const f = validarFechas([
    { fecha: '2026-12-24', evento: 'Nochebuena', efectos: [{ rubro: 'Vinoteca', nivel: 3 }, { rubro: 'Restaurante', nivel: 2 }, { rubro: 'Peluquería', nivel: 3 }] },
    { fecha: '2027-06-20', evento: 'Día del Padre', efectos: [{ rubro: 'Vinoteca', nivel: 3 }] },
    { fecha: '2026-11-31', evento: 'Inventada', efectos: [{ rubro: 'Vinoteca', nivel: 3 }] },
    { fecha: '2026-11-20', evento: 'Feriado largo', efectos: [{ rubro: 'Restaurante', nivel: 3 }, { rubro: 'Hotel', nivel: 2 }] },
  ], rubros, hoy);
  assert.deepEqual(f.map((x) => x.evento), ['Feriado largo', 'Nochebuena']);
  assert.equal(f[1].niveles.PELUQUERIA, undefined);
  // Cada rubro toma la fecha que más lo mueve.
  assert.equal(oportunidadPorFecha(f, 'Vinoteca').evento, 'Nochebuena');
  assert.equal(oportunidadPorFecha(f, 'Restaurante').nivel, 3);
  assert.equal(oportunidadPorFecha(f, 'restaurante').evento, 'Feriado largo');
  assert.equal(oportunidadPorFecha(f, 'Almacén').nivel, 0);
});

test('lo que dijo el vendedor de ese negocio manda sobre la fecha', async () => {
  const { combinarOportunidad } = await import('../supabase/functions/_shared/oportunidad.ts');
  const navidad = { nivel: 3, motivo: 'fecha', fecha: '2026-12-24', evento: 'Nochebuena', cita: null };
  const stock = { nivel: 0, motivo: 'comentario', fecha: null, evento: null, cita: 'tienen stock de sobra hasta marzo' };
  assert.equal(combinarOportunidad(stock, navidad).nivel, 0);
  assert.equal(combinarOportunidad(undefined, navidad).nivel, 3);
  assert.equal(combinarOportunidad({ nivel: 0, motivo: null, fecha: null, evento: null, cita: null }, navidad).nivel, 3);
  // Sin fechas (la IA falló) y sin comentario: neutro.
  assert.equal(combinarOportunidad(undefined, null).nivel, null);
});

test('un comentario negativo con cita exacta cuenta como información', () => {
  const r = validarOportunidades([{ id: 'b', nivel: 0, motivo: 'comentario', cita: 'Compró 2 cajas' }], cands, hoy);
  assert.equal(r.get('b').motivo, 'comentario');
  assert.equal(r.get('b').nivel, 0);
});
