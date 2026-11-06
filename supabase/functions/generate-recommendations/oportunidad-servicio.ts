// Calcula la Oportunidad de los negocios de una zona. Dos consultas a la IA, ambas guardadas:
// - Fechas: una por semana (fechas_ia), aplicada a cada negocio por su rubro.
// - Comentarios: solo negocios con comentario, y solo si cambió algo (oportunidad_ia).
// Si la IA falla, lo que falta queda neutro y la ruta sale igual.
import { aiChat, hayProveedorIA, MODELO_IA } from "../_shared/ai-chat.ts";
import {
  type CandidatoOportunidad, combinarOportunidad, type FechaIA, type Oportunidad, oportunidadPorFecha,
  pedidoFechas, pedidoOportunidad, validarFechas, validarOportunidades, VENTANA_FECHA_DIAS, VERSION_PEDIDO,
} from "../_shared/oportunidad.ts";
import { CATEGORIAS_PROSPECTOS } from "../_shared/prospect-categories.ts";

/** Negocios por llamada a la IA: tandas chicas responden más rápido y fallan menos. */
const TANDA = 40;
/** Tiempo total para la IA dentro de una generación de rutas. */
const PLAZO_MS = 25_000;
/** Rubros que la IA puede usar para las fechas: los del catálogo más los de la base. */
const RUBROS_BASE = [...new Set([...CATEGORIAS_PROSPECTOS.map((c) => c.rubro), "Almacén / Supermercado", "Distribuidor", "Tienda gourmet"])];

/** Semana del año (ISO): las fechas cercanas se revisan una vez por semana. */
export function semanaISO(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const semana = 1 + Math.round(((d.getTime() - primerJueves.getTime()) / 86_400_000 - 3 + ((primerJueves.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

export function huella(c: CandidatoOportunidad, hoy: string): string {
  // Incluye las reglas: si cambia el pedido o la ventana, se vuelve a puntuar.
  return JSON.stringify([semanaISO(hoy), VENTANA_FECHA_DIAS, VERSION_PEDIDO, c.rubro, c.canal, c.es_prospecto, c.comentario]);
}

const argumentos = (r: any) => {
  const args = r.data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  return args ? JSON.parse(args) : null;
};

/** Fechas de la semana: guardadas, o una consulta nueva. null si la IA no respondió. */
async function fechasDeLaSemana(db: any, hoy: string, rubros: string[]): Promise<{ fechas: FechaIA[] | null; fallo: string | null }> {
  const semana = semanaISO(hoy);
  const { data: guardada } = await db.from("fechas_ia").select("*").eq("semana", semana).maybeSingle();
  if (guardada && guardada.version === VERSION_PEDIDO) return { fechas: guardada.fechas as FechaIA[], fallo: null };
  if (!hayProveedorIA()) return { fechas: null, fallo: "No hay clave de IA: Oportunidad queda neutra." };
  const r = await aiChat(pedidoFechas(hoy, rubros));
  if (!r.ok) return { fechas: null, fallo: `La IA no respondió por las fechas (${r.status || "sin conexión"}); quedan neutras.` };
  let fechas: FechaIA[];
  try {
    const crudas = argumentos(r)?.fechas;
    fechas = validarFechas(crudas, rubros, hoy);
    console.log(`[oportunidad] fechas propuestas ${Array.isArray(crudas) ? crudas.length : 0}, aceptadas ${fechas.length}: ` +
      JSON.stringify(fechas.map((f) => `${f.fecha} ${f.evento}`)));
  } catch {
    return { fechas: null, fallo: "La IA respondió las fechas en un formato inválido; quedan neutras." };
  }
  const { error } = await db.from("fechas_ia").upsert({
    semana, version: VERSION_PEDIDO, fechas, modelo: Deno.env.get("GEMINI_MODEL") || MODELO_IA, calculado_at: new Date().toISOString(),
  });
  if (error) console.error("No se pudo guardar fechas_ia:", error.message);
  return { fechas, fallo: null };
}

export async function calcularOportunidades(db: any, candidatos: CandidatoOportunidad[], hoy: string): Promise<{
  oportunidades: Map<string, Oportunidad>; consultados: number; fallo: string | null;
}> {
  const oportunidades = new Map<string, Oportunidad>();
  if (!candidatos.length) return { oportunidades, consultados: 0, fallo: null };
  const plazo = Date.now() + PLAZO_MS;
  const fallos: string[] = [];

  const rubros = [...new Set([...RUBROS_BASE, ...candidatos.map((c) => c.rubro).filter((x): x is string => Boolean(x))])];
  const { fechas, fallo: falloFechas } = await fechasDeLaSemana(db, hoy, rubros);
  if (falloFechas) fallos.push(falloFechas);

  // Comentarios: solo los negocios que tienen uno.
  const porComentario = new Map<string, Oportunidad>();
  const conComentario = candidatos.filter((c) => c.comentario);
  const guardados = new Map<string, any>();
  for (let i = 0; i < conComentario.length; i += 200) {
    const { data } = await db.from("oportunidad_ia").select("*").in("clave", conComentario.slice(i, i + 200).map((c) => c.id));
    for (const g of data || []) guardados.set(g.clave, g);
  }
  const pendientes: CandidatoOportunidad[] = [];
  for (const c of conComentario) {
    const g = guardados.get(c.id);
    if (g && g.huella === huella(c, hoy)) {
      porComentario.set(c.id, { nivel: g.nivel, motivo: g.motivo, fecha: g.fecha, evento: g.evento, cita: g.cita, rechazo: g.rechazo ?? undefined });
    } else {
      pendientes.push(c);
    }
  }
  let consultados = 0;
  if (pendientes.length && !hayProveedorIA()) fallos.push("No hay clave de IA: los comentarios no se puntúan.");
  for (let i = 0; i < pendientes.length && hayProveedorIA(); i += TANDA) {
    if (Date.now() > plazo) { fallos.push("Se agotó el tiempo de la IA; algunos comentarios quedan sin puntuar."); break; }
    const tanda = pendientes.slice(i, i + TANDA);
    // La IA ve un número de orden, no el CUIT ni el ID del lugar.
    const alias = tanda.map((c, n) => ({ ...c, id: `n${n + 1}` }));
    const r = await aiChat(pedidoOportunidad(hoy, alias));
    if (!r.ok) { fallos.push(`La IA no respondió por los comentarios (${r.status || "sin conexión"}).`); continue; }
    let respuestas: unknown[] = [];
    try {
      respuestas = argumentos(r)?.puntajes || [];
    } catch {
      fallos.push("La IA respondió los comentarios en un formato inválido.");
      continue;
    }
    const porAlias = validarOportunidades(respuestas as any[], alias, hoy);
    const cuenta = (xs: (string | undefined | null)[]) => xs.reduce((m: Record<string, number>, x) => (m[x || "-"] = (m[x || "-"] || 0) + 1, m), {});
    console.log(`[oportunidad] comentarios: ${respuestas.length} respuestas; motivos ${JSON.stringify(cuenta((respuestas as any[]).map((x) => x?.motivo)))}; ` +
      `rechazos ${JSON.stringify(cuenta([...porAlias.values()].map((o) => o.rechazo)))}`);
    consultados += tanda.length;
    const filas = tanda.map((c, n) => {
      const o = porAlias.get(`n${n + 1}`)!;
      porComentario.set(c.id, o);
      return { clave: c.id, huella: huella(c, hoy), nivel: o.nivel, motivo: o.motivo, fecha: o.fecha, evento: o.evento,
        cita: o.cita, rechazo: o.rechazo ?? null, modelo: Deno.env.get("GEMINI_MODEL") || MODELO_IA, calculado_at: new Date().toISOString() };
    }).filter((f) => f.nivel !== null); // sin respuesta no se guarda: se vuelve a preguntar
    if (filas.length) {
      const { error } = await db.from("oportunidad_ia").upsert(filas);
      if (error) console.error("No se pudo guardar oportunidad_ia:", error.message);
    }
  }

  for (const c of candidatos) {
    oportunidades.set(c.id, combinarOportunidad(porComentario.get(c.id), fechas ? oportunidadPorFecha(fechas, c.rubro) : null));
  }
  return { oportunidades, consultados, fallo: fallos.length ? fallos.join(" ") : null };
}
