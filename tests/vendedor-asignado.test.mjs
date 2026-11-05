import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vendedorInicial, vendedorSugerido } from '../supabase/functions/_shared/vendedor-asignado.ts';

const v = (vendedor, fecha) => ({ vendedor, fecha });

test('el asignado inicial es el que le vendió en más días, no el último', () => {
  const ventas = [v('Ana', '2026-07-01'), v('Ana', '2026-08-01'), v('Ana', '2026-09-01'), v('Beto', '2026-09-20')];
  assert.equal(vendedorInicial(ventas), 'Ana');
});

test('varias líneas el mismo día cuentan como un día', () => {
  const ventas = [v('Beto', '2026-09-20'), v('Beto', '2026-09-20'), v('Beto', '2026-09-20'), v('Ana', '2026-08-01'), v('Ana', '2026-09-01')];
  assert.equal(vendedorInicial(ventas), 'Ana');
});

test('solo cuentan los últimos meses de compras; empate gana el más reciente', () => {
  const viejas = [v('Ana', '2025-01-01'), v('Ana', '2025-02-01'), v('Ana', '2025-03-01')];
  assert.equal(vendedorInicial([...viejas, v('Beto', '2026-09-01')]), 'Beto');
  assert.equal(vendedorInicial([v('Ana', '2026-08-01'), v('Beto', '2026-09-01')]), 'Beto');
});

test('sin vendedor no hay asignado', () => {
  assert.equal(vendedorInicial([v(null, '2026-09-01'), v('', '2026-09-02')]), null);
  assert.equal(vendedorInicial([]), null);
});

test('una cobertura suelta no genera aviso; varias seguidas sí', () => {
  const corte = '2026-09-30';
  assert.equal(vendedorSugerido([v('Ana', '2026-08-01'), v('Beto', '2026-09-20')], 'Ana', corte), null);
  const seguido = [v('Ana', '2026-07-15'), v('Beto', '2026-08-20'), v('Beto', '2026-09-20')];
  assert.equal(vendedorSugerido(seguido, 'Ana', corte), 'Beto');
  // Si el asignado también le vende igual o más, no hay aviso.
  assert.equal(vendedorSugerido([...seguido, v('Ana', '2026-08-25'), v('Ana', '2026-09-25')], 'Ana', corte), null);
  assert.equal(vendedorSugerido(seguido, 'ANA', corte), 'Beto');
});
