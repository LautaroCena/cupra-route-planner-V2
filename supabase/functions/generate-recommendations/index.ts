// ============================================================
// generate-recommendations — v13 "ocho-en-1500m"
//
// Esta función solo CARGA datos, llama al planificador y guarda el resultado.
// Las decisiones viven en módulos puros con tests:
//   reglas.ts                   estados, feedback, dueño de cuenta, origen
//   candidatos.ts               puntaje de clientes y prospectos
//   recommendation-composition  prioridad por estados y prospectos para completar
//   planificador.ts             núcleo de ruta y validación de ocho visitas a 1,5 km
// ============================================================

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { mensajePublico } from "../_shared/errores.ts";
import { fijarFechaCorte } from "../_shared/estado-comercial.ts";
import { loadIdentityContext, persistFoundProspects } from "../_shared/prospect-review-service.ts";
import type { IdentityProspect } from "../_shared/prospect-identity.ts";
import { buscarLugaresCercanos, type GooglePlace, hayGoogleMaps } from "../_shared/google-maps.ts";
import { type AnchorPoint, calculateCentroid, findDensestHotspot } from "./geo-hotspot.ts";
import {
  areaKey,
  belongsToArea,
  buildAreaFilter,
  dedupeBarrios,
  esProspectoComercialmenteValido,
  normalizeBarrio,
} from "./portfolio-ranking.ts";
import {
  buildRevisitMap,
  type FeedbackExtraccion,
  isValidCoord,
  limpiarJustificacion,
  type ScoredCandidate,
} from "./candidatos.ts";
import { type PlanVendedor, planificarRutas, VISITAS_POR_DIA } from "./planificador.ts";
import { claveOrs, matrizCaminata } from "../_shared/ors.ts";
import { RADIO_RUTA_KM, errorRuta } from "../_shared/ruta.ts";
import { basePotencial, potencial } from "../_shared/valor.ts";
import { parametrosValidos } from "../_shared/seleccion.ts";
import { type CandidatoOportunidad, factorPorZona } from "../_shared/oportunidad.ts";
import { calcularOportunidades } from "./oportunidad-servicio.ts";
import { armarRecomendaciones, filaParaDb } from "./filas.ts";
import { candidatoRegalos } from "../_shared/prospect-categories.ts";
import { SolicitudInvalida, validarSolicitud } from "./solicitud.ts";
import {
  crearResolvedorVendedores,
  hoyArgentina,
  parseEstados,
  rubroKey,
  tiposGoogleParaRubros,
} from "./reglas.ts";

const VERSION = "v13-ocho-visitas-radio-1500m";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Db = SupabaseClient<any, "public", any>;

// ------------------------------------------------------------
// Lectura sin techos silenciosos
// ------------------------------------------------------------

/** Trae todas las filas paginando (PostgREST corta en 1000 por defecto). */
async function fetchAll<T = any>(build: (from: number, to: number) => any, pageSize = 1000, max = 50_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pageSize) return out;
    if (from + pageSize >= max) throw new Error(`La consulta supera el límite de ${max} filas; acotá los filtros.`);
  }
  return out;
}

/** `.in()` en tandas: una lista de cientos de IDs en la URL puede superar el largo máximo. */
async function fetchIn<T = any>(ids: string[], build: (chunk: string[]) => any, chunkSize = 150): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await build(ids.slice(i, i + chunkSize));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

// ------------------------------------------------------------
// Google Maps → fila de prospecto
// ------------------------------------------------------------

const componente = (place: GooglePlace, ...tipos: string[]): string | null => {
  const c = place.addressComponents?.find((item) => item.types?.some((t) => tipos.includes(t)));
  return c?.longText || c?.shortText || null;
};

function placeAProspecto(place: GooglePlace) {
  const nombre = place.displayName?.text?.trim() || "";
  const lat = Number(place.location?.latitude);
  const lng = Number(place.location?.longitude);
  if (!place.id || !nombre || !isValidCoord(lat, lng)) return null;
  const comuna = componente(place, "administrative_area_level_2");
  const localidad = componente(place, "locality", "administrative_area_level_2");
  const provincia = componente(place, "administrative_area_level_1");
  const tipos = place.types || [];
  return {
    place_id: place.id,
    nombre,
    telefono: place.nationalPhoneNumber || place.internationalPhoneNumber || null,
    resumen_google: place.editorialSummary?.text || null,
    direccion: place.formattedAddress || `${nombre}, ${localidad || "Buenos Aires"}`,
    barrio: componente(place, "neighborhood", "sublocality_level_1", "sublocality"),
    comuna: comuna?.toLowerCase().startsWith("comuna") ? comuna : null,
    ciudad: localidad || provincia || "Ciudad Autónoma de Buenos Aires",
    provincia: provincia || "Ciudad Autónoma de Buenos Aires",
    latitud: lat,
    longitud: lng,
    rating: Number(place.rating || 0),
    total_ratings: Number(place.userRatingCount || 0),
    nivel_precio: place.priceLevel || null,
    tipo_principal: place.primaryType || null,
    tipos,
    sirve_vinos: tipos.includes("wine_bar") || tipos.includes("liquor_store"),
    website: place.websiteUri || null,
    estado_negocio: place.businessStatus || null,
    es_cliente_cupra: false,
  };
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const db: Db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    fijarFechaCorte((await db.rpc("fecha_corte_datos")).data);
    // Solo asignadores y administradores: la función usa la service role y puede
    // disparar búsquedas pagas en Google Maps.
    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const { data: authData } = token ? await db.auth.getUser(token) : { data: { user: null } };
    if (!authData?.user) return json({ error: "Sesión requerida. Volvé a iniciar sesión." }, 401);
    const { data: perfilLlamador } = await db.from("profiles").select("rol").eq("activo", true).eq("user_id", authData.user.id).single();
    if (perfilLlamador?.rol !== "asignador" && perfilLlamador?.rol !== "administrador") {
      return json({ error: "Solo un asignador o administrador puede generar recomendaciones." }, 403);
    }

    const body = validarSolicitud(await req.json());
    const { vendedores, provincia, comuna, barrio, area_id, instrucciones_adicionales } = body;
    const regalos = body.regalos_empresariales;
    const estados = parseEstados(body.estados);
    const rubros = new Set<string>((Array.isArray(body.rubros) ? body.rubros : []).map(rubroKey).filter(Boolean));
    const now = new Date();
    console.log(`🔧 ${VERSION}`, { vendedores, provincia, comuna, barrio, area_id, estados: [...estados], rubros: [...rubros] });

    // ---- 1. Área ----
    let vendedoresFinales: string[] = vendedores || [];
    let barriosFinales: string[] = barrio || [];
    let comunasFinales: string[] = comuna || [];
    if (area_id) {
      const { data: areaVendedores } = await db.from("areas_vendedores").select("vendedor_id").eq("area_id", area_id);
      if (areaVendedores?.length) vendedoresFinales = areaVendedores.map((av: any) => av.vendedor_id);
      const { data: areaPlaces } = await db.from("areas_places").select("place_id, places(barrio_principal, comuna)").eq("area_id", area_id);
      if (areaPlaces?.length) {
        barriosFinales = areaPlaces.map((ap: any) => ap.places?.barrio_principal).filter(Boolean);
        comunasFinales = areaPlaces.map((ap: any) => ap.places?.comuna).filter(Boolean);
      }
    }
    const areaFilter = buildAreaFilter(barriosFinales, comunasFinales);
    const areaActiva = areaFilter.activo;
    const enArea = (p: { barrio?: string | null; comuna?: string | null; ciudad?: string | null }): boolean => {
      if (!areaActiva) return true;
      if (belongsToArea(p, areaFilter)) return true;
      // Google suele dejar el partido de GBA en `ciudad` y el barrio vacío.
      const ciudadKey = areaKey(p.ciudad);
      return Boolean(ciudadKey) && !areaKey(p.barrio) && areaFilter.barrioKeys.has(ciudadKey);
    };
    const provinciaFiltro = provincia && provincia !== "all" ? String(provincia) : null;
    const ilikeLoose = (v: string) => String(v || "").trim().replace(/[%,()]/g, " ").replace(/[^\x20-\x7E]/g, "_");
    const geoOr = (barrioCol: string, comunaCol: string, extraBarrioCols: string[] = []) => [
      ...comunasFinales.map((c) => `${comunaCol}.ilike.${ilikeLoose(c)}`),
      ...[barrioCol, ...extraBarrioCols].flatMap((col) => barriosFinales.map((b) => `${col}.ilike.%${ilikeLoose(b)}%`)),
    ].join(",");

    // ---- 2. Vendedores ----
    if (vendedoresFinales.length === 0) {
      return json({ recomendaciones: [], resumen: { total_recomendaciones: 0, descripcion: "Elegí al menos un vendedor.", distribucion_por_vendedor: {}, zonas_priorizadas: [] } });
    }
    const { data: vendedoresData, error: vErr } = await db.from("profiles")
      .select("user_id, nombre, email, id").eq("activo", true).or("rol.eq.vendedor,perfil_ventas.eq.true")
      .or(`user_id.in.(${vendedoresFinales.join(",")}),id.in.(${vendedoresFinales.join(",")})`);
    if (vErr) throw vErr;
    if (!vendedoresData?.length) {
      return json({ recomendaciones: [], resumen: { total_recomendaciones: 0, descripcion: "No se encontraron vendedores.", distribucion_por_vendedor: {}, zonas_priorizadas: [] } });
    }
    if (vendedoresFinales.some(id => !vendedoresData.some(v => v.user_id === id || v.id === id))) {
      return json({ error: "Hay vendedores inactivos o sin perfil de ventas. Actualizá la selección." }, 400);
    }
    const perfilesActivos = await fetchAll((from, to) => db.from("profiles").select("user_id, nombre").order("user_id").range(from, to));
    const perfiles = new Map<string, any>();
    [...(perfilesActivos || []), ...vendedoresData].forEach((p: any) => p?.user_id && perfiles.set(p.user_id, p));
    const resolvedor = crearResolvedorVendedores([...perfiles.values()]);
    const idsVendedores = new Set(vendedoresData.map((v: any) => v.user_id));
    const nombresSinPerfil = new Map<string, number>();
    /** Dueño de la cuenta: último vendedor → vendedor histórico → cualquiera del historial. */
    const duenio = (c: any): string | null => {
      const candidatos = c.vendedor_actual?.trim() ? [c.vendedor_actual] : [c.vendedor_principal, ...(c.todos_vendedores || [])].filter(Boolean);
      for (const n of candidatos) {
        const id = resolvedor.resolver(n);
        if (id) return id;
      }
      if (candidatos.length > 0) nombresSinPerfil.set(String(candidatos[0]), (nombresSinPerfil.get(String(candidatos[0])) || 0) + 1);
      return null;
    };
    const pasaRubro = (valor: string | null | undefined) => rubros.size === 0 || rubros.has(rubroKey(valor));

    // ---- 3. Cartera de los vendedores elegidos (toda, sin techo de 500) ----
    const clientesConVendedor = await fetchAll((from, to) =>
      db.from("clientes").select("*")
        .order("client_id")
        .range(from, to)
    );
    const carteraTotal = new Map<string, any[]>();
    vendedoresData.forEach((v: any) => carteraTotal.set(v.user_id, []));
    const clientesDeVendedores: any[] = [];
    for (const c of clientesConVendedor) {
      if (c.excluir_recomendaciones) continue;
      const id = duenio(c);
      if (!id || !idsVendedores.has(id)) continue;
      if (!pasaRubro(c.rubro) || regalos && !candidatoRegalos(c)) continue;
      carteraTotal.get(id)!.push(c);
      clientesDeVendedores.push(c);
    }

    // Ubicación de esas cuentas.
    const placesMap = new Map<string, any>();
    const places = await fetchIn(clientesDeVendedores.map((c) => c.client_id), (chunk) =>
      db.from("client_places").select("*").eq("is_primary", true).in("client_id", chunk));
    places.forEach((p: any) => placesMap.set(p.client_id, p));
    // Locales no principales: un cliente puede entrar a la ruta por cualquiera de ellos.
    const localesMap = new Map<string, any[]>();
    const secundarios = await fetchIn(clientesDeVendedores.map((c) => c.client_id), (chunk) =>
      db.from("client_places").select("*").eq("is_primary", false).in("client_id", chunk));
    secundarios.forEach((p: any) => localesMap.set(p.client_id, [...(localesMap.get(p.client_id) || []), p]));
    // Potencial de cada cliente comparado con toda la base (_shared/valor.ts).
    const baseDePotencial = basePotencial(clientesConVendedor);
    for (const c of clientesDeVendedores) c.factor_potencial = potencial(c, baseDePotencial);
    // La provincia es un filtro estricto, también en las ampliaciones.
    if (provinciaFiltro) {
      for (const [vid, lista] of carteraTotal) {
        carteraTotal.set(vid, lista.filter((c) => String(placesMap.get(c.client_id)?.provincia_principal || c.provincia_principal || "").toLowerCase().includes(provinciaFiltro.toLowerCase())));
      }
    }

    // Cartera dentro del área (con coordenadas y barrio).
    const carteraEnZona = new Map<string, any[]>();
    const sinUbicacion = new Map<string, string[]>();
    for (const [vid, lista] of carteraTotal) {
      const enZona: any[] = [];
      for (const c of lista) {
        const place = placesMap.get(c.client_id);
        const ok = place && isValidCoord(place.lat, place.long);
        const provinciaOk = !provinciaFiltro || String(place?.provincia_principal || c.provincia_principal || "").toLowerCase().includes(provinciaFiltro.toLowerCase());
        const zonaOk = enArea({ barrio: place?.barrio_principal || c.barrio_principal, comuna: place?.comuna });
        if (!zonaOk || !provinciaOk) continue;
        if (!ok) {
          sinUbicacion.set(vid, [...(sinUbicacion.get(vid) || []), c.fantasia || c.razon_social || c.client_id]);
          continue;
        }
        enZona.push(c);
      }
      carteraEnZona.set(vid, enZona);
    }

    // ---- 4. Lo ya asignado hoy (hora Argentina) ----
    const hoy = hoyArgentina(now);
    const asignacionesHoy = await fetchAll((from, to) => db.from("asignaciones_vendedores_clientes")
      .select("client_id, prospecto_place_id")
      // Incluye visitas agendadas antes y las ya realizadas hoy. Fecha operativa de Argentina.
      .or(`fecha_programada.eq.${hoy},and(fecha_programada.is.null,created_at.gte.${hoy}T03:00:00Z,created_at.lt.${new Date(Date.parse(`${hoy}T03:00:00Z`) + 86400000).toISOString()}),visited_at.gte.${hoy}T03:00:00Z`)
      .order("id").range(from, to));
    const asignadosHoy = new Set<string>();
    (asignacionesHoy || []).forEach((a: any) => {
      if (a.client_id) asignadosHoy.add(a.client_id);
      if (a.prospecto_place_id) asignadosHoy.add(a.prospecto_place_id);
    });

    // ---- 5. Gate prospecto ↔ cartera (toda la cartera conocida, no solo la de la zona) ----
    const { matcher } = await loadIdentityContext(db);
    const posiblesClientes = new Map<string, { cliente: string; vendedor: string | null; dias: number | null }>();
    const pasaGateCartera = (p: any): boolean => {
      if (!p?.place_id || p.client_id || p.es_cliente_cupra) return false;
      const matches = matcher.matches(p);
      if (matches.length) {
        posiblesClientes.set(p.place_id, { cliente: matches[0].nombre, vendedor: matches[0].vendedor, dias: null });
        return false;
      }
      return true;
    };
    const pasaGate = (p: any): boolean => pasaGateCartera(p) && pasaRubro(p.rubro) && (!regalos || candidatoRegalos(p))
      && (!provinciaFiltro || String(p.provincia || "").toLowerCase().includes(provinciaFiltro.toLowerCase()));

    // ---- 6. Prospectos del área ----
    let prospectosZona: any[] = [];
    {
      const or = geoOr("barrio", "comuna", ["ciudad"]);
      prospectosZona = await fetchAll((from, to) => {
        let q = db.from("prospectos").select("*").eq("es_cliente_cupra", false).is("client_id", null);
        if (provinciaFiltro) q = q.ilike("provincia", `%${provinciaFiltro}%`);
        if (or) q = q.or(or);
        return q.order("place_id").range(from, to);
      });
      prospectosZona = prospectosZona.filter((p) => enArea(p)).filter(pasaGate);
    }
    console.log(`🆕 Prospectos del área: ${prospectosZona.length} (apartados como posible cliente: ${posiblesClientes.size})`);

    // Centro del área: núcleo más denso de clientes y prospectos del área.
    const puntosArea: AnchorPoint[] = [
      ...[...carteraEnZona.values()].flat().map((c) => placesMap.get(c.client_id)).filter(Boolean).map((p: any) => ({ lat: Number(p.lat), lng: Number(p.long) })),
      ...prospectosZona.map((p) => ({ lat: Number(p.latitud), lng: Number(p.longitud) })),
    ].filter((p) => isValidCoord(p.lat, p.lng));
    let centroZona: AnchorPoint | null = findDensestHotspot(puntosArea, RADIO_RUTA_KM) || calculateCentroid(puntosArea);
    if (!centroZona && areaActiva) {
      // Área sin clientes ni prospectos cargados: se ubica con cualquier cliente de la base en esos barrios.
      const or = geoOr("barrio_principal", "comuna");
      const { data: refPlaces } = await db.from("client_places").select("lat, long, barrio_principal, comuna").eq("is_primary", true).or(or).limit(500);
      const pts = (refPlaces || []).filter((p: any) => enArea({ barrio: p.barrio_principal, comuna: p.comuna }))
        .map((p: any) => ({ lat: Number(p.lat), lng: Number(p.long) })).filter((p: AnchorPoint) => isValidCoord(p.lat, p.lng));
      centroZona = findDensestHotspot(pts, RADIO_RUTA_KM) || calculateCentroid(pts);
    }

    // ---- 7. Feedback de los vendedores ----
    // Solo los 2 últimos por comercio: el más reciente decide la exclusión y el otro da contexto.
    const feedbacks = await fetchAll((from, to) => db.rpc("comentarios_recientes", { p_por_comercio: 2 }).range(from, to));
    const extracciones = new Map<string, FeedbackExtraccion>();
    for (const fb of feedbacks) {
      if (fb.revisit_date || fb.resumen) {
        extracciones.set(fb.id, { feedback_id: fb.id, revisit_date: fb.revisit_date, resumen: fb.resumen, confianza: fb.confianza } as FeedbackExtraccion);
      }
    }
    // Recordatorios pendientes que dejaron los vendedores (fecha explícita para volver).
    const { data: recordatorios, error: recErr } = await db.from("recordatorios")
      .select("client_id, prospecto_place_id, fecha_recordatorio, created_at, nota, titulo").eq("completado", false).limit(5000);
    if (recErr) throw recErr;
    const recordatoriosClientes = new Map<string, any[]>();
    const recordatoriosProspectos = new Map<string, any[]>();
    for (const r of recordatorios || []) {
      if (r.client_id) recordatoriosClientes.set(r.client_id, [...(recordatoriosClientes.get(r.client_id) || []), r]);
      else if (r.prospecto_place_id) recordatoriosProspectos.set(r.prospecto_place_id, [...(recordatoriosProspectos.get(r.prospecto_place_id) || []), r]);
    }
    const feedbacksClientes = new Map<string, any[]>();
    const feedbacksProspectos = new Map<string, any[]>();
    for (const fb of feedbacks) {
      if (fb.client_id) feedbacksClientes.set(fb.client_id, [...(feedbacksClientes.get(fb.client_id) || []), fb]);
      if (fb.prospecto_place_id) feedbacksProspectos.set(fb.prospecto_place_id, [...(feedbacksProspectos.get(fb.prospecto_place_id) || []), fb]);
    }

    // Precio promedio por caja del canal (base del margen realizado).
    const precios = clientesDeVendedores.map((c) => Number(c.precio_promedio_caja)).filter((v) => Number.isFinite(v) && v > 0);
    const precioCajaCanal = precios.length ? precios.reduce((a, b) => a + b, 0) / precios.length : 0;

    // ---- 8. Planificar ----
    const tiposGoogle = tiposGoogleParaRubros(rubros, regalos);
    const consultasPorVendedor = new Map<string, number>();
    const plazoGoogle = Date.now() + 70_000;
    const consumirConsulta = (vendedorId: string) => {
      const usadas = consultasPorVendedor.get(vendedorId) || 0;
      if (usadas >= 24 || Date.now() >= plazoGoogle) throw new Error("Se agotó el tiempo o presupuesto de búsqueda; reintentá este vendedor.");
      consultasPorVendedor.set(vendedorId, usadas + 1);
    };
    // ---- 8b. Oportunidad: lo único que puntúa la IA, comprobado por código ----
    // Con la fecha real de hoy (no la de los datos): las fechas especiales son del calendario.
    const ultimoComentario = (lista?: any[]) => String(lista?.[0]?.feedback || "").trim() || null;
    const candidatosOportunidad = new Map<string, CandidatoOportunidad>();
    for (const c of [...carteraEnZona.values()].flat()) candidatosOportunidad.set(`C:${c.client_id}`, {
      id: `C:${c.client_id}`, nombre: c.fantasia || c.razon_social || c.client_id, rubro: c.rubro ?? null, canal: c.canal ?? null,
      barrio: placesMap.get(c.client_id)?.barrio_principal || c.barrio_principal || null, es_prospecto: false,
      comentario: ultimoComentario(feedbacksClientes.get(c.client_id)),
    });
    for (const p of prospectosZona) candidatosOportunidad.set(`P:${p.place_id}`, {
      id: `P:${p.place_id}`, nombre: p.nombre, rubro: p.rubro ?? null, canal: null, barrio: p.barrio ?? null, es_prospecto: true,
      comentario: ultimoComentario(feedbacksProspectos.get(p.place_id)),
    });
    const { oportunidades, fallo: falloOportunidad } = await calcularOportunidades(db, [...candidatosOportunidad.values()], hoy);
    const factorOportunidad = factorPorZona(oportunidades);
    for (const c of [...carteraEnZona.values()].flat()) c.factor_oportunidad = factorOportunidad.get(`C:${c.client_id}`) ?? null;
    for (const p of prospectosZona) p.factor_oportunidad = factorOportunidad.get(`P:${p.place_id}`) ?? null;

    const plan = await planificarRutas({
      vendedores: vendedoresData.map((v: any) => ({ user_id: v.user_id, nombre: v.nombre })),
      carteraEnZona,
      carteraTotal,
      placesMap,
      localesMap,
      parametros: parametrosValidos((await db.from("motor_config").select("parametros").maybeSingle()).data?.parametros),
      prospectosZona,
      feedbacksClientes,
      feedbacksProspectos,
      revisitClientes: buildRevisitMap(feedbacksClientes, extracciones, recordatoriosClientes),
      revisitProspectos: buildRevisitMap(feedbacksProspectos, extracciones, recordatoriosProspectos),
      posiblesClientes,
      estados,
      precioCajaCanal,
      centroZona,
      enArea,
      areaActiva,
      asignadosHoy,
      now,
    }, {
      distanciasPie: claveOrs() ? (puntos) => matrizCaminata(puntos) : undefined,
      prospectosCerca: async (lat, lng, radioKm) => {
        const dLat = radioKm / 111.32;
        const dLng = radioKm / (111.32 * Math.cos((lat * Math.PI) / 180));
        return await fetchAll((from, to) =>
          db.from("prospectos").select("*")
            .eq("es_cliente_cupra", false).is("client_id", null)
            .gte("latitud", lat - dLat).lte("latitud", lat + dLat)
            .gte("longitud", lng - dLng).lte("longitud", lng + dLng)
            .order("place_id").range(from, to), 1000, 5000);
      },
      descubrirEnGoogle: hayGoogleMaps()
        ? async (lat, lng, radioKm, objetivo, excluir, vendedorId = "ruta") => {
          const guardados = new Map<string, IdentityProspect>();
          const lugares = await buscarLugaresCercanos({ lat, lng, radioKm, tipos: tiposGoogle, agruparTipos: true, soloCentro: true, objetivo: objetivo * 2, excluir, consumirConsulta: () => consumirConsulta(vendedorId),
            onResults: async places => {
              const rows = await persistFoundProspects<IdentityProspect>(db, places.map(placeAProspecto).filter((p): p is NonNullable<ReturnType<typeof placeAProspecto>> => Boolean(p)));
              matcher.remember(rows);
              for (const p of rows) { guardados.set(p.place_id,p); if (typeof p.google_place_id === "string") guardados.set(p.google_place_id,p); }
            },
          });
          return lugares.map(p => guardados.get(p.id!)).filter((p): p is IdentityProspect => Boolean(p)).filter(esProspectoComercialmenteValido).filter(pasaGateCartera);
        }
        : undefined,
      pasaGate,
      log: (m) => console.log(m),
    });

    if (!hayGoogleMaps()) {
      console.warn("GOOGLE_MAPS_API_KEY no configurada: no se buscan prospectos nuevos.");
    }

    // Hasta 8 por vendedor (menos, con aviso en la cobertura). Error solo si un vendedor
    // queda sin visitas o algo rompe el radio.
    const incompletas = plan.porVendedor.filter(p => errorRuta(p.elegidos.map(c => ({
      id: c.client_id, lat: Number(c.lat), lng: Number(c.long),
    })), p.hotspot));
    if (incompletas.length) {
      const detalle = incompletas.map(p => `${p.vendedor.nombre}: ${p.elegidos.length}/8`).join("; ");
      console.warn("RUTAS_INCOMPLETAS", JSON.stringify(incompletas.map(p => p.cobertura)));
      return json({ code: "RUTAS_INCOMPLETAS", recomendaciones: [],
        error: `No se pudo completar la búsqueda dentro de 1,5 km (${detalle}). Revisá los rubros o las direcciones de la zona y reintentá.`,
        cobertura: plan.porVendedor.map(p => p.cobertura),
        reintentable: incompletas.some(p => p.cobertura.error_google || p.cobertura.error_base),
      }, 422);
    }

    // ---- 9. Textos (IA opcional) ----
    // Los textos los escribe el código. La IA solo aportó la Oportunidad, ya comprobada.
    const oportunidadDe = (c: ScoredCandidate) => oportunidades.get(`${c.es_prospecto ? "P" : "C"}:${c.client_id}`);

    // ---- 10. Armar filas y guardar ----
    const request_id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const clientePorId = new Map<string, any>(clientesDeVendedores.map((c) => [c.client_id, c]));
    const prospectoPorId = new Map<string, any>();
    [...prospectosZona, ...plan.descubiertosGoogle].forEach((p) => prospectoPorId.set(p.place_id, p));
    const faltantesProspectos = plan.porVendedor.flatMap((p) => p.elegidos)
      .filter((c) => c.es_prospecto && !prospectoPorId.has(c.client_id)).map((c) => c.client_id);
    (await fetchIn(faltantesProspectos, (chunk) => db.from("prospectos").select("*").in("place_id", chunk)))
      .forEach((p: any) => prospectoPorId.set(p.place_id, p));

    const recomendaciones = armarRecomendaciones(plan.porVendedor, {
      request_id, nowIso, regalos, clientePorId, prospectoPorId, placesMap, oportunidadDe,
    });

    // ---- 11. Avisos para el asignador ----
    const zonaTexto = dedupeBarrios([...barriosFinales, ...comunasFinales]).join(", ") || "la zona seleccionada";
    const estadosTexto: Record<string, string> = { ACTIVO: "activos", INACTIVO: "inactivos", PERDIDO: "perdidos", POTENCIAL: "potenciales" };
    const avisos: string[] = [];
    if (falloOportunidad) avisos.push(falloOportunidad);
    if (instrucciones_adicionales) avisos.push("Las indicaciones escritas todavía no cambian la ruta: el motor decide por valor y la IA solo puntúa oportunidades.");
    for (const pv of plan.porVendedor) for (const aviso of pv.cobertura.avisos) avisos.push(`${pv.vendedor.nombre}: ${aviso}`);
    const errorGoogle = plan.porVendedor.find((p) => p.cobertura.error_google)?.cobertura.error_google;
    if (errorGoogle) avisos.push(`No se pudo buscar lugares nuevos en Google Maps (${errorGoogle}). Revisá la configuración o reintentá más tarde.`);
    else if (!hayGoogleMaps()) avisos.push("Google Maps no está configurado (falta GOOGLE_MAPS_API_KEY): solo se usan prospectos ya cargados.");
    for (const pv of plan.porVendedor) {
      const cob = pv.cobertura;
      const partes: string[] = [];
      if (cob.fuera_de_seleccion > 0) {
        partes.push(`${pv.vendedor.nombre}: no alcanzaron los ${cob.estados_elegidos.map((e) => estadosTexto[e] || e).join(" y ")}; se completó con ${cob.fuera_de_seleccion} visita${cob.fuera_de_seleccion === 1 ? "" : "s"} de otro tipo.`);
      }
      if (cob.fuera_de_zona > 0) {
        partes.push(`${pv.vendedor.nombre}: ${cob.fuera_de_zona} visita${cob.fuera_de_zona === 1 ? " queda" : "s quedan"} fuera de ${zonaTexto} pero dentro del radio de 1,5 km; se sumaron para llegar a 8.`);
      }
      if (cob.prospectos_de_maps > 0) {
        partes.push(`${pv.vendedor.nombre}: ${cob.prospectos_de_maps} lugar${cob.prospectos_de_maps === 1 ? "" : "es"} nuevo${cob.prospectos_de_maps === 1 ? "" : "s"} encontrado${cob.prospectos_de_maps === 1 ? "" : "s"} en Google Maps.`);
      }
      if (cob.cuentas_prioritarias_fuera_de_zona.length > 0 && areaActiva) {
        const lista = cob.cuentas_prioritarias_fuera_de_zona
          .map((c) => `${c.nombre}${c.dias_sin_comprar != null ? ` (${c.dias_sin_comprar} días sin comprar)` : ""}${c.barrio ? ` en ${c.barrio}` : ""}`).join(", ");
        partes.push(`${pv.vendedor.nombre} tiene cuentas importantes fuera de esta ruta: ${lista}. Conviene armarles otra ruta.`);
      }
      const sinUb = sinUbicacion.get(pv.vendedor.user_id) || [];
      if (sinUb.length > 0) {
        partes.push(`${sinUb.length} cuenta${sinUb.length === 1 ? "" : "s"} de ${pv.vendedor.nombre} sin dirección ubicable: ${sinUb.slice(0, 5).join(", ")}. Corregí la dirección para que entren.`);
      }
      if (partes.length) avisos.push(partes.join(" "));
    }
    if (posiblesClientes.size > 0) {
      const muestras = [...posiblesClientes.values()].slice(0, 3).map((v) => `${v.cliente}${v.vendedor ? ` (atiende ${v.vendedor})` : ""}`).join(", ");
      avisos.push(`Se apartaron ${posiblesClientes.size} lugares que podrían ser clientes actuales: ${muestras}. Revisalos en Prospectos → Revisar coincidencias antes de visitarlos como nuevos.`);
    }
    if (nombresSinPerfil.size > 0) {
      const lista = [...nombresSinPerfil.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, k]) => `${n} (${k})`).join(", ");
      console.warn(`Vendedores del Excel sin perfil: ${lista}`);
    }

    const paraDb = recomendaciones.map(filaParaDb);
    const { error: insertError } = await db.from("recomendaciones_ia").insert(paraDb);
    if (insertError) throw insertError;

    const distribucion: Record<string, number> = {};
    const zonas = new Set<string>();
    recomendaciones.forEach((r) => {
      distribucion[r.vendedor_recomendado_id] = (distribucion[r.vendedor_recomendado_id] || 0) + 1;
      if (r.barrio_principal) zonas.add(normalizeBarrio(r.barrio_principal));
    });
    const totalEsperado = plan.porVendedor.length * VISITAS_POR_DIA;
    const descripcionBase = `Se armaron ${recomendaciones.length} de ${totalEsperado} visitas`
      + (estados.size > 0 ? ` priorizando ${[...estados].map((e) => estadosTexto[e]).join(" y ")}` : ` dentro de un radio máximo de 1,5 km, completando con prospectos`)
      + (rubros.size > 0 ? ` del rubro ${[...rubros].map((r) => r.toLowerCase()).join(", ")}` : "")
      + ".";

    console.log(`✅ ${recomendaciones.length} recomendaciones guardadas (${VERSION})`);
    return json({
      recomendaciones,
      resumen: {
        total_recomendaciones: recomendaciones.length,
        descripcion: limpiarJustificacion(null, descripcionBase, 2000),
        distribucion_por_vendedor: distribucion,
        zonas_priorizadas: [...zonas].slice(0, 5),
        request_id,
        advertencia: avisos.length ? avisos.join(" ") : null,
        avisos_cobertura: avisos,
        cobertura: plan.porVendedor.map((p) => p.cobertura),
        version: VERSION,
      },
    });
  } catch (error) {
    console.error("❌ Error:", error);
    return json({ error: mensajePublico(error) },
      error instanceof SolicitudInvalida || error instanceof SyntaxError ? 400 : 500);
  }
});
