import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajePublico, MENSAJE_GENERICO } from '../supabase/functions/_shared/errores.ts';

test('se muestran los mensajes para el usuario y se ocultan los técnicos', () => {
  assert.equal(mensajePublico(new Error('Elegí un barrio o seleccioná clientes para definir el centro.')), 'Elegí un barrio o seleccioná clientes para definir el centro.');
  assert.equal(mensajePublico(new Error('Could not find the \'client_place_id\' column of \'recomendaciones_ia\' in the schema cache')), MENSAJE_GENERICO);
  assert.equal(mensajePublico(new Error('duplicate key value violates unique constraint "x"')), MENSAJE_GENERICO);
  assert.equal(mensajePublico(new TypeError("Cannot read properties of undefined (reading 'lat')")), MENSAJE_GENERICO);
  // Un error de la base que llega como objeto, no como Error.
  assert.equal(mensajePublico({ code: 'PGRST204', message: 'algo' }), MENSAJE_GENERICO);
  assert.equal(mensajePublico(Object.assign(new Error('Fila repetida'), { code: '23505' })), MENSAJE_GENERICO);
  assert.equal(mensajePublico(null), MENSAJE_GENERICO);
});
