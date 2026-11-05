import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fechaFlexible, cuitValido, clasificarDocumento, normalizarUbicacion, revisarVentas, limpiarSinDato,
} from '../supabase/functions/_shared/etl/ventas.ts';

const hoy = new Date('2026-11-05T12:00:00Z');
const fecha = (v) => fechaFlexible(v, hoy);
// CUIT inventado con dígito verificador correcto.
const CUIT = '20123456786';
const fila = (extra = {}) => ({ Ticket: 'FV1', 'Fecha Emisión': '2026-09-30', 'CUIT / DNI': CUIT, 'Razón Social': 'Comercio', Vendedor: 'V', Cantidad: 1, 'Código Producto': 'P', 'Precio Total Final': 10, ...extra });

test('acepta todos los formatos de fecha acordados', () => {
  for (const v of ['30/09/2026', '30-09-2026', '30.09.2026', '30 09 2026', '30/09/26', '30/09/2026 14:30', '30 de septiembre de 2026', '30-sep-26', '2026-09-30', '2026-09-30T10:00:00Z', 46295]) {
    assert.equal(fecha(v).fecha, '2026-09-30', String(v));
  }
});

test('día/mes por defecto; mes/día solo cuando no hay otra lectura, con aviso', () => {
  assert.deepEqual(fecha('03/04/2026'), { fecha: '2026-04-03' });
  assert.deepEqual(fecha('10/27/2026'), { fecha: '2026-10-27', aviso: 'fecha_mes_dia' });
});

test('rechaza fechas sin sentido y distingue la vacía', () => {
  for (const v of ['2056-01-01', '32/13/2026', '15/13/2026', 'ayer', '1999-05-05']) assert.equal(fecha(v).invalida, true, v);
  assert.deepEqual(fecha(''), { fecha: null });
  assert.deepEqual(fecha(null), { fecha: null });
});

test('comprueba el dígito verificador del CUIT', () => {
  assert.equal(cuitValido(CUIT), true);
  assert.equal(cuitValido('20123456787'), false);
  assert.equal(cuitValido('123'), false);
});

test('clasifica documentos y no confía en la notación científica', () => {
  assert.deepEqual(clasificarDocumento('20-12345678-6'), { documento: CUIT, tipo: 'cuit' });
  assert.deepEqual(clasificarDocumento(24498124), { documento: '24498124', tipo: 'dni' });
  assert.equal(clasificarDocumento('111111111').tipo, 'revisar');
  assert.deepEqual(clasificarDocumento('2.713382e+10'), { documento: null, tipo: 'revisar' });
  assert.equal(clasificarDocumento(null).tipo, 'ninguno');
});

test('una ciudad en Provincia pasa a Ciudad y un número no es ciudad', () => {
  assert.deepEqual(normalizarUbicacion('CANNING', null), { provincia: null, ciudad: 'CANNING', provinciaEraCiudad: true, ciudadInvalida: false });
  assert.deepEqual(normalizarUbicacion('Córdoba', '0'), { provincia: 'Córdoba', ciudad: null, provinciaEraCiudad: false, ciudadInvalida: true });
  assert.equal(limpiarSinDato('S/D'), null);
  assert.equal(limpiarSinDato('Vinoteca'), 'Vinoteca');
});

test('rechaza solo las filas sin sentido y deja pasar las demás', () => {
  const filas = Array.from({ length: 40 }, (_, i) => fila({ Ticket: 'FV' + i, __fila_excel: i + 2 }));
  filas[0] = fila({ Ticket: null, __fila_excel: 2 });
  filas[1] = fila({ Ticket: 'X', 'Fecha Emisión': '2056-01-01', __fila_excel: 3 });
  const r = revisarVentas(filas, hoy);
  assert.deepEqual(r.rechazadas.map((x) => [x.fila, x.motivo]), [[2, 'sin_ticket'], [3, 'fecha_invalida']]);
  assert.equal(r.frenar, false);
});

test('la fecha vacía se hereda del comprobante; si no hay de dónde, se rechaza', () => {
  const r = revisarVentas([fila(), fila({ 'Fecha Emisión': null, 'Código Producto': 'Q' }), fila({ Ticket: 'FV2', 'Fecha Emisión': null })], hoy);
  assert.equal(r.fechas[1], '2026-09-30');
  assert.deepEqual(r.rechazadas.map((x) => x.motivo), ['sin_fecha']);
  assert.equal(r.avisos.find((a) => a.tipo === 'fecha_heredada').cantidad, 1);
});

test('lo faltante queda como desconocido con aviso, sin rechazar', () => {
  const r = revisarVentas([fila({ Vendedor: null, Cantidad: 'abc', 'Precio Total Final': null, 'CUIT / DNI': '111' }), fila({ Ticket: 'FV2' })], hoy);
  assert.equal(r.rechazadas.length, 0);
  assert.equal(r.cantidades[0], null);
  const tipos = r.avisos.map((a) => a.tipo);
  for (const t of ['sin_vendedor', 'cantidad_desconocida', 'importe_desconocido', 'documento_revisar']) assert.ok(tipos.includes(t), t);
});

test('cantidad negativa solo vale en notas de crédito, y el comprobante NC se reconoce', () => {
  const r = revisarVentas([fila({ Cantidad: -2 }), fila({ Ticket: 'NC0004-1', Cantidad: -2 })], hoy);
  assert.deepEqual(r.cantidades, [null, -2]);
  assert.deepEqual(r.notasCredito, [false, true]);
});

test('frena el archivo si faltan columnas o se rechaza más del 5%', () => {
  assert.equal(revisarVentas([{ 'Razón Social': 'A', Cantidad: 1 }], hoy).columnasFaltantes.join(), 'Ticket,Fecha Emisión');
  const muchas = Array.from({ length: 20 }, (_, i) => fila({ Ticket: 'FV' + i, 'Fecha Emisión': i < 2 ? 'ayer' : '2026-09-30' }));
  const r = revisarVentas(muchas, hoy);
  assert.equal(r.pctRechazadas, 10);
  assert.equal(r.frenar, true);
});

test('las filas idénticas se conservan y se informan', () => {
  const r = revisarVentas([fila({ __fila_excel: 2 }), fila({ __fila_excel: 3 })], hoy);
  assert.equal(r.rechazadas.length, 0);
  assert.equal(r.avisos.find((a) => a.tipo === 'filas_identicas').cantidad, 1);
});
