// Recordatorios del vendedor: apartan hasta la fecha y, cuando llega, suben la Oportunidad.
import { ok as assert, deepStrictEqual as assertEquals } from "node:assert/strict";
import { buildRevisitMap, scoreClients } from "./candidatos.ts";

const NOW = new Date("2026-11-09T15:00:00Z");
const dia = (d: number) => new Date(NOW.getTime() + d * 86400000).toISOString();
const cliente = { client_id: "c1", razon_social: "Cliente", cuit_dni: "30700000001", vendedor_actual: "v1",
  ultima_compra: "2026-07-01", cadencia_dias: 20, cantidad_ordenes: 5, factor_oportunidad: 0.2 };
const lugar = { id: "l1", client_id: "c1", lat: -34.585, long: -58.425, direccion_principal: "Calle 1", barrio_principal: "Palermo" };
const puntuar = (revisitMap: Map<string, any>, feedbacks = new Map<string, any[]>()) =>
  scoreClients([cliente], new Map([["c1", lugar]]), feedbacks, { lat: -34.585, lng: -58.425 }, 1.6, { now: NOW, revisitMap });

Deno.test("un recordatorio con fecha futura aparta al cliente hasta esa fecha", () => {
  const m = buildRevisitMap(new Map(), undefined, new Map([["c1", [{ fecha_recordatorio: dia(3), created_at: dia(-1), nota: "traer catálogo" }]]]));
  assertEquals(m.get("c1")?.recordatorio, true);
  assertEquals(puntuar(m).length, 0);
});

Deno.test("cuando llega la fecha, sube la Oportunidad al máximo y lo explica", () => {
  const m = buildRevisitMap(new Map(), undefined, new Map([["c1", [{ fecha_recordatorio: dia(-1), created_at: dia(-4), nota: null }]]]));
  const [c] = puntuar(m);
  assertEquals(c.factores?.oportunidad, 1);
  assertEquals(c.revisita?.fecha, dia(-1).slice(0, 10));
});

Deno.test("pasadas dos semanas de la fecha, deja de tener prioridad", () => {
  const m = buildRevisitMap(new Map(), undefined, new Map([["c1", [{ fecha_recordatorio: dia(-20), created_at: dia(-25) }]]]));
  const [c] = puntuar(m);
  assertEquals(c.factores?.oportunidad, 0.2);
  assertEquals(c.revisita, null);
});

Deno.test("si hubo otra visita después de crear el recordatorio, ya se cumplió", () => {
  const feedbacks = new Map([["c1", [{ id: "f2", created_at: dia(-1), feedback: "compró" }]]]);
  const m = buildRevisitMap(feedbacks, undefined, new Map([["c1", [{ fecha_recordatorio: dia(5), created_at: dia(-6) }]]]));
  assert(!m.get("c1")?.recordatorio);
});

Deno.test("el recordatorio manda sobre lo que se deduce del texto", () => {
  const feedbacks = new Map([["c1", [{ id: "f1", created_at: dia(-2), feedback: "volver en un mes" }]]]);
  const m = buildRevisitMap(feedbacks, undefined, new Map([["c1", [{ fecha_recordatorio: dia(1), created_at: dia(-2) }]]]));
  assertEquals(m.get("c1")?.dueAt, new Date(dia(1)).getTime());
});

Deno.test("un recordatorio vencido marca al negocio como obligatorio; uno deducido del texto, no", () => {
  const conRecordatorio = buildRevisitMap(new Map(), undefined, new Map([["c1", [{ fecha_recordatorio: dia(-1), created_at: dia(-4) }]]]));
  assertEquals(puntuar(conRecordatorio)[0].revisita?.recordatorio, true);
  const feedbacks = new Map([["c1", [{ id: "f1", created_at: dia(-8), feedback: "volver en una semana" }]]]);
  const porTexto = buildRevisitMap(feedbacks, undefined, new Map());
  assertEquals(puntuar(porTexto, feedbacks)[0].revisita?.recordatorio, false);
});
