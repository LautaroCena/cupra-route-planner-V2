import { candidatoRegalos } from "../_shared/prospect-categories.ts";
import { construirFallback } from "../_shared/briefing.ts";
import { authorize, failure, RequestError } from "../_shared/location-service.ts";
import { aiChat, hayProveedorIA } from "../_shared/ai-chat.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

type Hechos = Record<string, unknown>;

const NO_PRODUCTO = /(DESCUENTO|BONIFICAC|FLETE|AJUSTE|NOTA DE CREDITO|REDONDEO|INTERES|SERVICIO|ENVIO)/;

function esProducto(nombre: string) {
  return !!nombre && !NO_PRODUCTO.test(nombre.toUpperCase());
}

function familiaProducto(nombre: string) {
  return nombre
    .toUpperCase()
    .replace(/\b\d+\s*X\s*\d+\b/g, " ") // formatos 6X750
    .replace(/\b(19|20)\d{2}\b/g, " ") // añadas
    .replace(/[^A-Z ]/g, " ")
    .replace(/\b[A-Z]\b/g, " ") // sufijos sueltos tipo "V." (vidrio)
    .replace(/\s+/g, " ")
    .trim();
}

function fmtARS(n: number | null | undefined) {
  // Sin precios en el archivo el total queda en 0: es desconocido, no "$ 0".
  if (n === null || n === undefined || !isFinite(Number(n)) || Number(n) === 0) return null;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(n));
}

async function redactarBriefing(hechos: Hechos, nombre: string): Promise<{ texto: string; modelo: string }> {
  const fallback = construirFallback(hechos);
  if (!hayProveedorIA()) return { texto: fallback, modelo: "reglas" };

  try {
    const res = await aiChat({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "Sos un jefe de ventas de una bodega argentina (CUPRA). Escribís briefings de visita para vendedores de calle. " +
              "Recibís SOLO hechos numéricos ya calculados: no inventes datos, no agregues productos ni cifras que no estén en los hechos. " +
              "Devolvés exactamente 3 líneas, sin encabezados ni markdown, en español rioplatense, tono directo y accionable:\n" +
              "1) QUÉ OFRECER: producto o categoría concreta apoyada en el hueco de portfolio o estacionalidad.\n" +
              "2) POR QUÉ: el número que lo justifica (monto, cadencia, precio, share, cliente modelo de la zona).\n" +
              "3) CÓMO ENCARAR: advertencias reales (nota de crédito pendiente, objeción previa, pedido del cliente, persona de contacto). Si no hay riesgos, dar el ángulo de cierre.\n" +
              "Si hay oportunidad de regalos empresariales, proponerla y consultar por compras, RR. HH. o eventos; no asumir interés, presupuesto ni compras confirmadas. " +
              "Máximo 25 palabras por línea. Si un dato falta, omitilo en vez de suponerlo.",
          },
          { role: "user", content: `Cliente: ${nombre}\nHechos:\n${JSON.stringify(hechos, null, 2)}` },
        ],
    });

    if (!res.ok) {
      console.error(`IA ${res.proveedor} error`, res.status, res.errorText);
      return { texto: fallback, modelo: "reglas" };
    }
    const texto = (res.data?.choices?.[0]?.message?.content || "").trim();
    if (!texto) return { texto: fallback, modelo: "reglas" };
    return { texto, modelo: MODEL };
  } catch (e) {
    console.error("Error redactando briefing", e);
    return { texto: fallback, modelo: "reglas" };
  }
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return new Response(null, { status: 405, headers: corsHeaders });

  try {
    const { db: supabase, user, profile } = await authorize(req, false);

    const body = await req.json().catch(() => ({}));
    const clientId: string | null = typeof body.client_id === "string" && body.client_id ? body.client_id : null;
    const placeId: string | null = typeof body.prospecto_place_id === "string" && body.prospecto_place_id ? body.prospecto_place_id : null;
    const forzar: boolean = body.forzar === true;

    if ((!clientId && !placeId) || (clientId && placeId)) {
      return new Response(JSON.stringify({ error: "Indicá solo un client_id o prospecto_place_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.rol === "vendedor") {
      let query = supabase.from("asignaciones_vendedores_clientes").select("id").eq("vendedor_id",user.id);
      query = clientId ? query.eq("client_id",clientId) : query.eq("prospecto_place_id",placeId!);
      const {data,error}=await query.limit(1);
      if(error || !data?.length) throw new RequestError("La ficha requiere una visita asignada",403,"FORBIDDEN");
    }

    // Cache: 7 días
    const cacheQuery = supabase.from("visita_briefings").select("*");
    const { data: existente } = clientId
      ? await cacheQuery.eq("client_id", clientId).maybeSingle()
      : await cacheQuery.eq("prospecto_place_id", placeId!).maybeSingle();

    if (existente && !forzar) {
      const edadDias = (Date.now() - new Date(existente.updated_at).getTime()) / 86400000;
      if (edadDias < 7 && existente.hechos?.version === 2) {
        return new Response(JSON.stringify({ briefing: existente.briefing, hechos: existente.hechos, cache: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const hechos: Hechos = { version: 2 };
    let nombre = "Cliente";

    if (clientId) {
      const { data: cliente } = await supabase
        .from("clientes")
        .select(
          "client_id, razon_social, fantasia, rubro, canal, barrio_principal, monto_total_cupra, monto_total_historico, ticket_promedio, cadencia_dias, dias_desde_ultima_compra, ultima_compra, precio_promedio_caja, monto_notas_credito, fecha_ultima_nc, share_cupra, productos_comprados, etiquetas, categoria_volumen, categoria_recencia",
        )
        .eq("client_id", clientId)
        .maybeSingle();

      if (!cliente) {
        return new Response(JSON.stringify({ error: "Cliente no encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      nombre = cliente.fantasia || cliente.razon_social || clientId;
      hechos.canal = cliente.canal;
      hechos.rubro = cliente.rubro;
      if (candidatoRegalos(cliente)) hechos.oportunidad_regalos_empresariales = "Afinidad por rubro; interés por validar";
      hechos.barrio = cliente.barrio_principal;
      hechos.monto_total = fmtARS(cliente.monto_total_cupra ?? cliente.monto_total_historico);
      hechos.ticket_promedio = fmtARS(cliente.ticket_promedio);
      hechos.cadencia_dias = cliente.cadencia_dias;
      hechos.dias_desde_ultima_compra = cliente.dias_desde_ultima_compra;
      hechos.ultima_compra = cliente.ultima_compra;
      hechos.categoria = [cliente.categoria_volumen, cliente.categoria_recencia].filter(Boolean).join(" / ") || null;
      if (cliente.share_cupra !== null && cliente.share_cupra !== undefined) {
        hechos.share_cupra_pct = Number(cliente.share_cupra);
      }
      if (Number(cliente.monto_notas_credito) > 0) {
        hechos.nota_credito_pendiente = fmtARS(cliente.monto_notas_credito);
        hechos.fecha_ultima_nc = cliente.fecha_ultima_nc;
      }
      if (cliente.cadencia_dias && cliente.dias_desde_ultima_compra) {
        hechos.atraso_vs_cadencia_dias = Math.max(0, Number(cliente.dias_desde_ultima_compra) - Number(cliente.cadencia_dias));
      }

      // Ventas del cliente: productos, estacionalidad y precio realizado
      const { data: ventas } = await supabase
        .from("ventas_cupra")
        .select("nombre, marca, cajas, facturacion_ars, fecha_emision, tipo_comprobante")
        .eq("client_id", clientId)
        .order("fecha_emision", { ascending: false })
        .limit(2000);

      const propios = (ventas || []).filter((v) => (v.tipo_comprobante || "venta") === "venta");
      const porProducto = new Map<string, number>();
      const porMes = new Map<number, number>();
      let cajasTot = 0;
      let factTot = 0;
      for (const v of propios) {
        const prod = (v.nombre || "").trim();
        if (prod) porProducto.set(prod, (porProducto.get(prod) || 0) + Number(v.facturacion_ars || 0));
        if (v.fecha_emision) {
          const mes = new Date(v.fecha_emision as string).getUTCMonth();
          porMes.set(mes, (porMes.get(mes) || 0) + Number(v.facturacion_ars || 0));
        }
        cajasTot += Number(v.cajas || 0);
        factTot += Number(v.facturacion_ars || 0);
      }

      const compra = [...porProducto.entries()].sort((a, b) => b[1] - a[1]);
      hechos.productos_que_compra = compra.slice(0, 6).map(([p]) => p);
      if (porMes.size >= 3) {
        const mesTop = [...porMes.entries()].sort((a, b) => b[1] - a[1])[0];
        hechos.mes_pico_historico = MESES[mesTop[0]];
      }
      const precioCliente = cajasTot > 0 ? factTot / cajasTot : Number(cliente.precio_promedio_caja || 0);
      if (precioCliente > 0) hechos.precio_promedio_caja = fmtARS(precioCliente);

      // Benchmark de zona / canal (últimos 12 meses)
      const desde = new Date();
      desde.setUTCFullYear(desde.getUTCFullYear() - 1);
      const { data: zonaClientes } = await supabase
        .from("clientes")
        .select("client_id, razon_social, fantasia, monto_total_cupra, productos_comprados, precio_promedio_caja")
        .eq("barrio_principal", cliente.barrio_principal || "__none__")
        .order("monto_total_cupra", { ascending: false })
        .limit(30);

      const pares = (zonaClientes || []).filter((c) => c.client_id !== clientId);
      if (pares.length) {
        const modelo = pares[0];
        if (Number(modelo.monto_total_cupra || 0) > Number(cliente.monto_total_cupra || 0)) {
          hechos.cliente_modelo_zona = {
            nombre: modelo.fantasia || modelo.razon_social,
            monto: fmtARS(modelo.monto_total_cupra),
            compra: (modelo.productos_comprados || []).slice(0, 5),
          };
        }
        const precios = pares.map((c) => Number(c.precio_promedio_caja || 0)).filter((p) => p > 0);
        if (precios.length >= 3 && precioCliente > 0) {
          const mediaZona = precios.reduce((a, b) => a + b, 0) / precios.length;
          hechos.precio_vs_zona_pct = Math.round(((precioCliente - mediaZona) / mediaZona) * 100);
        }
      }

      // Hueco de portfolio: top productos del canal que este cliente nunca compró
      const { data: ventasCanal } = await supabase
        .from("ventas_cupra")
        .select("nombre, facturacion_ars, fecha_emision")
        .gte("fecha_emision", desde.toISOString().slice(0, 10))
        .order("fecha_emision", { ascending: false })
        .limit(6000);

      const topMercado = new Map<string, number>();
      for (const v of ventasCanal || []) {
        const prod = (v.nombre || "").trim();
        if (prod) topMercado.set(prod, (topMercado.get(prod) || 0) + Number(v.facturacion_ars || 0));
      }
      // Se compara por familia de producto (sin formato ni añada) para no
      // marcar como "hueco" el mismo vino en otra presentación.
      const comprados = new Set(compra.map(([p]) => familiaProducto(p)));
      const vistas = new Set<string>();
      hechos.hueco_portfolio = [...topMercado.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([p]) => p)
        .filter((p) => {
          if (!esProducto(p)) return false;
          const f = familiaProducto(p);
          if (comprados.has(f) || vistas.has(f)) return false;
          vistas.add(f);
          return true;
        })
        .slice(0, 4);
    } else {
      const { data: prospecto } = await supabase
        .from("prospectos")
        .select("place_id, nombre, tipo_principal, tipos, rubro, barrio, ciudad, rating, total_ratings, nivel_precio, resumen_google, website")
        .eq("place_id", placeId!)
        .maybeSingle();

      if (!prospecto) {
        return new Response(JSON.stringify({ error: "Prospecto no encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      nombre = prospecto.nombre;
      hechos.tipo = "prospecto";
      hechos.tipo_negocio = prospecto.rubro || prospecto.tipo_principal;
      if (candidatoRegalos(prospecto)) hechos.oportunidad_regalos_empresariales = "Afinidad por rubro; interés por validar";
      hechos.zona = [prospecto.barrio, prospecto.ciudad].filter(Boolean).join(", ");
      hechos.rating = prospecto.rating;
      hechos.resenas = prospecto.total_ratings;
      hechos.nivel_precio = prospecto.nivel_precio;
      hechos.resumen_google = prospecto.resumen_google;

      const { data: zonaClientes } = await supabase
        .from("clientes")
        .select("razon_social, fantasia, monto_total_cupra, productos_comprados")
        .eq("barrio_principal", prospecto.barrio || "__none__")
        .order("monto_total_cupra", { ascending: false })
        .limit(3);
      if (zonaClientes?.length) {
        hechos.cliente_modelo_zona = {
          nombre: zonaClientes[0].fantasia || zonaClientes[0].razon_social,
          monto: fmtARS(zonaClientes[0].monto_total_cupra),
          compra: (zonaClientes[0].productos_comprados || []).slice(0, 5),
        };
      }
    }

    // Señal de feedbacks + extracción IA
    const fbQuery = supabase
      .from("cliente_feedbacks")
      .select("feedback, created_at, visita_realizada, estado_cliente, tipo_interaccion, id")
      .order("created_at", { ascending: false })
      .limit(3);
    const { data: feedbacks } = clientId
      ? await fbQuery.eq("client_id", clientId)
      : await fbQuery.eq("prospecto_place_id", placeId!);

    if (feedbacks?.length) {
      hechos.ultimos_comentarios = feedbacks.map((f) => ({ fecha: f.created_at?.slice(0, 10), texto: f.feedback, estado: f.estado_cliente }));
      const { data: extracciones } = await supabase
        .from("feedback_extraccion")
        .select("objecion, interes_producto, riesgo_cobranza, no_ofrecer, contacto_nombre, contacto_rol, revisit_date, sentimiento")
        .in("feedback_id", feedbacks.map((f) => f.id));
      const ex = (extracciones || [])[0];
      if (ex) {
        if (ex.objecion) hechos.ultima_objecion = ex.objecion;
        if (ex.interes_producto?.length) hechos.interes_declarado = ex.interes_producto;
        if (ex.riesgo_cobranza && ex.riesgo_cobranza !== "ninguno") hechos.riesgo_cobranza = ex.riesgo_cobranza;
        if (ex.no_ofrecer) hechos.no_ofrecer_ahora = true;
        if (ex.contacto_nombre) hechos.contacto = [ex.contacto_nombre, ex.contacto_rol].filter(Boolean).join(" - ");
        if (ex.revisit_date) hechos.revisita_pactada = ex.revisit_date;
        if (ex.sentimiento) hechos.clima_relacion = ex.sentimiento;
      }
    }

    const { texto, modelo } = await redactarBriefing(hechos, nombre);

    const payload = {
      client_id: clientId,
      prospecto_place_id: placeId,
      briefing: texto,
      hechos: hechos as never,
      modelo,
      updated_at: new Date().toISOString(),
    };

    // Los índices únicos son parciales, así que el upsert por onConflict no aplica:
    // buscamos la fila existente y actualizamos, o insertamos.
    const buscarExistente = supabase.from("visita_briefings").select("id").limit(1);
    const { data: filaPrevia } = clientId
      ? await buscarExistente.eq("client_id", clientId).maybeSingle()
      : await buscarExistente.eq("prospecto_place_id", placeId!).maybeSingle();

    const { error: upsertError } = filaPrevia?.id
      ? await supabase.from("visita_briefings").update(payload).eq("id", filaPrevia.id)
      : await supabase.from("visita_briefings").insert(payload);

    if (upsertError) console.error("Error guardando briefing", upsertError);

    return new Response(JSON.stringify({ briefing: texto, hechos, modelo, cache: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-briefing error", e);
    return failure(e);
  }
});
