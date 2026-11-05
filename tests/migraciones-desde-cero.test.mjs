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

test("todas las migraciones corren desde una base vacía", async () => {
  const db = new PGlite();
  try {
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
    assert.deepEqual(fallas, []);
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
