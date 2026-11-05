import { allClients, beginImport } from "../_shared/import-batch.ts";
import { limpiarSinDato, normalizarUbicacion } from "../_shared/etl/ventas.ts";
import { currencyNumber, coordinateNumber, importDate, joinStreet, argentinaCoordinates, repararCodificacion } from "../_shared/import-values.ts";
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

/**
 * ═══════════════════════════════════════════════════════════════
 * ETL: process-clientes-maestro — v1.1
 * ═══════════════════════════════════════════════════════════════
 *
 * Ingesta del MAESTRO DE CLIENTES (cartera oficial), independiente de ventas.
 *
 * Soporta dos layouts:
 *  A) Maestro WIWO  → columnas: Id, Código, Razón Social, Fantasia, CUIT,
 *     Provincia, Dirección, Ciudad, Teléfono, Celular, Correo, Categorías, Vendedor
 *  B) Actualización geográfica → columnas: RAZON SOCIAL / NOM. FANTASIA,
 *     CUIT / DNI, Provincia, Calle, Número, Ciudad, Latitud, Longitud,
 *     Categorías Cliente, Vendedor
 *
 * REGLAS:
 * • El maestro es la fuente de verdad del VENDEDOR de cartera → vendedor_actual.
 * • Los clientes sin ventas se crean igual, con métricas en cero
 *   (categoria_recencia = 'SIN_COMPRAS').
 * • NUNCA toca: cliente_feedbacks, excluir_recomendaciones, motivo_exclusion,
 *   last_recommendation_at, ultima_visita, asignaciones ni métricas de ventas.
 * • Las coordenadas del archivo se escriben en client_places como principales.
 * ═══════════════════════════════════════════════════════════════
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ETL_VERSION = 'maestro-v2.0';

interface FileMetadata {
  name?: string;
  size?: number;
  lastModified?: number;
  sha256?: string | null;
  sheetName?: string;
  headerRow?: number;
}

type SupabaseAdminClient = SupabaseClient<any, 'public', any>;

// === MAPEO BARRIOS → COMUNAS DE CABA ===
const BARRIOS_A_COMUNA: Record<string, string> = {
  'RETIRO': 'COMUNA 1', 'SAN NICOLAS': 'COMUNA 1', 'PUERTO MADERO': 'COMUNA 1',
  'SAN TELMO': 'COMUNA 1', 'MONTSERRAT': 'COMUNA 1', 'CONSTITUCION': 'COMUNA 1',
  'RECOLETA': 'COMUNA 2',
  'BALVANERA': 'COMUNA 3', 'SAN CRISTOBAL': 'COMUNA 3',
  'LA BOCA': 'COMUNA 4', 'BARRACAS': 'COMUNA 4', 'PARQUE PATRICIOS': 'COMUNA 4', 'NUEVA POMPEYA': 'COMUNA 4',
  'ALMAGRO': 'COMUNA 5', 'BOEDO': 'COMUNA 5',
  'CABALLITO': 'COMUNA 6',
  'FLORES': 'COMUNA 7', 'PARQUE CHACABUCO': 'COMUNA 7',
  'VILLA SOLDATI': 'COMUNA 8', 'VILLA RIACHUELO': 'COMUNA 8', 'VILLA LUGANO': 'COMUNA 8',
  'LINIERS': 'COMUNA 9', 'MATADEROS': 'COMUNA 9', 'PARQUE AVELLANEDA': 'COMUNA 9',
  'VILLA REAL': 'COMUNA 10', 'MONTE CASTRO': 'COMUNA 10', 'VERSALLES': 'COMUNA 10',
  'FLORESTA': 'COMUNA 10', 'VELEZ SARSFIELD': 'COMUNA 10', 'VILLA LURO': 'COMUNA 10',
  'VILLA GENERAL MITRE': 'COMUNA 11', 'VILLA DEVOTO': 'COMUNA 11',
  'VILLA DEL PARQUE': 'COMUNA 11', 'VILLA SANTA RITA': 'COMUNA 11',
  'COGHLAN': 'COMUNA 12', 'SAAVEDRA': 'COMUNA 12', 'VILLA URQUIZA': 'COMUNA 12', 'VILLA PUEYRREDON': 'COMUNA 12',
  'NUÑEZ': 'COMUNA 13', 'BELGRANO': 'COMUNA 13', 'COLEGIALES': 'COMUNA 13',
  'PALERMO': 'COMUNA 14',
  'CHACARITA': 'COMUNA 15', 'VILLA CRESPO': 'COMUNA 15', 'PATERNAL': 'COMUNA 15',
  'VILLA ORTUZAR': 'COMUNA 15', 'AGRONOMIA': 'COMUNA 15', 'PARQUE CHAS': 'COMUNA 15',
  'CONGRESO': 'COMUNA 5', 'ONCE': 'COMUNA 3', 'ABASTO': 'COMUNA 3',
  'MICROCENTRO': 'COMUNA 1', 'TRIBUNALES': 'COMUNA 1',
};

const PROVINCIA_NORM: Record<string, string> = {
  'CABA': 'CABA',
  'CDAD. AUTONOMA DE BUENOS AIRES': 'CABA',
  'CDAD AUTONOMA DE BUENOS AIRES': 'CABA',
  'CIUDAD AUTONOMA DE BUENOS AIRES': 'CABA',
  'C.A.B.A.': 'CABA',
  'CAPITAL FEDERAL': 'CABA',
  'BUENOS AIRES': 'Provincia de Buenos Aires',
  'BS AS': 'Provincia de Buenos Aires',
  'BS. AS.': 'Provincia de Buenos Aires',
  'PBA': 'Provincia de Buenos Aires',
  'PROVINCIA DE BUENOS AIRES': 'Provincia de Buenos Aires',
};

// Valores basura que trae el ERP como placeholder
const PLACEHOLDERS = new Set(['', '0', '-', 'N/A', 'NA', 'NULL', '(EN BLANCO)', 'SIN DATOS']);

const isEmpty = (v: any): boolean => {
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  return s === '' || PLACEHOLDERS.has(s.toUpperCase());
};

const toStr = (v: any): string | null => (isEmpty(v) ? null : repararCodificacion(String(v)).trim());

const toFloatCoord = coordinateNumber;

/** Normaliza CUIT aunque venga como número o en notación científica (2.713382e+10). */
const normalizeCuit = (v: any): string | null => {
  if (isEmpty(v)) return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return String(Math.round(v));
  }
  const s = String(v).trim();
  // La notación científica perdió dígitos: no sirve para identificar a nadie.
  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(s)) return null;
  const digits = s.replace(/\D/g, '');
  return digits || null;
};

const normalizeClientId = (v: any): string | null => {
  if (isEmpty(v)) return null;
  const raw = String(v).trim();
  if (/^\d+(\.0+)?$/.test(raw)) return String(parseInt(raw, 10));
  return raw;
};

const normalizeName = (v: any): string | null => {
  const s = toStr(v);
  if (!s) return null;
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
};

function getFieldValue(obj: Record<string, any>, fieldNames: string[]): any {
  for (const f of fieldNames) if (obj[f] !== undefined) return obj[f];
  const keys = Object.keys(obj);
  for (const f of fieldNames) {
    for (const k of keys) if (k.toLowerCase() === f.toLowerCase()) return obj[k];
  }
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  for (const f of fieldNames) {
    const nf = norm(f);
    for (const k of keys) if (norm(k) === nf) return obj[k];
  }
  return undefined;
}

const normalizeProvincia = (prov: string | null): string | null => {
  if (!prov) return null;
  const key = prov.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return PROVINCIA_NORM[key] || prov;
};

interface GeoResult { barrio: string | null; comuna: string | null; ciudad: string | null; provincia: string | null; }

function normalizarGeografia(ciudadRaw: string | null): GeoResult {
  if (!ciudadRaw) return { barrio: null, comuna: null, ciudad: null, provincia: null };
  const u = ciudadRaw.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const barrioKey = Object.keys(BARRIOS_A_COMUNA).find(
    (k) => k.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === u
  );
  if (barrioKey) return { barrio: barrioKey, comuna: BARRIOS_A_COMUNA[barrioKey], ciudad: 'CABA', provincia: 'CABA' };
  if (u === 'CABA' || u === 'CIUDAD AUTONOMA DE BUENOS AIRES' || u === 'CAPITAL FEDERAL') {
    return { barrio: null, comuna: null, ciudad: 'CABA', provincia: 'CABA' };
  }
  if (u.includes('LA PLATA')) {
    const m = u.match(/LA PLATA\s*\(([^)]+)\)/);
    return { barrio: m ? m[1].trim() : null, comuna: null, ciudad: 'LA PLATA', provincia: 'Provincia de Buenos Aires' };
  }
  if (['CITY BELL', 'GONNET', 'ABASTO'].includes(u)) {
    return { barrio: u, comuna: null, ciudad: 'LA PLATA', provincia: 'Provincia de Buenos Aires' };
  }
  return { barrio: null, comuna: null, ciudad: u, provincia: null };
}

const splitCategorias = (v: any): string[] => {
  const s = toStr(v);
  if (!s) return [];
  return Array.from(new Set(
    s.split(/[/|,;]/).map((x) => x.trim().toUpperCase()).filter((x) => x.length > 0 && limpiarSinDato(x) !== null)
  ));
};

const canalFromCategorias = (cats: string[]): string => {
  const joined = cats.join(' ');
  return /RESTAURANT|HOTEL|GASTRONOMIA|WINEBAR|BAR|ONTRADE/.test(joined) ? 'ON_TRADE' : 'OFF_TRADE';
};

interface MaestroRow {
  client_id: string | null;
  cuit_dni: string | null;
  razon_social: string | null;
  fantasia: string | null;
  direccion: string | null;
  codigo_postal: string | null;
  ciudad: string | null;
  provincia: string | null;
  telefonos: string[];
  emails: string[];
  etiquetas: string[];
  vendedor: string | null;
  lat: number | null;
  long: number | null;
}

function parseRow(row: Record<string, any>): MaestroRow {
  const client_id = normalizeClientId(getFieldValue(row, ['Id', 'ID', 'id', 'client_id', 'Código', 'Codigo']));
  const cuit_dni = normalizeCuit(getFieldValue(row, ['CUIT', 'CUIT / DNI', 'CUIT/DNI', 'CUIT DNI', 'cuit_dni']));

  const razonRaw = toStr(getFieldValue(row, [
    'Razón Social', 'Razon Social', 'RAZON SOCIAL / NOM. FANTASIA', 'razon_social',
  ]));
  const fantasia = toStr(getFieldValue(row, ['Fantasia', 'Fantasía', 'fantasia']));

  // R7: la dirección de verdad es Calle + Número. Aunque venga el campo único
  // "Dirección", se le suma la altura de la columna Número si falta.
  const calle = toStr(getFieldValue(row, ['Calle', 'calle']));
  const numero = toStr(getFieldValue(row, ['Número', 'Numero', 'numero', 'Altura', 'Nro', 'N°']));
  const direccionUnica = toStr(getFieldValue(row, ['Dirección', 'Direccion', 'direccion']));
  const baseDireccion = direccionUnica || calle;
  const direccion = joinStreet(baseDireccion, numero);
  const codigo_postal = toStr(getFieldValue(row, ['Código Postal', 'Codigo Postal', 'CP', 'cp', 'codigo_postal']));

  const telefonos = [
    toStr(getFieldValue(row, ['Teléfono', 'Telefono', 'telefono'])),
    toStr(getFieldValue(row, ['Celular', 'celular'])),
  ].filter(Boolean) as string[];

  const emails = [toStr(getFieldValue(row, ['Correo', 'correo', 'Email', 'email', 'E-mail']))].filter(Boolean) as string[];

  const ubicacion = normalizarUbicacion(getFieldValue(row, ['Provincia', 'provincia']), getFieldValue(row, ['Ciudad', 'ciudad', 'Localidad']));
  return {
    client_id,
    cuit_dni,
    razon_social: razonRaw,
    fantasia,
    direccion,
    codigo_postal,
    ciudad: ubicacion.ciudad,
    provincia: ubicacion.provincia,
    telefonos: Array.from(new Set(telefonos)),
    emails: Array.from(new Set(emails)),
    etiquetas: splitCategorias(getFieldValue(row, ['Categorías', 'Categorias', 'Categorías Cliente', 'Categorias Cliente'])),
    vendedor: toStr(getFieldValue(row, ['Vendedor', 'vendedor'])),
    lat: toFloatCoord(getFieldValue(row, ['Latitud', 'latitud', 'lat'])),
    long: toFloatCoord(getFieldValue(row, ['Longitud', 'longitud', 'long', 'lng'])),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let supabase: SupabaseAdminClient | null = null;
  let batchId: string | null = null;
  let committedResponse: any = null;
  try {
    supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: 'Sesión requerida' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
      });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ success: false, error: 'Sesión inválida o vencida' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
      });
    }

    const { data: callerProfile, error: profileError } = await supabase
      .from('profiles')
      .select('rol')
      .eq('user_id', authData.user.id)
      .eq('activo', true)
      .single();
    // Roles en cascada: administrador ⊇ asignador
    if (profileError || (callerProfile?.rol !== 'asignador' && callerProfile?.rol !== 'administrador')) {
      return new Response(JSON.stringify({ success: false, error: 'Solo un asignador o administrador puede importar datos' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403,
      });
    }

    const body = await req.json() as { rows: Record<string, any>[]; requestId?: string; fileMetadata?: FileMetadata };
    const rawRows = body?.rows;
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No rows provided' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }
    if (rawRows.length > 50_000) {
      return new Response(JSON.stringify({ success: false, error: 'La carga supera el límite de 50.000 filas' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 413,
      });
    }

    const fileMetadata = body.fileMetadata || {};
    const lastModified = typeof fileMetadata.lastModified === 'number' && fileMetadata.lastModified > 0
      ? new Date(fileMetadata.lastModified).toISOString()
      : null;
    const started = await beginImport(supabase, body.requestId, {
        tipo: 'maestro',
        version_etl: ETL_VERSION,
        archivo_nombre: fileMetadata.name || 'archivo_sin_nombre',
        archivo_sha256: fileMetadata.sha256 || null,
        archivo_tamano: fileMetadata.size ?? null,
        archivo_ultima_modificacion: lastModified,
        hoja: fileMetadata.sheetName || null,
        fila_encabezado: fileMetadata.headerRow ?? null,
        filas_origen: rawRows.length,
        reemplaza_existentes: false,
        usuario_id: authData.user.id,
        usuario_email: authData.user.email || null,
      });
    if (started.response) return new Response(JSON.stringify(started.response), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    batchId = started.id;

    for (let i = 0; i < rawRows.length; i += 500) {
      const stagingRows = rawRows.slice(i, i + 500).map((payload, offset) => ({
        batch_id: batchId,
        tipo_fila: 'principal',
        numero_fila: i + offset + 1,
        payload,
      }));
      const { error: stagingError } = await supabase.from('import_staging_rows').upsert(stagingRows, { onConflict: 'batch_id,tipo_fila,numero_fila' });
      if (stagingError) throw new Error(`No se pudo preparar el lote: ${stagingError.message}`);
    }

    console.log(`📦 ${ETL_VERSION} — ${rawRows.length} filas recibidas`);

    // ── FASE 1: Parseo y consolidación por cliente ──
    const parsed: MaestroRow[] = [];
    let sinIdentificador = 0;
    for (const row of rawRows) {
      const p = parseRow(row);
      if (p.lat === 0 && p.long === 0) { p.lat = null; p.long = null; }
      if (!p.razon_social && !p.cuit_dni && !p.client_id) { sinIdentificador++; continue; }
      parsed.push(p);
    }

    // ── FASE 2: Resolución de client_id (CUIT → Razón Social → Id del archivo) ──
    // IMPORTANTE: el CUIT manda sobre el "Id" del archivo. El Id que traen los
    // informes suele ser por comprobante, no por empresa: usarlo primero genera
    // un cliente nuevo por cada factura (duplicados masivos).
    const existingClients = await allClients(supabase);
    const existingIds = new Map(existingClients.map(c => [c.client_id, c]));
    const cuitToIds = new Map<string, string[]>();
    const nameToIds = new Map<string, string[]>();
    for (const c of existingClients) {
      if (c.cuit_dni) cuitToIds.set(c.cuit_dni, [...(cuitToIds.get(c.cuit_dni) || []), c.client_id]);
      const name = normalizeName(c.razon_social);
      if (name) nameToIds.set(name, [...(nameToIds.get(name) || []), c.client_id]);
    }
    const byClientId = new Map<string, MaestroRow>();
    let sinResolver = 0;
    const noResueltos: { razon_social: string | null; cuit_dni: string | null }[] = [];

    // Identidad estable dentro del propio archivo: si dos filas comparten CUIT
    // (o razón social sin CUIT) deben terminar en el mismo client_id.
    const localCuitToId = new Map<string, string>();
    const localNameToId = new Map<string, string>();

    for (const p of parsed) {
      const nameKey = p.razon_social ? normalizeName(p.razon_social) : null;
      const matches = p.cuit_dni ? cuitToIds.get(p.cuit_dni) || [] : [];
      const names = nameKey ? nameToIds.get(nameKey) || [] : [];
      const explicit = p.client_id ? existingIds.get(p.client_id) : undefined;
      if (explicit && p.cuit_dni && explicit.cuit_dni && p.cuit_dni !== explicit.cuit_dni) throw new Error(`El ID ${p.client_id} pertenece a otro CUIT. No se modificó nada.`);
      // Existing official ID disambiguates branches. New IDs require review when CUIT is shared.
      const resolved = explicit?.client_id ||
        (matches.length === 1 ? matches[0] : undefined) ||
        (names.length === 1 && (!matches.length || matches.includes(names[0])) ? names[0] : undefined) ||
        (matches.length === 0 ? p.client_id || (p.cuit_dni ? localCuitToId.get(p.cuit_dni) || p.cuit_dni : nameKey ? localNameToId.get(nameKey) : null) : null);
      if (resolved) {
        if (p.cuit_dni && !localCuitToId.has(p.cuit_dni)) localCuitToId.set(p.cuit_dni, resolved);
        if (nameKey && !p.cuit_dni && !localNameToId.has(nameKey)) localNameToId.set(nameKey, resolved);
      }


      if (!resolved) {
        sinResolver++;
        noResueltos.push({ razon_social: p.razon_social, cuit_dni: p.cuit_dni });
        continue;
      }

      const existing = byClientId.get(resolved);
      if (existing && existing.client_id === resolved && existing.direccion && p.direccion && normalizeName(existing.direccion) !== normalizeName(p.direccion)) {
        throw new Error(`El cliente ${resolved} tiene domicilios diferentes en el archivo. Identificá cada sucursal antes de importar; no se modificó nada.`);
      }
      if (!existing) {
        byClientId.set(resolved, { ...p, client_id: resolved });
      } else {
        // Merge: se completa lo faltante, se agregan teléfonos/emails/etiquetas
        byClientId.set(resolved, {
          client_id: resolved,
          cuit_dni: existing.cuit_dni || p.cuit_dni,
          razon_social: existing.razon_social || p.razon_social,
          fantasia: existing.fantasia || p.fantasia,
          direccion: existing.direccion || p.direccion,
          codigo_postal: existing.codigo_postal || p.codigo_postal,
          ciudad: existing.ciudad || p.ciudad,
          provincia: existing.provincia || p.provincia,
          telefonos: Array.from(new Set([...existing.telefonos, ...p.telefonos])),
          emails: Array.from(new Set([...existing.emails, ...p.emails])),
          etiquetas: Array.from(new Set([...existing.etiquetas, ...p.etiquetas])),
          vendedor: existing.vendedor || p.vendedor,
          lat: existing.lat ?? p.lat,
          long: existing.long ?? p.long,
        });
      }
    }

    const clientes = Array.from(byClientId.values());
    console.log(`🧮 ${clientes.length} clientes únicos | ${sinResolver} sin identificador resoluble`);

    const results = {
      clientes_nuevos: 0,
      clientes_actualizados: 0,
      clientes_errores: 0,
      coordenadas_actualizadas: 0,
      sin_vendedor: 0,
      sin_resolver: sinResolver,
      errores: [] as string[],
    };

    const buildCommonFields = (c: MaestroRow) => {
      const geo = normalizarGeografia(c.ciudad);
      if (c.provincia && normalizeProvincia(c.provincia) !== "CABA" && geo.provincia === "CABA") { geo.ciudad = c.ciudad; geo.barrio = null; geo.comuna = null; geo.provincia = normalizeProvincia(c.provincia); }
      const provincia = normalizeProvincia(c.provincia) || geo.provincia;
      const etiquetas = c.etiquetas;
      const data: Record<string, any> = {
        razon_social: c.razon_social,
        cuit_dni: c.cuit_dni,
        fantasia: c.fantasia,
        direccion_principal: c.direccion,
        codigo_postal: c.codigo_postal,
        ciudad_principal: geo.ciudad || (c.ciudad ? c.ciudad.toUpperCase() : null),
        provincia_principal: provincia,
        etiquetas: etiquetas.length ? etiquetas : null,
        canal: etiquetas.length ? canalFromCategorias(etiquetas) : null,
        telefonos: c.telefonos.length ? c.telefonos : null,
        emails: c.emails.length ? c.emails : null,
      };
      if (geo.barrio) data.barrio_principal = geo.barrio;
      // El maestro define el vendedor oficial de cartera
      if (c.vendedor) data.vendedor_actual = c.vendedor.toUpperCase();
      else results.sin_vendedor++;
      // Nunca escribimos null encima de un dato existente
      for (const k of Object.keys(data)) if (data[k] === null || data[k] === undefined) delete data[k];
      return data;
    };

    if (sinResolver || sinIdentificador) throw new Error(`${sinResolver + sinIdentificador} filas no tienen una identidad de cliente inequívoca. No se modificó nada.`);
    const payload: Record<string, any>[] = clientes.map(c => ({ client_id: String(c.client_id), ...buildCommonFields(c) }));
    const places = clientes.filter(c => argentinaCoordinates(c.lat, c.long)).map(c => ({
      client_id: String(c.client_id), lat: c.lat, long: c.long, direccion_principal: c.direccion,
      codigo_postal: c.codigo_postal, provincia_principal: normalizeProvincia(c.provincia),
      barrio_principal: payload.find(p => p.client_id === c.client_id)?.barrio_principal || null,
    }));
    const invalidCoordinates = clientes.filter(c => (c.lat !== null || c.long !== null) && !argentinaCoordinates(c.lat, c.long));
    if (invalidCoordinates.length) throw new Error(`${invalidCoordinates.length} clientes tienen coordenadas inválidas. Corregí ambas coordenadas o dejá ambas celdas vacías.`);
    const { data: saved, error: saveError } = await supabase.rpc('guardar_importacion', {
      p_batch_id: batchId, p_clientes: payload, p_places: places,
    });
    if (saveError) throw new Error(saveError.message);
    committedResponse = saved;
    Object.assign(results, saved.results);

    // ── Resumen por vendedor ──
    const vendedorAgg = new Map<string, number>();
    for (const c of clientes) {
      const v = c.vendedor ? c.vendedor.toUpperCase() : 'SIN VENDEDOR';
      vendedorAgg.set(v, (vendedorAgg.get(v) || 0) + 1);
    }
    const vendedor_breakdown = Array.from(vendedorAgg.entries())
      .map(([vendedor, clientes]) => ({ vendedor, clientes }))
      .sort((a, b) => b.clientes - a.clientes);

    console.log('🎉 Maestro procesado:', results);

    // OT7: conciliación de entidades — cuántas razones sociales del archivo
    // terminaron fusionadas en un mismo cliente por identidad (CUIT / nombre).
    const razonesSociales = new Set(
      parsed.map((p) => normalizeName(p.razon_social)).filter(Boolean) as string[]
    ).size;
    const conciliacion_entidades = {
      razones_sociales: razonesSociales,
      clientes_unicos: clientes.length,
      fusionados_por_identidad: Math.max(0, razonesSociales - clientes.length),
    };

    const estado = results.clientes_errores > 0 || results.errores.length > 0 || sinResolver > 0
      ? 'completado_con_errores'
      : 'completado';
    const { error: closeBatchError } = await supabase
      .from('import_batches')
      .update({
        estado,
        resultado: results,
        reconciliacion: {
          filas_origen: rawRows.length,
          filas_sin_identificador: sinIdentificador,
          filas_sin_resolver: sinResolver,
          ...conciliacion_entidades,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    if (closeBatchError) throw new Error(`Los datos se procesaron pero no se pudo cerrar el lote: ${closeBatchError.message}`);

    const { error: cleanupError } = await supabase
      .from('import_staging_rows')
      .delete()
      .eq('batch_id', batchId);
    if (cleanupError) console.error('No se pudo limpiar staging:', cleanupError.message);

    const responseBody = {
      success: true,
      batch_id: batchId,
      results,
      metadata: {
        fecha_carga: new Date().toISOString(),
        version_etl: ETL_VERSION,
        filas_origen: rawRows.length,
        clientes_unicos: clientes.length,
        filas_sin_identificador: sinIdentificador,
      },
      conciliacion_entidades,
      vendedor_breakdown,
      no_resueltos: noResueltos.slice(0, 20),
    };
    const { error: responseError } = await supabase.from('import_batches').update({ respuesta: responseBody }).eq('id', batchId);
    if (responseError) console.error('No se pudo completar el resumen del lote:', responseError.message);
    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (error) {
    console.error('💥 Error:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    if (committedResponse) return new Response(JSON.stringify({ ...committedResponse, aviso: 'Los datos se guardaron. No se pudo completar el resumen; no vuelvas a cargar el archivo.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
    if (supabase && batchId) {
      const { error: auditError } = await supabase
        .from('import_batches')
        .update({ estado: 'fallido', error_message: message, completed_at: new Date().toISOString() })
        .eq('id', batchId).is('aplicado_at', null);
      if (auditError) console.error('No se pudo registrar el fallo del lote:', auditError.message);
    }
    return new Response(JSON.stringify({
      success: false,
      error: message,
      batch_id: batchId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
