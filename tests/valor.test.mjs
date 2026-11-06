import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recuperacion, potencial, basePotencial, percentil, valor, explicarValor, PESOS_POR_DEFECTO,
} from '../supabase/functions/_shared/valor.ts';

test('recuperación: 0 dentro de su ritmo, sube con el atraso y tiene tope', () => {
  assert.equal(recuperacion({ dias_sin_comprar: 20, cadencia_dias: 30 }), 0);
  assert.equal(recuperacion({ dias_sin_comprar: 60, cadencia_dias: 30 }), 0.5);
  assert.equal(recuperacion({ dias_sin_comprar: 90, cadencia_dias: 30 }), 1);
  // Pasados 6 meses baja: a los 18 meses o más queda en el piso de 0,3.
  assert.ok(recuperacion({ dias_sin_comprar: 360, cadencia_dias: 30 }) < 1);
  assert.ok(Math.abs(recuperacion({ dias_sin_comprar: 900, cadencia_dias: 30 }) - 0.3) < 1e-9);
  // El mismo atraso pesa distinto según cada cuánto compra el cliente.
  assert.ok(recuperacion({ dias_sin_comprar: 45, cadencia_dias: 15 }) > recuperacion({ dias_sin_comprar: 45, cadencia_dias: 60 }));
  // Un solo día de compra: se usa la cadencia de referencia.
  assert.equal(recuperacion({ dias_sin_comprar: 120, cadencia_dias: null }), 0.5);
  assert.equal(recuperacion({ dias_sin_comprar: null, cadencia_dias: 30 }), null);
});

test('potencial compara cajas y frecuencia con la base, sin que un extremo lo distorsione', () => {
  const cliente = (cajas, dias, meses) => ({
    cajas_total: cajas, dias_con_compra: dias, primera_compra: '2026-01-01',
    ultima_compra: new Date(Date.UTC(2026, 0, 1) + meses * 30.44 * 86400000).toISOString().slice(0, 10),
  });
  const base = basePotencial([cliente(10, 2, 10), cliente(40, 8, 10), cliente(100, 10, 10), cliente(100000, 10, 10)]);
  const chico = potencial(cliente(10, 2, 10), base);
  const grande = potencial(cliente(100, 10, 10), base);
  assert.ok(grande > chico);
  assert.ok(chico < 0.25 && grande > 0.6);
  assert.equal(potencial({ cajas_total: null, dias_con_compra: 0, primera_compra: null, ultima_compra: null }, base), null);
  assert.equal(percentil(5, [1, 5, 9]), 0.5);
});

test('valor: un factor que falta queda neutro y el peso marca la diferencia máxima', () => {
  assert.equal(valor({}), 50);
  // Solo cambia recuperación: la diferencia entre el peor y el mejor es su peso (25 de 100).
  assert.equal(valor({ recuperacion: 1 }) - valor({ recuperacion: 0 }), PESOS_POR_DEFECTO.recuperacion);
  assert.equal(valor({ recorrido: 1, recuperacion: 1, oportunidad: 1, potencial: 1 }), 100);
  // Pesos que no suman 100 se respetan en proporción.
  assert.equal(valor({ recuperacion: 1 }, { recorrido: 1, recuperacion: 1, oportunidad: 0, potencial: 0 }), 75);
});

test('las frases salen de los números, no de la IA', () => {
  assert.deepEqual(explicarValor({ dias_sin_comprar: 60, cadencia_dias: 30 }, { potencial: 0.9 }),
    ['Lleva 60 días sin comprar y suele comprar cada 30.', 'Está entre los clientes que más compran.']);
  assert.deepEqual(explicarValor({ dias_sin_comprar: 10, cadencia_dias: 30 }, {}),
    ['Compró hace 10 días; está dentro de su ritmo (cada 30).']);
  assert.deepEqual(explicarValor({ dias_sin_comprar: null, cadencia_dias: null }, { potencial: null }), ['Todavía no compró.']);
});
