import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../supabase/functions/', import.meta.url));
// Supabase empaqueta la carpeta de la función y _shared, no las funciones vecinas.
for (const name of ['complete-map-route', 'generate-recommendations', 'review-prospect', 'prospect-discovery', 'process-ventas-excel', 'cleanup-visited-assignments', 'check-pending-assignments', 'generate-briefing', 'extract-feedback', 'admin-create-user', 'walking-route']) {
  test(`${name} puede empaquetarse sin carpetas de otras funciones`, async () => {
    const visited = new Set();
    async function visit(file) {
      if (visited.has(file)) return;
      visited.add(file);
      const source = await readFile(file, 'utf8');
      for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
        if (!fileName.startsWith('.')) continue;
        const target = resolve(dirname(file), fileName);
        const folder = relative(root, target).split(sep)[0];
        assert.ok(folder === name || folder === '_shared', `${relative(root, file)} importa ${fileName}, que no se incluye al desplegar`);
        await visit(target);
      }
    }
    await visit(resolve(root, name, 'index.ts'));
  });
}
