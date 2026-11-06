import { CATEGORIAS_PROSPECTOS, candidatoRegalos } from "../_shared/prospect-categories.ts";
import { MAX_PROMOTION_BATCH } from "../_shared/prospect-promotion.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { mensajePublico } from '../_shared/errores.ts';
import { googleMapsFetch, hayGoogleMaps } from "../_shared/google-maps.ts";
import { persistFoundProspects } from "../_shared/prospect-review-service.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CABA_VIEWPORT = {
  low: { latitude: -34.705, longitude: -58.531 },
  high: { latitude: -34.526, longitude: -58.335 },
};

const ALLOWED_TYPES = new Set<string>(CATEGORIAS_PROSPECTOS.map(c => c.tipo));
const ALLOWED_QUEUE_STATUSES = new Set(['NUEVO', 'EN_REVISION', 'DESCARTADO']);
const GOOGLE_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.attributions',
].join(',');

const PLACE_DETAIL_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'addressComponents',
  'location',
  'primaryType',
  'types',
  'businessStatus',
  'googleMapsUri',
  'rating',
  'userRatingCount',
  'priceLevel',
  'nationalPhoneNumber',
  'websiteUri',
].join(',');


interface SearchRequest {
  action: 'search';
  query: string;
  zone?: string;
  includedType?: string | null;
  excludeExisting?: boolean;
  regalos_empresariales?: boolean;
}


interface QueueRequest {
  action: 'queue';
  placeIds: string[];
  query: string;
  zone?: string;
  names?: Record<string, string>;
}

interface ListRequest {
  action: 'list';
}

interface StatusRequest {
  action: 'update_status';
  placeId: string;
  status: string;
}

interface PromoteRequest {
  action: 'promote';
  placeIds: string[];
}

type DiscoveryRequest = SearchRequest | QueueRequest | ListRequest | StatusRequest | PromoteRequest;

interface GoogleAttribution {
  provider?: string;
  providerUri?: string;
}

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  businessStatus?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  attributions?: GoogleAttribution[];
}

interface GoogleSearchResponse {
  places?: GooglePlace[];
  error?: unknown;
}

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
);

const normalizeName = (value: unknown): string => String(value || '')
  .toUpperCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9]/g, '');

const isValidPlaceId = (value: unknown): value is string => (
  typeof value === 'string' && value.length >= 5 && value.length <= 256 && /^[A-Za-z0-9_-]+$/.test(value)
);

const premiumScore = (place: GooglePlace): number => {
  let score = 0;
  const rating = Number(place.rating || 0);
  const ratings = Number(place.userRatingCount || 0);
  const types = new Set<string>(place.types || []);

  if (types.has('liquor_store') || types.has('wine_bar')) score += 4;
  if (rating >= 4.5) score += 3;
  else if (rating >= 4.2) score += 2;
  else if (rating >= 4) score += 1;
  if (ratings >= 100) score += 2;
  else if (ratings >= 25) score += 1;
  if (place.priceLevel === 'PRICE_LEVEL_EXPENSIVE' || place.priceLevel === 'PRICE_LEVEL_VERY_EXPENSIVE') score += 2;
  return score;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Método no permitido' }, 405);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const accessToken = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return jsonResponse({ success: false, error: 'Sesión requerida' }, 401);

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) return jsonResponse({ success: false, error: 'Sesión inválida o vencida' }, 401);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('rol, activo')
      .eq('user_id', authData.user.id)
      .single();
    // Roles en cascada: administrador ⊇ asignador
    if (profileError || (profile?.rol !== 'asignador' && profile?.rol !== 'administrador') || profile.activo !== true) {
      return jsonResponse({ success: false, error: 'Solo un asignador o administrador puede buscar prospectos' }, 403);
    }

    const body = await req.json() as DiscoveryRequest;

    if (body.action === 'list') {
      const { data, error } = await supabase
        .from('prospect_discovery_queue')
        .select('id, place_id, fuente, estado, consulta, zona, notas, discovered_at, updated_at')
        .in('estado', ['NUEVO', 'EN_REVISION'])
        .order('discovered_at', { ascending: false })
        .limit(200);
      if (error) { console.error('cola (leer):', error.message); throw new Error('No se pudo leer la cola de búsqueda.'); }
      return jsonResponse({ success: true, queue: data || [] });
    }

    if (body.action === 'update_status') {
      if (!isValidPlaceId(body.placeId) || !ALLOWED_QUEUE_STATUSES.has(body.status)) {
        return jsonResponse({ success: false, error: 'Estado o place_id inválido' }, 400);
      }
      const { error } = await supabase
        .from('prospect_discovery_queue')
        .update({ estado: body.status })
        .eq('place_id', body.placeId);
      if (error) { console.error('cola (actualizar):', error.message); throw new Error('No se pudo actualizar la cola de búsqueda.'); }
      return jsonResponse({ success: true });
    }

    if (body.action === 'queue') {
      const query = String(body.query || '').trim().slice(0, 120);
      const zone = String(body.zone || '').trim().slice(0, 80) || null;
      const placeIds = Array.from(new Set((body.placeIds || []).filter(isValidPlaceId))).slice(0, 60);
      const rawNames = (body as QueueRequest).names || {};
      const noteFor = (placeId: string): string | null => {
        const value = rawNames?.[placeId];
        return typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null;
      };
      if (!query || placeIds.length === 0) {
        return jsonResponse({ success: false, error: 'Consulta y lugares requeridos' }, 400);
      }

      const { data: existing, error: existingError } = await supabase
        .from('prospect_discovery_queue')
        .select('place_id, estado')
        .in('place_id', placeIds);
      if (existingError) { console.error('cola (validar):', existingError.message); throw new Error('No se pudo validar la cola de búsqueda.'); }

      const existingMap = new Map((existing || []).map((row) => [row.place_id, row.estado]));
      const newIds = placeIds.filter((placeId) => !existingMap.has(placeId));
      const discardedIds = placeIds.filter((placeId) => existingMap.get(placeId) === 'DESCARTADO');

      if (newIds.length > 0) {
        const { error: insertError } = await supabase.from('prospect_discovery_queue').insert(
          newIds.map((placeId) => ({
            place_id: placeId,
            consulta: query,
            zona: zone,
            notas: noteFor(placeId),
            creado_por: authData.user.id,
          })),
        );
        if (insertError) { console.error('cola (guardar):', insertError.message); throw new Error('No se pudo guardar la cola de búsqueda.'); }
      }

      for (const placeId of discardedIds) {
        const { error: reactivateError } = await supabase
          .from('prospect_discovery_queue')
          .update({ estado: 'NUEVO', consulta: query, zona: zone, notas: noteFor(placeId), creado_por: authData.user.id })
          .eq('place_id', placeId);
        if (reactivateError) { console.error('cola (reactivar):', reactivateError.message); throw new Error('No se pudo reactivar la cola de búsqueda.'); }
      }


      return jsonResponse({
        success: true,
        added: newIds.length + discardedIds.length,
        already_queued: placeIds.length - newIds.length - discardedIds.length,
      });
    }

    if (body.action === 'promote') {
      if (!Array.isArray(body.placeIds) || body.placeIds.length > MAX_PROMOTION_BATCH || body.placeIds.some(id => !isValidPlaceId(id))) {
        return jsonResponse({ success: false, error: `Seleccioná hasta ${MAX_PROMOTION_BATCH} lugares por lote` }, 400);
      }
      const placeIds = [...new Set(body.placeIds)];
      if (placeIds.length === 0) return jsonResponse({ success: false, error: 'Lugares requeridos' }, 400);

      if (!hayGoogleMaps()) {
        return jsonResponse({ success: false, error: 'Google Places no está configurado' }, 503);
      }

      const created: string[] = [];
      const promotedPlaceIds: string[] = [];
      const skipped: Array<{ place_id: string; motivo: string }> = [];

      for (const placeId of placeIds) {
        const detailResponse = await googleMapsFetch(
          `/places/v1/places/${encodeURIComponent(placeId)}?languageCode=es&regionCode=AR`,
          {
            headers: {
              'X-Goog-FieldMask': PLACE_DETAIL_FIELD_MASK,
            },
          },
        );
        const detailText = await detailResponse.text();
        if (!detailResponse.ok) {
          console.error('Place details error:', detailResponse.status, detailText.slice(0, 300));
          skipped.push({ place_id: placeId, motivo: 'No se pudo leer el detalle en Google' });
          continue;
        }
        let place: GooglePlace & {
          addressComponents?: Array<{ longText?: string; types?: string[] }>;
          nationalPhoneNumber?: string;
          websiteUri?: string;
        };
        try {
          place = JSON.parse(detailText);
        } catch {
          skipped.push({ place_id: placeId, motivo: 'Respuesta inválida de Google' });
          continue;
        }

        const component = (type: string) => place.addressComponents
          ?.find((item) => item.types?.includes(type))?.longText || null;

        const nombre = place.displayName?.text?.trim();
        const direccion = place.formattedAddress?.trim();
        if (!nombre || !direccion) {
          skipped.push({ place_id: placeId, motivo: 'Faltan nombre o dirección' });
          continue;
        }

        let canonicalId: string;
        try {
          const [guardado] = await persistFoundProspects(supabase, [{
          place_id: placeId,
          nombre,
          direccion,
          telefono: place.nationalPhoneNumber || null,
          barrio: component('sublocality_level_1') || component('sublocality') || null,
          ciudad: component('locality') || 'Ciudad Autónoma de Buenos Aires',
          provincia: component('administrative_area_level_1') || 'Ciudad Autónoma de Buenos Aires',
          latitud: place.location?.latitude ?? 0,
          longitud: place.location?.longitude ?? 0,
          rating: place.rating ?? 0,
          total_ratings: place.userRatingCount ?? 0,
          nivel_precio: place.priceLevel || null,
          tipo_principal: place.primaryType || null,
          tipos: place.types || [],
          sirve_vinos: (place.types || []).some((type) => ['liquor_store', 'wine_bar', 'bar', 'restaurant'].includes(type)),
          website: place.websiteUri || null,
          estado_negocio: place.businessStatus || null,
          updated_at: new Date().toISOString(),
          }]);
          canonicalId = guardado.place_id;
        } catch (error) {
          skipped.push({ place_id: placeId, motivo: error instanceof Error ? error.message : 'No se pudo guardar el prospecto' });
          continue;
        }

        await supabase
          .from('prospect_discovery_queue')
          .update({ estado: 'CONVERTIDO', convertido_prospecto_place_id: canonicalId })
          .eq('place_id', placeId);
        created.push(canonicalId);
        promotedPlaceIds.push(placeId);
      }

      return jsonResponse({ success: true, created: created.length, promoted_place_ids: promotedPlaceIds, skipped });
    }

    if (body.action !== 'search') return jsonResponse({ success: false, error: 'Acción inválida' }, 400);

    const query = String(body.query || '').trim();
    const zone = String(body.zone || '').trim();
    if (body.includedType != null && !ALLOWED_TYPES.has(body.includedType)) {
      return jsonResponse({ success: false, error: 'Tipo de negocio inválido' }, 400);
    }
    if (body.regalos_empresariales != null && typeof body.regalos_empresariales !== 'boolean') {
      return jsonResponse({ success: false, error: 'Enfoque comercial inválido' }, 400);
    }
    const includedType = body.includedType || null;
    const regalos = body.regalos_empresariales === true;
    if (query.length < 3 || query.length > 120 || zone.length > 80) {
      return jsonResponse({ success: false, error: 'Consulta o zona inválida' }, 400);
    }

    if (!hayGoogleMaps()) {
      return jsonResponse({
        success: false,
        error: 'Google Places no está configurado: falta GOOGLE_MAPS_API_KEY',
      }, 503);
    }

    const textQuery = [query, zone, 'Ciudad Autónoma de Buenos Aires', 'Argentina'].filter(Boolean).join(', ');

    // Paginamos hasta 3 páginas (60 lugares) para no devolver siempre los mismos 20.
    const collected: Array<GooglePlace & { id: string }> = [];
    const seenIds = new Set<string>();
    let pageToken: string | undefined = undefined;

    for (let page = 0; page < 3; page++) {
      const searchBody: Record<string, unknown> = {
        textQuery,
        pageSize: 20,
        languageCode: 'es',
        regionCode: 'AR',
        locationRestriction: { rectangle: CABA_VIEWPORT },
      };
      if (includedType) {
        searchBody.includedType = includedType;
        searchBody.strictTypeFiltering = true;
      }
      if (pageToken) searchBody.pageToken = pageToken;

      const googleResponse = await googleMapsFetch(
        '/places/v1/places:searchText',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-FieldMask': `${GOOGLE_FIELD_MASK},nextPageToken`,
          },
          body: JSON.stringify(searchBody),
        },
      );
      const rawText = await googleResponse.text();
      let googleData: GoogleSearchResponse & { nextPageToken?: string };
      try {
        googleData = JSON.parse(rawText) as GoogleSearchResponse & { nextPageToken?: string };
      } catch {
        console.error('Google Places non-JSON response:', googleResponse.status, rawText.slice(0, 300));
        if (page === 0) return jsonResponse({ success: false, error: 'Google Places no pudo completar la búsqueda' }, 502);
        break;
      }
      if (!googleResponse.ok) {
        console.error('Google Places error:', googleData);
        if (page === 0) return jsonResponse({ success: false, error: 'Google Places no pudo completar la búsqueda' }, 502);
        break;
      }

      for (const place of googleData.places || []) {
        if (!place.id || place.businessStatus === 'CLOSED_PERMANENTLY') continue;
        if (seenIds.has(place.id)) continue;
        seenIds.add(place.id);
        collected.push(place as GooglePlace & { id: string });
      }

      pageToken = googleData.nextPageToken;
      if (!pageToken) break;
    }

    const places = regalos ? collected.filter(p => candidatoRegalos({ tipo_principal: p.primaryType, tipos: p.types })) : collected;
    const placeIds = places.map((place) => place.id);


    const queuedIds = new Set<string>();
    const existingProspectIds = new Set<string>();
    if (placeIds.length > 0) {
      const [{ data: queued }, { data: existingProspects }] = await Promise.all([
        supabase.from('prospect_discovery_queue').select('place_id').in('place_id', placeIds).neq('estado', 'DESCARTADO'),
        supabase.from('prospectos').select('place_id').in('place_id', placeIds),
      ]);
      for (const row of queued || []) queuedIds.add(row.place_id);
      for (const row of existingProspects || []) existingProspectIds.add(row.place_id);
    }

    const { data: clients } = await supabase.from('clientes').select('client_id, razon_social, fantasia');
    const clientNameMap = new Map<string, { client_id: string; nombre: string }>();
    for (const client of clients || []) {
      for (const candidate of [client.fantasia, client.razon_social]) {
        if (typeof candidate !== 'string') continue;
        const key = normalizeName(candidate);
        if (key && !clientNameMap.has(key)) {
          clientNameMap.set(key, { client_id: client.client_id, nombre: candidate });
        }
      }
    }

    const results = places.map((place) => {
      const displayName = place.displayName?.text || '';
      return {
        place_id: place.id,
        nombre: displayName,
        direccion: place.formattedAddress || null,
        latitud: place.location?.latitude ?? null,
        longitud: place.location?.longitude ?? null,
        tipo_principal: place.primaryType || null,
        tipos: place.types || [],
        estado_negocio: place.businessStatus || null,
        google_maps_uri: place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(place.id)}`,
        rating: place.rating ?? null,
        total_ratings: place.userRatingCount ?? null,
        nivel_precio: place.priceLevel || null,
        attributions: place.attributions || [],
        premium_score: premiumScore(place),
        queued: queuedIds.has(place.id),
        existing_prospect: existingProspectIds.has(place.id),
        existing_client: clientNameMap.get(normalizeName(displayName)) || null,
      };
    });
    if (!regalos) results.sort((a, b) => b.premium_score - a.premium_score);

    const isNew = (item: typeof results[number]) => !item.queued && !item.existing_prospect && !item.existing_client;
    const excludeExisting = (body as SearchRequest).excludeExisting !== false;
    const nuevos = results.filter(isNew);
    const visibles = excludeExisting ? nuevos : results;

    return jsonResponse({
      success: true,
      results: visibles,
      total_encontrados: results.length,
      nuevos: nuevos.length,
      ya_cargados: results.length - nuevos.length,
      storage_policy: 'Solo se persiste place_id y metadatos internos de seguimiento.',
    });

  } catch (error) {
    console.error('prospect-discovery error:', error);
    return jsonResponse({
      success: false,
      error: mensajePublico(error),
    }, 500);
  }
});
