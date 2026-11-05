import { ok as assert, deepStrictEqual as assertEquals } from "node:assert/strict";
const assertFalse = (value: unknown) => assertEquals(value, false);
import {
  crearResolvedorVendedores,
  diasDesdeUltimaCompra,
  estadoPorDias,
  excluidoPorFeedback,
  exclusionPorFeedback,
  hoyArgentina,
  volverDesde,
  origenProspecto,
  parseEstados,
  tiposGoogleParaRubros,
} from "./reglas.ts";

const NOW = new Date("2026-09-23T15:00:00Z"); // 12:00 en Buenos Aires

Deno.test("días sin comprar se calculan hoy, no al importar", () => {
  // Importado hace tiempo con 20 días: hoy son muchos más.
  assertEquals(diasDesdeUltimaCompra({ ultima_compra: "2026-08-24", dias_desde_ultima_compra: 20 }, NOW), 30);
  assertEquals(diasDesdeUltimaCompra({ ultima_compra: null, dias_desde_ultima_compra: 12 }, NOW), 12);
  assertEquals(diasDesdeUltimaCompra({ ultima_compra: null, dias_desde_ultima_compra: null }, NOW), null);
});

Deno.test("hoy en Argentina cruza bien la medianoche UTC", () => {
  assertEquals(hoyArgentina(new Date("2026-09-24T02:00:00Z")), "2026-09-23");
  assertEquals(hoyArgentina(new Date("2026-09-24T03:30:00Z")), "2026-09-24");
});

Deno.test("estados por días", () => {
  assertEquals(estadoPorDias(0), "ACTIVO");
  assertEquals(estadoPorDias(30), "ACTIVO");
  assertEquals(estadoPorDias(31), "INACTIVO");
  assertEquals(estadoPorDias(90), "INACTIVO");
  assertEquals(estadoPorDias(91), "PERDIDO");
  assertEquals(estadoPorDias(null), "POTENCIAL");
});

Deno.test("parseEstados acepta plurales y minúsculas", () => {
  assertEquals([...parseEstados(["perdidos", "Inactivos", "POTENCIALES", "basura"])], ["PERDIDO", "INACTIVO", "POTENCIAL"]);
  assertEquals(parseEstados(undefined).size, 0);
});

Deno.test("feedback: 'Cerrado' de ese día aparta solo una semana", () => {
  const hace3 = new Date(NOW.getTime() - 3 * 86400000).toISOString();
  const hace30 = new Date(NOW.getTime() - 30 * 86400000).toISOString();
  assert(excluidoPorFeedback([{ motivo_no_visita: "Cerrado", created_at: hace3 }], NOW));
  assertFalse(excluidoPorFeedback([{ motivo_no_visita: "Cerrado", created_at: hace30 }], NOW));
  assertFalse(excluidoPorFeedback([{ feedback: "estaba cerrado, vuelvo mañana", created_at: hace30 }], NOW));
});

Deno.test("feedback: definitivo aparta siempre", () => {
  const hace300 = new Date(NOW.getTime() - 300 * 86400000).toISOString();
  assert(excluidoPorFeedback([{ motivo_no_visita: "Cerrado definitivo", created_at: hace300 }], NOW));
  assert(excluidoPorFeedback([{ feedback: "No volver, no le interesa", created_at: hace300 }], NOW));
  assert(excluidoPorFeedback([{ feedback: "Cerró definitivamente el local" }], NOW));
  assertFalse(excluidoPorFeedback([{ feedback: "Compró 3 cajas, volver en 2 semanas" }], NOW));
});

Deno.test("feedback: manda el comentario más reciente", () => {
  const hace = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();
  // Un "no volver" viejo no pesa si después hubo otra visita.
  assertFalse(excluidoPorFeedback([
    { feedback: "No volver, no le interesa", created_at: hace(200) },
    { feedback: "Compró 2 cajas", created_at: hace(20) },
  ], NOW));
  // El orden en que llegan no importa.
  assert(excluidoPorFeedback([
    { feedback: "Compró 2 cajas", created_at: hace(200) },
    { feedback: "No volver, no le interesa", created_at: hace(20) },
  ], NOW));
  assertFalse(excluidoPorFeedback([
    { motivo_no_visita: "Cerrado definitivo", created_at: hace(100) },
    { feedback: "Reabrió con otro dueño, reactivar", created_at: hace(5) },
  ], NOW));
});

Deno.test("feedback: 'no volver hasta' aparta solo hasta esa fecha", () => {
  // NOW = 23/09/2026. Comentado en marzo: "hasta mayo" ya pasó.
  assertFalse(excluidoPorFeedback([{ feedback: "El dueño está de viaje, no volver hasta mayo", created_at: "2026-03-10T12:00:00Z" }], NOW));
  const r = exclusionPorFeedback([{ feedback: "no volver hasta diciembre", created_at: "2026-09-01T12:00:00Z" }], NOW);
  assertEquals(r, { excluido: true, hasta: "2026-12-01" });
  // Comentado en noviembre, "hasta marzo" es el del año siguiente.
  assertEquals(volverDesde("no volver hasta marzo", new Date("2025-11-10T12:00:00Z"))?.toISOString().slice(0, 10), "2026-03-01");
  assertEquals(volverDesde("no volver hasta el 15/10", new Date("2026-09-01T12:00:00Z"))?.toISOString().slice(0, 10), "2026-10-15");
  // Sin fecha reconocible, es definitivo.
  assertEquals(volverDesde("no volver hasta que llame", new Date()), null);
  assert(excluidoPorFeedback([{ feedback: "no volver hasta que llame", created_at: "2026-01-01T12:00:00Z" }], NOW));
});

Deno.test("vendedor: nunca por substring (MARIANA no es ANA)", () => {
  const r = crearResolvedorVendedores([
    { user_id: "ana", nombre: "Ana" },
    { user_id: "mariana", nombre: "Mariana López" },
    { user_id: "leandro", nombre: "Leandro Pérez" },
    { user_id: "micaela", nombre: "Micaela Rocha" },
  ]);
  assertEquals(r.resolver("MARIANA"), "mariana");
  assertEquals(r.resolver("LOPEZ MARIANA"), "mariana");
  assertEquals(r.resolver("ANA"), "ana");
  assertEquals(r.resolver("PEREZ ANALIA"), null);
  assertEquals(r.resolver("leandro perez"), "leandro");
  assertEquals(r.resolver("ROCHA, MICAELA"), "micaela");
  assertEquals(r.resolver("MICAELA"), "micaela");
});

Deno.test("vendedor: nombre ambiguo no se asigna a ciegas", () => {
  const r = crearResolvedorVendedores([
    { user_id: "j1", nombre: "Juan Gómez" },
    { user_id: "j2", nombre: "Juan Díaz" },
  ]);
  assertEquals(r.resolver("JUAN"), null);
  assertEquals(r.resolver("JUAN DIAZ"), "j2");
});

Deno.test("origen del prospecto", () => {
  assertEquals(origenProspecto({ place_id: "excel-20304050607" }), "excel");
  assertEquals(origenProspecto({ place_id: "manual-abc" }), "manual");
  assertEquals(origenProspecto({ place_id: "x", tipo_principal: "Manual" }), "manual");
  assertEquals(origenProspecto({ place_id: "ChIJ123", total_ratings: 40, rating: 4.4 }), "google");
  // Fila del Excel geocodificada: tiene place_id de Google pero no reseñas.
  assertEquals(origenProspecto({ place_id: "ChIJ123", total_ratings: null, rating: null }), "excel");
  assertEquals(origenProspecto({ place_id: "ChIJ123", total_ratings: 0 }), "excel");
});

Deno.test("tipos de Google por rubro", () => {
  assertEquals(tiposGoogleParaRubros(new Set(["VINOTECA"])), ["liquor_store"]);
  assertEquals(tiposGoogleParaRubros(new Set()), ["liquor_store", "wine_bar", "restaurant", "bar", "hotel"]);
  assertEquals(tiposGoogleParaRubros(new Set(["OTRO RARO"])), []);
});

Deno.test("sin compras: el centinela 9999 es potencial, igual que en la interfaz", () => {
  assertEquals(diasDesdeUltimaCompra({ dias_desde_ultima_compra: 9999 }, NOW), null);
  assertEquals(estadoPorDias(diasDesdeUltimaCompra({ dias_desde_ultima_compra: 9999 }, NOW)), "POTENCIAL");
  assertEquals(diasDesdeUltimaCompra({ ultima_compra: "2026-02-30", dias_desde_ultima_compra: null }, NOW), null);
});
