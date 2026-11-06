import { candidatoRegalos } from "../_shared/prospect-categories.ts";
import { seleccionarPorValor } from "../_shared/seleccion.ts";
import { factoresProspecto } from "../_shared/prospecto-valor.ts";
import { authorize, corsHeaders, json, RequestError, failure, googleGeocode } from "../_shared/location-service.ts";
import { hayGoogleMaps } from "../_shared/google-maps.ts";
import { allClients } from "../_shared/import-batch.ts";
import { carteraDelVendedor, centroClientes, coordenadaMapaValida, puntosDeCartera, validarSeleccionMapa, type UbicacionMapa } from "../_shared/map-selection.ts";
import { centroDeZonaGoogle, prospectoEnZona, zonaDelCatalogo, type ZonaProspeccion, type ZonaProspeccionResuelta } from "../_shared/map-zones.ts";
import { distanciaKm, RADIO_RUTA_KM, VISITAS_POR_DIA } from "../_shared/ruta.ts";
import { hoyArgentina, excluidoPorFeedback, pausaPorVisita, type VisitaLike } from "../_shared/reglas.ts";
import { loadIdentityContext, persistFoundProspects } from "../_shared/prospect-review-service.ts";
import type { IdentityProspect } from "../_shared/prospect-identity.ts";
import { buscarComplementoMapa, cubrirZonaMapa, descubrirProspectosMapa, mismoProspecto, ordenarProspectos, prospectoDisponible, puntoProspecto, type ProspectoMapa } from "./search.ts";
import { rubroKey } from "../_shared/reglas.ts";

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < 100_000; offset += 500) {
    const { data, error } = await build(offset, offset + 499);
    if (error) throw new Error("No se pudieron leer los datos para completar la ruta. Reintentá.");
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
  throw new Error("La consulta supera el límite de registros.");
}
function ids(value: unknown, max: number, required = false): string[] {
  if (!Array.isArray(value) || value.length > max || required && !value.length
    || value.some(v => typeof v !== "string" || !v.trim() || v.length > 250) || new Set(value).size !== value.length) {
    throw new RequestError("La selección no es válida. Volvé a elegir los clientes.", 400, "INVALID_SELECTION");
  }
  return value;
}

/** El centro proviene de una zona del catálogo verificada por Google, no del navegador. */
async function resolverZona(db: Awaited<ReturnType<typeof authorize>>["db"], zona: ZonaProspeccion): Promise<ZonaProspeccionResuelta> {
  const leer = () => db.from("mapa_zonas_prospectos").select("lat,lng").eq("zona_key", zona.key).maybeSingle();
  const { data: guardada, error } = await leer();
  if (error) throw new Error("No se pudo consultar el barrio. Reintentá.");
  if (guardada && coordenadaMapaValida(guardada)) return { ...zona, ...guardada };
  const results = await googleGeocode(new URLSearchParams({ address: `${zona.barrio}, ${zona.comuna}, ${zona.provincia}, Argentina`, components: "country:AR" }));
  const validos = results.flatMap(r => { const centro = centroDeZonaGoogle(r, zona); return centro ? [{ ...centro, google_place_id: r.place_id || null }] : []; });
  if (validos.length !== 1) throw new RequestError("Google no pudo ubicar ese barrio de forma única. Elegí otra zona o reintentá.", 422, "ZONE_NOT_FOUND");
  const { error: saveError } = await db.from("mapa_zonas_prospectos").upsert({ zona_key: zona.key,
    provincia: zona.provincia, comuna: zona.comuna, barrio: zona.barrio, ...validos[0] }, { onConflict: "zona_key", ignoreDuplicates: true });
  if (saveError) throw new Error("No se pudo guardar el centro del barrio. Reintentá.");
  const { data: vigente, error: readError } = await leer();
  if (readError || !vigente || !coordenadaMapaValida(vigente)) throw new Error("No se pudo verificar el centro del barrio.");
  return { ...zona, ...vigente };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const { db } = await authorize(req, true);
    const body = await req.json().catch(() => { throw new RequestError("Solicitud inválida", 400, "INVALID_REQUEST"); });
    if (!body || typeof body !== "object") throw new RequestError("Solicitud inválida", 400, "INVALID_REQUEST");
    const clientesIds = ids(body.client_ids, 7);
    const conservarIds = ids(body.prospect_ids ?? [], 7);
    const omitirIds = new Set(ids(body.omitir_ids ?? [], 100));
    const rubros = ids(body.rubros ?? [], 20);
    if (body.regalos_empresariales != null && typeof body.regalos_empresariales !== "boolean") throw new RequestError("Enfoque comercial inválido", 400, "INVALID_REQUEST");
    const regalos = body.regalos_empresariales === true;
    if (typeof body.vendedor_id !== "string" || clientesIds.length + conservarIds.length >= VISITAS_POR_DIA) {
      throw new RequestError("La ruta debe tener menos de ocho visitas antes de completar.", 400, "INVALID_SELECTION");
    }
    const zonaCatalogo = clientesIds.length ? null : zonaDelCatalogo(body.zona_key);
    if (!clientesIds.length && !zonaCatalogo) throw new RequestError("Elegí un barrio o localidad para buscar prospectos.", 400, "ZONE_REQUIRED");
    if (clientesIds.length && body.zona_key) throw new RequestError("Una ruta con clientes usa el centro de esos clientes.", 400, "INVALID_CENTER");
    const [perfiles, clientes, places] = await Promise.all([
      all((from, to) => db.from("profiles").select("user_id,nombre,activo,rol,perfil_ventas").or("rol.eq.vendedor,perfil_ventas.eq.true").order("user_id").range(from, to)),
      allClients(db),
      all<UbicacionMapa>((from, to) => db.from("client_places")
        .select("id,client_id,lat,long,is_primary,direccion_verificada,direccion_principal,barrio_principal,comuna,google_maps_link")
        .order("id").range(from, to)),
    ]);
    if (!perfiles.some(p => p.user_id === body.vendedor_id && p.activo)) throw new RequestError("El vendedor no está activo.", 422, "INVALID_VENDOR");
    const cartera = carteraDelVendedor(clientes, perfiles, body.vendedor_id);
    const elegidos = cartera.filter(c => clientesIds.includes(c.client_id));
    const { puntos: clientesPuntos } = puntosDeCartera(elegidos, places);
    if (clientesPuntos.length !== clientesIds.length) throw new RequestError("La cartera o las ubicaciones cambiaron. Volvé a cargar el vendedor.", 409, "STALE_SELECTION");
    const zona = zonaCatalogo ? await resolverZona(db, zonaCatalogo) : null;
    const selectionError = validarSeleccionMapa(clientesPuntos, false, zona);
    if (selectionError) throw new RequestError(selectionError, 422, "INVALID_ROUTE");
    // Con clientes se usa su centro; sin clientes se usa el barrio verificado.
    const centro = (clientesPuntos.length ? centroClientes(clientesPuntos) : zona)!;
    const dLat = RADIO_RUTA_KM / 110.5;
    const dLng = RADIO_RUTA_KM / (110.5 * Math.cos(centro.lat * Math.PI / 180));
    const hoy = hoyArgentina();
    const inicio = `${hoy}T03:00:00Z`, fin = new Date(Date.parse(inicio) + 86400000).toISOString();
    const [base, asignaciones, feedbacks, descartados] = await Promise.all([
      all<ProspectoMapa>((from, to) => db.from("prospectos").select("*")
        .gte("latitud", centro.lat - dLat).lte("latitud", centro.lat + dLat)
        .gte("longitud", centro.lng - dLng).lte("longitud", centro.lng + dLng).order("place_id").range(from, to)),
      all((from, to) => db.from("asignaciones_vendedores_clientes").select("prospecto_place_id")
        .not("prospecto_place_id", "is", null)
        .or(`fecha_programada.eq.${hoy},and(fecha_programada.is.null,created_at.gte.${inicio},created_at.lt.${fin}),and(visited_at.gte.${inicio},visited_at.lt.${fin})`)
        .order("id").range(from, to)),
      all((from, to) => db.rpc("comentarios_recientes", { p_por_comercio: 1 }).not("prospecto_place_id", "is", null).range(from, to)),
      all((from, to) => db.from("prospect_discovery_queue").select("place_id").eq("estado", "DESCARTADO").order("id").range(from, to)),
    ]);
    const bloqueados = new Set([...asignaciones.map(a => a.prospecto_place_id), ...descartados.map(d => d.place_id)]);
    const comentarios = new Map<string, VisitaLike[]>();
    for (const f of feedbacks) if (f.prospecto_place_id) comentarios.set(f.prospecto_place_id, [...(comentarios.get(f.prospecto_place_id) || []), f]);
    for (const [id, list] of comentarios) if (excluidoPorFeedback(list) || pausaPorVisita(list, true).excluido) bloqueados.add(id);
    const { matcher } = await loadIdentityContext(db);
    const revisiones = new Set<string>();
    const identidadDisponible = (p: ProspectoMapa) => {
      if (p.client_id || p.es_cliente_cupra) return false;
      const matches = matcher.matches(p as IdentityProspect);
      if (matches.length) { revisiones.add(p.place_id); return false; }
      return true;
    };
    const disponible = (p: ProspectoMapa) => prospectoDisponible(p) && (!regalos || candidatoRegalos(p)) && !bloqueados.has(p.place_id)
      && !bloqueados.has(p.google_place_id || "")
      && (!zona || prospectoEnZona(p, zona))
      && identidadDisponible(p);
    const conservar = base.filter(p => conservarIds.includes(p.place_id));
    if (conservar.length !== conservarIds.length || conservar.some(p => !disponible(p))) {
      throw new RequestError("Uno de los prospectos ya no está disponible. Quitalo de la ruta y reintentá.", 409, "STALE_PROSPECTS");
    }
    const routeError = validarSeleccionMapa([...clientesPuntos, ...conservar.map(p => puntoProspecto(p, clientesPuntos, centro))], false, zona);
    if (routeError) throw new RequestError(routeError, 422, "INVALID_ROUTE");
    const deadline = Date.now() + 45_000;
    let consultas = 0;
    const consumir = () => { if (++consultas > 60 || Date.now() >= deadline) throw new Error("Se agotó el tiempo de búsqueda"); };
    const objetivo = VISITAS_POR_DIA - clientesPuntos.length - conservar.length;
    const guardarEncontrados = async (rows: ProspectoMapa[]) => {
      const guardados = await persistFoundProspects(db, rows as IdentityProspect[]);
      matcher.remember(guardados); return guardados as ProspectoMapa[];
    };
    const result = await buscarComplementoMapa({
      clientes: clientesPuntos, centroZona: zona || undefined, objetivo, base, rubros, regalos,
      pasaGate: p => disponible(p) && !omitirIds.has(p.place_id) && !omitirIds.has(p.google_place_id || "")
        && !conservar.some(prev => mismoProspecto(prev, p)),
      descubrir: hayGoogleMaps() ? async (center, radius, types) => guardarEncontrados(await descubrirProspectosMapa(center, radius, types, deadline, consumir)) : undefined,
      cubrirZona: hayGoogleMaps() ? async (center, types) => guardarEncontrados(await cubrirZonaMapa(center, types, deadline, consumir)) : undefined,
    });
    // Releer mantiene las ediciones/conversiones concurrentes y los rubros calculados por la base.
    const candidateIds = result.candidatos.map(p => p.place_id);
    let final: ProspectoMapa[] = [];
    if (candidateIds.length) {
      const { data, error } = await db.from("prospectos").select("*").in("place_id", candidateIds);
      if (error) throw new Error("No se pudo verificar la disponibilidad final de los prospectos.");
      const byId = new Map<string, ProspectoMapa>((data || []).map(p => [p.place_id, p]));
      final = ordenarProspectos(candidateIds.map(id => byId.get(id)).filter((p): p is ProspectoMapa => Boolean(p) && disponible(p!)
        && (!rubros.length || rubros.some(r => rubroKey(r) === rubroKey(p!.rubro)))
        && distanciaKm(centro, { lat: p!.latitud!, lng: p!.longitud! }) <= RADIO_RUTA_KM), centro);
    }
    const fijos=[...clientesPuntos.map(p=>({id:p.key,lat:p.lat,lng:p.lng})),...conservar.map(p=>({id:`P:${p.place_id}`,lat:p.latitud!,lng:p.longitud!}))];
    const orden=seleccionarPorValor(centro,final.map(p=>({id:`P:${p.place_id}`,factores:factoresProspecto(p),locales:[{lat:p.latitud!,lng:p.longitud!}]})),
      distanciaKm,distanciaKm,{limite:VISITAS_POR_DIA},fijos);
    const seleccionados=orden.elegidos.flatMap(p=>final.filter(f=>`P:${f.place_id}`===p.id));
    return json({ success: true, centro, zona, radio_busqueda_m: result.radio_m,
      clientes: clientesPuntos, prospectos: final.map(p => puntoProspecto(p, clientesPuntos, centro)),
      elegidos: seleccionados.map(p => p.place_id), faltantes: objetivo - seleccionados.length,
      avisos: result.avisos, revision_ids: [...revisiones] });
  } catch (error) { return failure(error); }
}

if (import.meta.main) Deno.serve(handler);
