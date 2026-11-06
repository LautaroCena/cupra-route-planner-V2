// Compara el motor viejo (cercanía) con el nuevo (valor) sobre los datos reales.
// Uso: node --experimental-strip-types scripts/comparar-motor.mjs <export.json> [topeKm] [penalizacion]
// El export sale de la base de la demo (clientes + client_places); no se sube al repo.
// Mide en línea recta: con distancias por calle los km van a ser mayores.
import fs from 'node:fs';
import { seleccionarCercanos } from '../supabase/functions/_shared/compact-route.ts';
import { seleccionarPorValor, largo } from '../supabase/functions/_shared/seleccion.ts';
import { recuperacion, potencial, basePotencial, valor } from '../supabase/functions/_shared/valor.ts';
import { distanciaKm } from '../supabase/functions/_shared/ruta.ts';

const [archivo, topeArg, penArg] = process.argv.slice(2);
const raw = fs.readFileSync(archivo, 'utf8');
const filas = JSON.parse(raw.slice(raw.indexOf('{'))).rows;
const corte = Date.parse(filas[0].corte);

const clientes = new Map();
for (const f of filas) {
  if (f.excluir_recomendaciones) continue;
  const c = clientes.get(f.client_id) || { ...f, cajas_total: Number(f.cajas_total), locales: [] };
  c.locales.push({ lat: Number(f.lat), lng: Number(f.long), primario: f.is_primary });
  clientes.set(f.client_id, c);
}
const lista = [...clientes.values()].map((c) => ({ ...c, locales: c.locales.sort((a, b) => Number(b.primario) - Number(a.primario)) }));
const base = basePotencial(lista);
for (const c of lista) {
  c.dias_sin_comprar = c.ultima_compra ? Math.round((corte - Date.parse(c.ultima_compra)) / 864e5) : null;
  c.factores = { recuperacion: recuperacion(c), potencial: potencial(c, base) };
  c.valorSinRecorrido = valor({ ...c.factores });
}

const parametros = { topeKm: topeArg ? Number(topeArg) : Infinity, penalizacionFranja: penArg ? Number(penArg) : 9.4 };
const resultados = { viejo: [], nuevo: [] };
let franja = 0, multi = 0, incompletas = 0, centros = 0;
for (const centroCliente of lista) {
  const centro = centroCliente.locales[0];
  const cartera = lista.filter((c) => c.vendedor_actual === centroCliente.vendedor_actual
    && c.locales.some((l) => distanciaKm(centro, l) <= 1.6));
  if (cartera.filter((c) => distanciaKm(centro, c.locales[0]) <= 1.5).length < 8) continue;
  centros++;
  const porId = new Map(cartera.map((c) => [c.client_id, c]));
  const viejo = seleccionarCercanos(centro, cartera.map((c) => ({ id: c.client_id, ...c.locales[0] })), [], 8);
  const nuevo = seleccionarPorValor(centro, cartera.map((c) => ({ id: c.client_id, factores: c.factores, locales: c.locales })), distanciaKm, distanciaKm, parametros);
  const medir = (ids, puntos) => ({
    valor: ids.reduce((s, id) => s + porId.get(id).valorSinRecorrido, 0) / ids.length,
    km: largo([centro, ...puntos], distanciaKm),
    n: ids.length,
    urgentes: ids.filter((id) => (porId.get(id).factores.recuperacion ?? 0) >= 0.5).length,
  });
  resultados.viejo.push(medir(viejo.map((p) => p.id), viejo));
  resultados.nuevo.push(medir(nuevo.elegidos.map((e) => e.id), nuevo.elegidos.map((e) => e.local)));
  franja += nuevo.elegidos.filter((e) => e.enFranja).length;
  multi += nuevo.elegidos.filter((e) => porId.get(e.id).locales.length > 1 && (e.local.lat !== porId.get(e.id).locales[0].lat)).length;
  if (nuevo.elegidos.length < 8) incompletas++;
}

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };
const fila = (nombre, r) => {
  const v = r.map((x) => x.valor), k = r.map((x) => x.km), u = r.map((x) => x.urgentes);
  return `| ${nombre} | ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} | ${(u.reduce((a, b) => a + b, 0) / u.length).toFixed(1)} | ${q(k, 0.5).toFixed(2)} | ${q(k, 0.9).toFixed(2)} | ${Math.max(...k).toFixed(2)} |`;
};
console.log(`Centros con al menos 8 clientes del mismo vendedor en 1,5 km: ${centros}. Tope ${parametros.topeKm} km, penalización ${parametros.penalizacionFranja}.`);
console.log('| Motor | Valor medio por visita | Visitas urgentes (de 8) | Km mediana | Km p90 | Km máx |');
console.log('|---|---|---|---|---|---|');
console.log(fila('Viejo (cercanía)', resultados.viejo));
console.log(fila('Nuevo (valor)', resultados.nuevo));
console.log(`Rutas con menos de 8: ${incompletas}. Visitas en la franja: ${franja}. Visitas en un local no principal: ${multi}.`);

// Penalización de la franja: mediana del desvío del valor dentro de cada zona.
const desvios = [];
for (const centroCliente of lista) {
  const centro = centroCliente.locales[0];
  const zona = lista.filter((c) => distanciaKm(centro, c.locales[0]) <= 1.5).map((c) => c.valorSinRecorrido);
  if (zona.length < 4) continue;
  const m = zona.reduce((a, b) => a + b, 0) / zona.length;
  desvios.push(Math.sqrt(zona.reduce((s, x) => s + (x - m) ** 2, 0) / zona.length));
}
console.log(`Desvío del valor por zona: mediana ${q(desvios, 0.5).toFixed(1)} puntos (base de la penalización de la franja).`);
