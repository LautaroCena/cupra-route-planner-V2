import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparLocales, claveNombre, posiblesDuplicados, nombresAlternativos } from '../supabase/functions/_shared/etl/locales.ts';

// Coordenadas inventadas en Buenos Aires.
const p = (lat, long, peso) => ({ lat, long, peso });

test('coordenadas cercanas son el mismo local y el más usado queda principal', () => {
  const locales = agruparLocales([p(-34.6000, -58.4000, 3), p(-34.6005, -58.4003, 10), p(-34.7000, -58.3000, 2)]);
  assert.equal(locales.length, 2);
  const principal = locales.at(-1);
  assert.equal(principal.peso, 13);
  assert.deepEqual([principal.principal.lat, principal.principal.long], [-34.6005, -58.4003]);
  assert.equal(locales[0].peso, 2);
});

test('un solo punto es un solo local', () => {
  assert.equal(agruparLocales([p(-34.6, -58.4, 1)]).length, 1);
  assert.deepEqual(agruparLocales([]), []);
});

test('la clave de nombre ignora mayúsculas, acentos, puntos y sufijos societarios', () => {
  assert.equal(claveNombre('La Posta S.R.L.'), claveNombre('LA POSTA SRL'));
  assert.equal(claveNombre('Vinoteca Ñandú S.A.'), 'VINOTECA NANDU');
  assert.equal(claveNombre('SA'), null);
});

test('avisa clientes distintos con el mismo nombre, sin unirlos', () => {
  const dup = posiblesDuplicados([
    { client_id: '20123456786', documento: '20123456786', nombres: ['Comercio Prueba SRL'] },
    { client_id: '2012345678', documento: '2012345678', nombres: ['COMERCIO PRUEBA S.R.L.'] },
    { client_id: '30111111118', documento: '30111111118', nombres: ['Otro Comercio'] },
  ]);
  assert.equal(dup.length, 1);
  assert.deepEqual(dup[0].clientes.map((c) => c.client_id).sort(), ['2012345678', '20123456786']);
});

test('los nombres alternativos no repiten variantes de escritura', () => {
  assert.deepEqual(nombresAlternativos('La Posta SRL', ['LA POSTA S.R.L.', 'Bodega Posta', 'BODEGA POSTA']), ['Bodega Posta']);
});
