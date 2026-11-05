// ============================================================
// Extracción estructurada del feedback de calle.
// IA SOLO en la frontera no-estructurado → estructurado.
// Las decisiones siguen siendo del código determinístico.
//
// Nunca es bloqueante: si falla, el motor sigue usando el regex de siempre.
// ============================================================

import { authorize, failure } from "../_shared/location-service.ts";
import { aiChat, hayProveedorIA } from "../_shared/ai-chat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";

const EXTRACTION_TOOL = {
  type: "function",
  function: {
    name: "registrar_extraccion",
    description: "Registra los datos estructurados detectados en el comentario del vendedor.",
    parameters: {
      type: "object",
      properties: {
        revisit_dias: {
          type: ["integer", "null"],
          description:
            "Días desde HOY hasta la próxima visita sugerida por el comentario. null si el comentario no sugiere cuándo volver. Ej: 'el dueño vuelve de viaje a fin de mes' con hoy 5 → ~25.",
        },
        objecion: {
          type: ["string", "null"],
          description: "Objeción o traba concreta, en una frase corta. null si no hay.",
        },
        interes_producto: {
          type: "array",
          items: { type: "string" },
          description: "Productos, categorías o marcas que el cliente pidió o mostró interés. Vacío si no hay.",
        },
        riesgo_cobranza: {
          type: "string",
          enum: ["ninguno", "bajo", "medio", "alto"],
          description: "Riesgo de cobranza o conflicto comercial (deuda, reclamo de entrega, quejas de facturación).",
        },
        no_ofrecer: {
          type: "boolean",
          description: "true si el vendedor pide explícitamente NO ofrecer productos por ahora.",
        },
        contacto_nombre: { type: ["string", "null"], description: "Nombre de la persona que decide, si aparece." },
        contacto_rol: { type: ["string", "null"], description: "Rol de esa persona (dueño, encargada, hija, etc.)." },
        sentimiento: { type: "string", enum: ["positivo", "neutro", "negativo"] },
        resumen: { type: "string", description: "Una línea, máximo 140 caracteres, con lo accionable del comentario." },
        confianza: { type: "number", description: "0 a 1. Qué tan claro era el comentario para extraer estos campos." },
      },
      required: [
        "revisit_dias", "objecion", "interes_producto", "riesgo_cobranza",
        "no_ofrecer", "contacto_nombre", "contacto_rol", "sentimiento", "resumen", "confianza",
      ],
      additionalProperties: false,
    },
  },
};

function hoyArgentina(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function extraer(texto: string): Promise<Record<string, unknown> | null> {
  const res = await aiChat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          `Sos un analista comercial de una distribuidora de vinos en Argentina. Hoy es ${hoyArgentina()}.\n` +
          `Extraés datos estructurados de comentarios informales escritos por vendedores de calle.\n` +
          `Reglas: no inventes nada que no esté en el texto; si un dato no aparece, devolvé null o vacío.\n` +
          `Interpretá referencias temporales del castellano rioplatense ("fin de mes", "después de las fiestas", ` +
          `"cuando vuelva de vacaciones") y convertilas a días desde hoy con criterio conservador.`,
      },
      { role: "user", content: texto },
    ],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "function", function: { name: "registrar_extraccion" } },
  });

  if (!res.ok) {
    console.error(`IA ${res.proveedor} ${res.status}: ${res.errorText}`);
    return null;
  }
  const args = res.data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    return JSON.parse(args);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") return new Response(null, { status: 405, headers: corsHeaders });

  try {
    const { db: supabase, user, profile } = await authorize(req, false);

    const body = await req.json().catch(() => ({}));
    const feedbackId: string | undefined = body.feedback_id;
    const requestedLimit = Number(body.limit);
    const limite = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.floor(requestedLimit), 100)) : 25;

    if (!hayProveedorIA()) {
      // Sin clave no rompemos nada: el motor sigue con el parser de siempre.
      return new Response(JSON.stringify({ procesados: 0, motivo: "Sin clave de IA configurada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Qué feedbacks procesar
    let query = supabase
      .from("cliente_feedbacks")
      .select("id, client_id, prospecto_place_id, vendedor_id, feedback, motivo_no_visita, created_at")
      .order("created_at", { ascending: false });

    if (profile.rol === "vendedor") query = query.eq("vendedor_id", user.id);
    if (feedbackId) query = query.eq("id", feedbackId);
    else query = query.limit(300);

    const { data: feedbacks, error } = await query;
    if (error) throw error;

    const ids = (feedbacks || []).map((f) => f.id);
    const { data: yaHechos } = await supabase
      .from("feedback_extraccion")
      .select("feedback_id")
      .in("feedback_id", ids.length ? ids : ["__none__"]);
    const hechos = new Set((yaHechos || []).map((r) => r.feedback_id));

    const pendientes = (feedbacks || [])
      .filter((f) => !hechos.has(f.id))
      .filter((f) => {
        const texto = `${f.feedback || ""} ${f.motivo_no_visita || ""}`.trim();
        return texto.length >= 8;
      })
      .slice(0, limite);

    let procesados = 0;
    for (const fb of pendientes) {
      const texto = [fb.feedback, fb.motivo_no_visita].filter(Boolean).join(" | ");
      const datos = await extraer(texto);
      if (!datos) continue;

      const dias = Number(datos.revisit_dias);
      const base = fb.created_at ? new Date(fb.created_at) : new Date();
      const revisitDate = Number.isFinite(dias) && dias > 0
        ? new Date(base.getTime() + dias * 86400000).toISOString().slice(0, 10)
        : null;

      const { error: upsertError } = await supabase.from("feedback_extraccion").upsert({
        feedback_id: fb.id,
        client_id: fb.client_id,
        prospecto_place_id: fb.prospecto_place_id,
        vendedor_id: fb.vendedor_id,
        revisit_dias: Number.isFinite(dias) && dias > 0 ? Math.round(dias) : null,
        revisit_date: revisitDate,
        objecion: (datos.objecion as string) || null,
        interes_producto: Array.isArray(datos.interes_producto) ? datos.interes_producto : [],
        riesgo_cobranza: (datos.riesgo_cobranza as string) || "ninguno",
        no_ofrecer: Boolean(datos.no_ofrecer),
        contacto_nombre: (datos.contacto_nombre as string) || null,
        contacto_rol: (datos.contacto_rol as string) || null,
        sentimiento: (datos.sentimiento as string) || "neutro",
        resumen: (datos.resumen as string) || null,
        confianza: Number(datos.confianza) || 0,
        modelo: MODEL,
      }, { onConflict: "feedback_id" });

      if (upsertError) console.error("upsert error", upsertError);
      else procesados++;
    }

    return new Response(JSON.stringify({ procesados, pendientes: pendientes.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-feedback error", e);
    return failure(e);
  }
});
