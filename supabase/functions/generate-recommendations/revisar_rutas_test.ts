// Un vendedor sin visitas no frena la generación de los demás.
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { revisarRutas } from "./planificador.ts";

const centro = { lat: -34.585, lng: -58.425 };
const visita = (id: string, dLat = 0) => ({ client_id: id, lat: centro.lat + dLat, long: centro.lng });
const ruta = (nombre: string, elegidos: ReturnType<typeof visita>[]) => ({ vendedor: { nombre }, hotspot: elegidos.length ? centro : null, elegidos });

Deno.test("un vendedor con 0 visitas sale con aviso y los demás siguen", () => {
  const r = revisarRutas([ruta("Leandro", [visita("a"), visita("b", 0.001)]), ruta("Micaela", [])]);
  assertEquals(r.frenar, false);
  assertEquals(r.sinVisitas.map(p => p.vendedor.nombre), ["Micaela"]);
});

Deno.test("si nadie tiene visitas, se frena", () => {
  assertEquals(revisarRutas([ruta("Micaela", []), ruta("Pilar", [])]).frenar, true);
});

Deno.test("una visita fuera del radio sigue frenando", () => {
  const r = revisarRutas([ruta("Leandro", [visita("a"), visita("lejos", 0.03)])]);
  assertEquals([r.frenar, r.rotas.length], [true, 1]);
});
