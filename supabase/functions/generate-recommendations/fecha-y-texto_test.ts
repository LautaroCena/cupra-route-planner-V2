import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { diasDesdeUltimaCompra, estadoPorDias, fijarFechaCorte } from "../_shared/estado-comercial.ts";
import { repararCodificacion } from "../_shared/import-values.ts";

Deno.test("los días se miden contra la fecha de los datos, no contra hoy", () => {
  const hoy = new Date("2026-11-05T15:00:00Z");
  const cliente = { ultima_compra: "2026-09-29" };
  fijarFechaCorte(null);
  assertEquals(estadoPorDias(diasDesdeUltimaCompra(cliente, hoy)), "INACTIVO");
  fijarFechaCorte("2026-09-29");
  assertEquals(diasDesdeUltimaCompra(cliente, hoy), 0);
  assertEquals(estadoPorDias(diasDesdeUltimaCompra(cliente, hoy)), "ACTIVO");
  fijarFechaCorte(null);
});

Deno.test("repara texto mal codificado sin tocar el correcto", () => {
  assertEquals(repararCodificacion("PE\u00C3\u0091A"), "PEÑA");
  assertEquals(repararCodificacion("Pueyrred\u00C3\u00B3n"), "Pueyrredón");
  assertEquals(repararCodificacion("Mart\u00C3\u0083\u00C2\u00ADn"), "Martín");
  assertEquals(repararCodificacion("BELLINI\u00C2\u00B4S"), "BELLINI´S");
  assertEquals(repararCodificacion("A \u0096 B"), "A – B");
  assertEquals(repararCodificacion("Peña Núñez"), "Peña Núñez");
});
