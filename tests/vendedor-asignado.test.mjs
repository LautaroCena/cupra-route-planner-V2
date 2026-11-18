import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ultimoVendedor } from '../supabase/functions/_shared/vendedor-asignado.ts';

const v = (vendedor, fecha) => ({ vendedor, fecha });

test('el asignado es el último que le vendió, aunque otro le haya vendido más', () => {
  const ventas = [v('Ana', '2026-07-01'), v('Ana', '2026-08-01'), v('Ana', '2026-09-01'), v('Beto', '2026-09-20')];
  assert.equal(ultimoVendedor(ventas), 'Beto');
});

test('si el último día le vendieron dos, gana el de más renglones; empate, por nombre', () => {
  assert.equal(ultimoVendedor([v('Ana', '2026-09-20'), v('Beto', '2026-09-20'), v('Beto', '2026-09-20')]), 'Beto');
  assert.equal(ultimoVendedor([v('Beto', '2026-09-20'), v('Ana', '2026-09-20')]), 'Ana');
});

test('sin vendedor no hay asignado', () => {
  assert.equal(ultimoVendedor([v(null, '2026-09-01'), v('', '2026-09-02')]), null);
  assert.equal(ultimoVendedor([]), null);
  assert.equal(ultimoVendedor([v('Ana', '2026-08-01'), v('', '2026-09-02')]), 'Ana');
});
