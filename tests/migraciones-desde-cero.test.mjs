import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const CARPETA = new URL("../supabase/migrations/", import.meta.url);

// Lo que Supabase trae de fábrica y PGlite no: se simula para probar el historial sin un servidor real.
const ENTORNO_SUPABASE = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_auth_admin;
  CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions; CREATE SCHEMA cron; CREATE SCHEMA net; CREATE SCHEMA vault;
  CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz DEFAULT now());
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS 'SELECT NULL::text';
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS 'SELECT NULL::jsonb';
  CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid);
  CREATE TABLE cron.job(jobid bigserial PRIMARY KEY,jobname text,schedule text,command text,active boolean DEFAULT true);
  CREATE FUNCTION cron.schedule(a text,b text,c text) RETURNS bigint LANGUAGE sql AS 'INSERT INTO cron.job(jobname,schedule,command) VALUES(a,b,c) RETURNING jobid';
  CREATE FUNCTION cron.unschedule(a text) RETURNS boolean LANGUAGE sql AS 'SELECT true';
  CREATE FUNCTION cron.alter_job(job_id bigint,schedule text DEFAULT NULL,command text DEFAULT NULL,database text DEFAULT NULL,username text DEFAULT NULL,active boolean DEFAULT NULL) RETURNS void LANGUAGE sql AS 'SELECT 1';
  CREATE PUBLICATION supabase_realtime;
  CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
  CREATE FUNCTION public.unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS 'SELECT $1';
`;

const TABLAS_CLAVE = ["clientes", "ventas_cupra", "prospectos", "profiles", "client_places", "asignaciones_vendedores_clientes", "cliente_feedbacks", "recomendaciones_ia", "import_batches", "feedback_extraccion", "notificaciones", "areas"];
const FUNCIONES_CLAVE = ["guardar_importacion", "guardar_asignaciones", "autoasignar_visita", "catalogo_visitas", "recompute_client_metrics", "guardar_ruta_mapa", "reasignar_pendientes", "aplicar_ventas_import", "pendientes_geocodificacion"];

async function baseMigrada() {
  const db = new PGlite();
  await db.exec(ENTORNO_SUPABASE);
  const archivos = (await readdir(CARPETA)).filter(f => f.endsWith(".sql")).sort();
  assert.ok(archivos.length > 0);
  const fallas = [];
  for (const archivo of archivos) {
    const sql = (await readFile(new URL(archivo, CARPETA), "utf8")).replace(/CREATE EXTENSION[^;]*;/gi, "");
    try {
      await db.exec(`BEGIN;\n${sql}\n;COMMIT;`);
    } catch (error) {
      await db.exec("ROLLBACK").catch(() => {});
      fallas.push(`${archivo}: ${error.message}`);
    }
  }
  return { db, fallas };
}

test("unir clientes mueve todo al correcto y no pierde una venta repetida en silencio", async () => {
  const { db, fallas } = await baseMigrada();
  try {
    assert.deepEqual(fallas, []);
    await db.exec(`
      INSERT INTO clientes(client_id, razon_social, fantasia, telefonos) VALUES
        ('20123456786', 'Comercio Prueba SRL', NULL, ARRAY['111']),
        ('RS_COMERCIO PRUEBA', 'Comercio Prueba', 'La Esquina', ARRAY['222']);
      INSERT INTO ventas_cupra(client_id, ticket, letra, fecha_emision, codigo_producto) VALUES
        ('20123456786', 'FV1', 'A', '2026-09-01', 'P1'), ('RS_COMERCIO PRUEBA', 'FV2', 'A', '2026-09-02', 'P1');
      INSERT INTO client_places(client_id, lat, long, direccion_principal, is_primary) VALUES
        ('20123456786', -34.6, -58.4, 'Calle 1', true), ('RS_COMERCIO PRUEBA', -34.6, -58.4, 'Calle 1', true),
        ('RS_COMERCIO PRUEBA', -34.7, -58.3, 'Calle 2', false);
    `);
    const { rows: [{ r }] } = await db.query("SELECT unir_clientes('RS_COMERCIO PRUEBA', '20123456786') r");
    assert.equal(r.movido.ventas_cupra, 1);
    const { rows: ventas } = await db.query("SELECT ticket FROM ventas_cupra WHERE client_id='20123456786' ORDER BY ticket");
    assert.deepEqual(ventas.map(v => v.ticket), ["FV1", "FV2"]);
    const { rows: locales } = await db.query("SELECT direccion_principal, is_primary FROM client_places WHERE client_id='20123456786' ORDER BY 1");
    assert.deepEqual(locales, [{ direccion_principal: "Calle 1", is_primary: true }, { direccion_principal: "Calle 2", is_primary: false }]);
    const { rows: [c] } = await db.query("SELECT nombres_alternativos, telefonos, fantasia FROM clientes WHERE client_id='20123456786'");
    assert.deepEqual([...c.nombres_alternativos].sort(), ["Comercio Prueba", "La Esquina"]);
    assert.deepEqual([...c.telefonos].sort(), ["111", "222"]);
    assert.equal(c.fantasia, "La Esquina");
    const { rows: quedan } = await db.query("SELECT 1 FROM clientes WHERE client_id='RS_COMERCIO PRUEBA'");
    assert.equal(quedan.length, 0);

    // La misma venta en los dos: se cancela todo y no se pierde nada.
    await db.exec(`
      INSERT INTO clientes(client_id, razon_social) VALUES ('RS_OTRO', 'Otro');
      INSERT INTO ventas_cupra(client_id, ticket, letra, fecha_emision, codigo_producto) VALUES ('RS_OTRO', 'FV1', 'A', '2026-09-01', 'P1');
    `);
    await assert.rejects(db.query("SELECT unir_clientes('RS_OTRO', '20123456786')"));
    const { rows: otro } = await db.query("SELECT count(*)::int n FROM ventas_cupra WHERE client_id='RS_OTRO'");
    assert.equal(otro[0].n, 1);
  } finally {
    await db.close();
  }
});

test("una venta de otro vendedor no cambia el asignado; varias seguidas generan aviso", async () => {
  const { db, fallas } = await baseMigrada();
  try {
    assert.deepEqual(fallas, []);
    await db.exec(`
      INSERT INTO clientes(client_id, razon_social) VALUES ('C1', 'Uno'), ('C2', 'Dos');
      INSERT INTO ventas_cupra(client_id, ticket, fecha_emision, codigo_producto, vendedor, tipo_comprobante) VALUES
        ('C1', 'A1', '2026-07-01', 'P', 'ANA', 'venta'), ('C1', 'A2', '2026-08-01', 'P', 'ANA', 'venta'),
        ('C1', 'B1', '2026-09-20', 'P', 'BETO', 'venta'),
        ('C2', 'A3', '2026-06-01', 'P', 'ANA', 'venta'), ('C2', 'A4', '2026-06-15', 'P', 'ANA', 'venta'),
        ('C2', 'B2', '2026-08-20', 'P', 'BETO', 'venta'), ('C2', 'B3', '2026-09-25', 'P', 'BETO', 'venta');
    `);
    await db.query("SELECT recompute_client_metrics()");
    // Sin asignado: se completa con el que más le vendió, no con el último.
    let { rows } = await db.query("SELECT client_id, vendedor_actual, vendedor_sugerido FROM clientes ORDER BY 1");
    assert.equal(rows[0].vendedor_actual.toUpperCase(), "ANA");
    assert.equal(rows[0].vendedor_sugerido, null);

    // Con asignado: nunca se pisa. Beto le vendió en 2 días de los últimos 90 y Ana en ninguno: aviso.
    await db.exec("UPDATE clientes SET vendedor_actual = 'ANA' WHERE client_id = 'C2'");
    await db.exec("INSERT INTO ventas_cupra(client_id, ticket, fecha_emision, codigo_producto, vendedor, tipo_comprobante) VALUES ('C1', 'B9', '2026-09-30', 'P', 'BETO', 'venta')");
    await db.query("SELECT recompute_client_metrics()");
    ({ rows } = await db.query("SELECT client_id, vendedor_actual, vendedor_sugerido FROM clientes ORDER BY 1"));
    const may = (s) => s?.toUpperCase() ?? null;
    assert.deepEqual(rows.map(r => [may(r.vendedor_actual), may(r.vendedor_sugerido)]), [["ANA", "BETO"], ["ANA", "BETO"]]);

    // Al pasarlo al sugerido, el aviso se limpia.
    await db.exec("UPDATE clientes SET vendedor_actual = 'BETO' WHERE client_id = 'C2'");
    ({ rows } = await db.query("SELECT vendedor_actual, vendedor_sugerido FROM clientes WHERE client_id = 'C2'"));
    assert.equal(rows[0].vendedor_actual.toUpperCase(), "BETO");
    assert.equal(rows[0].vendedor_sugerido, null);
  } finally {
    await db.close();
  }
});

test("todas las migraciones corren desde una base vacía", async () => {
  const { db, fallas } = await baseMigrada();
  try {
    const { rows: tablas } = await db.query("select table_name from information_schema.tables where table_schema='public'");
    const hay = new Set(tablas.map(t => t.table_name));
    assert.deepEqual(TABLAS_CLAVE.filter(t => !hay.has(t)), []);
    const { rows: funciones } = await db.query("select distinct p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
    const existen = new Set(funciones.map(f => f.proname));
    assert.deepEqual(FUNCIONES_CLAVE.filter(f => !existen.has(f)), []);
  } finally {
    await db.close();
  }
});
