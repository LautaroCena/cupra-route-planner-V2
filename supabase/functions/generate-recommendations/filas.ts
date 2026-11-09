// Arma las filas de recomendaciones_ia a partir del plan. Separado del handler para
// poder probar que lo que se guarda coincide con las columnas reales de la base.
import { justificacionComercial, limpiarJustificacion, type ScoredCandidate } from "./candidatos.ts";
import type { PlanVendedor } from "./planificador.ts";
import { fraseOportunidad, type Oportunidad } from "../_shared/oportunidad.ts";

export interface ContextoFilas {
  request_id: string;
  nowIso: string;
  regalos: boolean;
  clientePorId: Map<string, any>;
  prospectoPorId: Map<string, any>;
  placesMap: Map<string, any>;
  oportunidadDe: (c: ScoredCandidate) => Oportunidad | undefined;
}

export function armarRecomendaciones(planes: PlanVendedor[], ctx: ContextoFilas): any[] {
  const { request_id, nowIso, regalos, clientePorId, prospectoPorId, placesMap, oportunidadDe } = ctx;
  const recomendaciones: any[] = [];
  for (const pv of planes) {
    for (const c of pv.elegidos) {
      const propuestaRegalos = regalos && !c.alerta_nc ? "Proponer regalos empresariales y consultar quién gestiona compras, RR. HH. o eventos. Validar interés y ocasión de compra. " : "";
      const fallback = justificacionComercial(c);
      // Si el vendedor pidió volver y la fecha llegó, eso va primero y reemplaza a la fecha comercial.
      const fraseRevisita = c.revisita ? `El vendedor pidió volver el ${c.revisita.fecha.split("-").reverse().join("/")}.` : null;
      const cuerpo = limpiarJustificacion([fraseRevisita ?? fraseOportunidad(oportunidadDe(c)), fallback].filter(Boolean).join(" "), fallback);
      const justificacion = propuestaRegalos + (c.rubro && !cuerpo.toLowerCase().includes(c.rubro.toLowerCase()) ? `${c.rubro} · ${cuerpo}` : cuerpo);
      const op = oportunidadDe(c);
      const factores = {
        // Valor (Etapa 2-4): cada factor de 0 a 1, y la justificación de la Oportunidad.
        valor_factores: c.factores ?? null,
        oportunidad: op ? { nivel: op.nivel, motivo: op.motivo, fecha: op.fecha, evento: op.evento, cita: op.cita } : null,
        score_comercial: c.score_comercial,
        score_recencia: c.score_rotacion,
        score_proximidad: c.score_geo,
        distancia_km: c.distancia_km,
        potencial_venta: c.monto_total_historico || 0,
        rubro: c.rubro,
        estado: c.estado_comercial,
        origen: c.origen,
        fuera_de_zona: Boolean(c.fuera_de_zona),
        fuera_de_seleccion: pv.fueraDeSeleccion.has(c.client_id),
        alerta_nota_credito: c.alerta_nc || null,
        tipo_visita: c.alerta_nc ? "servicio/recupero" : regalos ? "regalos empresariales" : "comercial",
        prioridad_comercial: c.prioridad_comercial,
        tipo_negocio: c.tipo_negocio ?? null,
        rating: c.rating ?? null,
        cobertura: pv.cobertura,
      };
      const comun = {
        request_id,
        vendedor_recomendado_id: pv.vendedor.user_id,
        vendedor_recomendado_nombre: pv.vendedor.nombre,
        priority_score: Math.round(c.score_total),
        score_geografico: Math.round(c.score_geo),
        ai_reasoning: justificacion,
        justificacion,
        factores_ia: factores,
        estado_comercial: c.estado_comercial,
        rubro: c.rubro,
        lat: c.lat, long: c.long,
        created_at: nowIso,
        last_recomendation: nowIso,
        ultima_sugerencia: nowIso,
      };
      if (c.es_prospecto) {
        const p = prospectoPorId.get(c.client_id) || {};
        recomendaciones.push({
          ...comun,
          client_id: null,
          prospecto_place_id: c.client_id,
          razon_social: p.nombre || c.razon_social,
          cuit_dni: null,
          es_prospecto: true,
          monto_total_vendido: 0, orders_count: 0, avg_ticket: 0,
          first_purchase_at: null, last_purchase_at: null, days_since_last_purchase: null, participacion: 0,
          score_volumen_num: null, score_recencia_num: null,
          score_volumen: "NUEVO", score_recencia: "NUEVO", score_comercial: "NUEVO",
          ciudades: p.ciudad ? [p.ciudad] : [], provincias: p.provincia ? [p.provincia] : [],
          barrio_principal: p.barrio ?? c.barrio,
          direccion_principal: p.direccion ?? c.direccion,
          google_maps_link: `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.long}${String(c.client_id).startsWith("ChIJ") ? `&query_place_id=${c.client_id}` : ""}`,
          vendedores: [], vendedor_principal: null,
          etiquetas: ["NUEVO", "PROSPECTO"],
          telefonos: p.telefono ? [p.telefono] : [],
        });
      } else {
        const cl = clientePorId.get(c.client_id) || {};
        const place = placesMap.get(c.client_id) || {};
        recomendaciones.push({
          ...comun,
          client_id: c.client_id,
          prospecto_place_id: null,
          razon_social: cl.razon_social || c.razon_social,
          cuit_dni: cl.cuit_dni ?? null,
          es_prospecto: false,
          monto_total_vendido: cl.monto_total_historico,
          orders_count: cl.cantidad_ordenes,
          avg_ticket: cl.ticket_promedio,
          first_purchase_at: cl.primera_compra,
          last_purchase_at: cl.ultima_compra,
          days_since_last_purchase: c.dias_desde_ultima_compra,
          participacion: cl.participacion_mercado,
          score_volumen_num: cl.score_volumen,
          score_recencia_num: cl.score_recencia,
          score_volumen: cl.categoria_volumen,
          score_recencia: c.estado_comercial,
          score_comercial: cl.score_comercial,
          ciudades: cl.todas_ciudades || (cl.ciudad_principal ? [cl.ciudad_principal] : []),
          provincias: [place.provincia_principal || cl.provincia_principal].filter(Boolean),
          // El local en el que entró a la ruta, que puede no ser el principal.
          client_place_id: c.client_place_id ?? null,
          barrio_principal: c.barrio || place.barrio_principal || cl.barrio_principal,
          direccion_principal: c.direccion || place.direccion_principal || cl.direccion_principal,
          google_maps_link: c.client_place_id && c.client_place_id !== place.id
            ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.long}`
            : place.google_maps_link || null,
          vendedores: cl.todos_vendedores || [],
          vendedor_principal: cl.vendedor_actual || cl.vendedor_principal,
          etiquetas: cl.etiquetas || [],
          telefonos: cl.telefonos || [],
        });
      }
    }
  }

  return recomendaciones;
}

/** Lo que va a la base: sin los campos que solo usa la respuesta. */
export const filaParaDb = ({ lat, long, estado_comercial, vendedor_recomendado_nombre, rubro, ...rest }: any) => rest;
