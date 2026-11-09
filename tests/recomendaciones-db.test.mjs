import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { armarRecomendaciones, filaParaDb } from "../supabase/functions/generate-recommendations/filas.ts";

// Lo que guarda el motor tiene que entrar en la base real. Este error ya pasó una vez:
// el motor mandaba una columna nueva (client_place_id) que la tabla no tenía, y la
// generación fallaba recién en producción. Datos inventados.
const CARPETA = new URL("../supabase/migrations/", import.meta.url);
const ENTORNO = `
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

async function baseMigrada() {
  const db = new PGlite();
  await db.exec(ENTORNO);
  for (const archivo of (await readdir(CARPETA)).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = (await readFile(new URL(archivo, CARPETA), "utf8")).replace(/CREATE EXTENSION[^;]*;/gi, "");
    await db.exec(`BEGIN;\n${sql}\n;COMMIT;`);
  }
  return db;
}

/** Inserta como lo haría PostgREST: cada clave es una columna; objetos como JSON. */
async function insertar(db, tabla, fila) {
  const claves = Object.keys(fila);
  const valores = claves.map((k) => {
    const v = fila[k];
    return v && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v;
  });
  await db.query(`INSERT INTO ${tabla} (${claves.map((k) => `"${k}"`).join(",")}) VALUES (${claves.map((_, i) => `$${i + 1}`).join(",")})`, valores);
}

test("las filas que arma el motor entran en recomendaciones_ia", async () => {
  const db = await baseMigrada();
  try {
    await db.exec(`
      INSERT INTO clientes(client_id, razon_social, rubro) VALUES ('20123456786', 'Comercio Prueba SRL', 'Vinoteca');
      INSERT INTO client_places(client_id, lat, long, direccion_principal, is_primary) VALUES ('20123456786', -34.6, -58.4, 'Calle 1', true);
    `);
    const { rows: [local] } = await db.query("SELECT id FROM client_places LIMIT 1");
    const base = {
      identity_key: "x", estado_comercial: "PERDIDO", score_geo: 80, score_comercial: 50, score_rotacion: 0, score_total: 60,
      distancia_km: 0.4, barrio: "Palermo", direccion: "Calle 1", rubro: "Vinoteca", vendedor_actual: null,
      dias_desde_ultima_compra: 120, ticket_promedio: null, monto_total_historico: null, feedbacks_recientes: [],
      prioridad_comercial: 70, cadencia_dias: 30, alerta_nc: null, origen: "cartera",
      factores: { recuperacion: 0.8, potencial: 0.5, oportunidad: 1 },
    };
    const plan = [{
      vendedor: { user_id: "6b7a309a-edb0-4dbd-8463-cfa8671020c2", nombre: "Vendedor Prueba" },
      hotspot: { lat: -34.6, lng: -58.4 },
      fueraDeSeleccion: new Set(),
      cobertura: { total: 2, avisos: [] },
      pool: new Map(),
      elegidos: [
        { ...base, client_id: "20123456786", razon_social: "Comercio Prueba", es_prospecto: false, lat: -34.6, long: -58.4, client_place_id: local.id },
        { ...base, client_id: "ChIJprueba", razon_social: "Lugar Prueba", es_prospecto: true, estado_comercial: "POTENCIAL", lat: -34.601, long: -58.401 },
      ],
    }];
    const filas = armarRecomendaciones(plan, {
      request_id: crypto.randomUUID(), nowIso: new Date().toISOString(), regalos: false,
      clientePorId: new Map([["20123456786", { razon_social: "Comercio Prueba SRL", todas_ciudades: ["CABA"] }]]),
      prospectoPorId: new Map([["ChIJprueba", { nombre: "Lugar Prueba", ciudad: "CABA" }]]),
      placesMap: new Map([["20123456786", { id: local.id, provincia_principal: "CABA" }]]),
      oportunidadDe: (c) => c.es_prospecto ? undefined : { nivel: 3, motivo: "fecha", fecha: "2026-12-24", evento: "Nochebuena", cita: null },
    });
    assert.equal(filas.length, 2);
    assert.ok(filas[0].justificacion.startsWith("Se acerca Nochebuena (24/12/2026)."));
    for (const fila of filas) await insertar(db, "recomendaciones_ia", filaParaDb(fila));
    const { rows } = await db.query("SELECT client_place_id, factores_ia->'oportunidad'->>'evento' AS evento FROM recomendaciones_ia ORDER BY es_prospecto");
    assert.deepEqual(rows.map((r) => [r.client_place_id, r.evento]), [[local.id, "Nochebuena"], [null, null]]);
  } finally {
    await db.close();
  }
});

test("una visita nueva reemplaza las pendientes de días anteriores del mismo negocio", async () => {
  const db = await baseMigrada();
  try {
    const { rows: [u] } = await db.query("INSERT INTO auth.users(email) VALUES ('v@prueba') RETURNING id");
    await db.query("INSERT INTO profiles(user_id, email, nombre, rol, activo) VALUES ($1, 'v@prueba', 'Vendedor Prueba', 'vendedor', true) ON CONFLICT (user_id) DO UPDATE SET rol='vendedor', activo=true", [u.id]);
    await db.exec(`INSERT INTO clientes(client_id, razon_social) VALUES ('c1', 'Uno'), ('c2', 'Dos');`);
    const insertar = (cliente, fecha, estado = "Asignado") => db.query(
      "INSERT INTO asignaciones_vendedores_clientes(vendedor_id, client_id, estado, fecha_programada) VALUES ($1, $2, $3, $4)", [u.id, cliente, estado, fecha]);
    await insertar("c1", "2026-11-01", "Visitado");
    await insertar("c1", "2026-11-05");
    await insertar("c2", "2026-11-05");
    // Hoy se vuelve a asignar c1: reemplaza la pendiente del 05/11, no la ya visitada ni la de otro cliente.
    await insertar("c1", "2026-11-09");
    const { rows } = await db.query("SELECT client_id, fecha_programada::text f, estado::text e FROM asignaciones_vendedores_clientes ORDER BY client_id, fecha_programada");
    assert.deepEqual(rows.map((r) => `${r.client_id} ${r.f} ${r.e}`), ["c1 2026-11-01 Visitado", "c1 2026-11-09 Asignado", "c2 2026-11-05 Asignado"]);
  } finally {
    await db.close();
  }
});
