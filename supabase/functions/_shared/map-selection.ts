import { distanciaKm, errorRuta, RADIO_RUTA_KM, VISITAS_POR_DIA, type Coordenada } from "./ruta.ts";
import { crearResolvedorVendedores } from "./reglas.ts";
import { diasDesdeUltimaCompra, estadoPorDias } from "./estado-comercial.ts";

export interface PuntoMapa extends Coordenada {
  key: string;
  tipo: "cliente" | "prospecto";
  id: string;
  nombre: string;
  direccion: string;
  barrio: string | null;
  ciudad: string | null;
  comuna: string | null;
  rubro: string | null;
  estado: string;
  vendedor: string | null;
  dias: number | null;
  ventas: number | null;
  telefono: string | null;
  excluido?: boolean;
  rating?: number | null;
  resenas?: number | null;
  distancia_centro_m?: number;
  distancia_cliente_m?: number;
}
export interface ClienteMapa {
  client_id: string; razon_social?: string | null; fantasia?: string | null;
  vendedor_actual?: string | null; vendedor_principal?: string | null; todos_vendedores?: string[] | null;
  direccion_principal?: string | null; barrio_principal?: string | null; ciudad_principal?: string | null;
  rubro?: string | null; ultima_compra?: string | null; dias_desde_ultima_compra?: number | null;
  monto_total_historico?: number | null; telefonos?: string[] | null; excluir_recomendaciones?: boolean | null;
}
export interface UbicacionMapa {
  id: string; client_id: string; lat: number | null; long: number | null;
  is_primary?: boolean | null; direccion_verificada?: boolean | null;
  direccion_principal?: string | null; barrio_principal?: string | null; comuna?: string | null;
  google_maps_link?: string | null;
}
export const coordenadaMapaValida = (p: { lat: unknown; lng: unknown }): p is Coordenada =>
  typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  && p.lat >= -56 && p.lat <= -21 && p.lng >= -74 && p.lng <= -53;

/** Sólo los clientes elegidos definen el centro; los prospectos nunca lo desplazan. */
export function centroClientes(puntos: Coordenada[]): Coordenada | null {
  if (!puntos.length || puntos.some(p => !coordenadaMapaValida(p))) return null;
  return {
    lat: puntos.reduce((sum, p) => sum + p.lat, 0) / puntos.length,
    lng: puntos.reduce((sum, p) => sum + p.lng, 0) / puntos.length,
  };
}

export function validarSeleccionMapa(puntos: PuntoMapa[], completa = false, centroZona: Coordenada | null = null): string | null {
  const clientes = puntos.filter(p => p.tipo === "cliente");
  if (!clientes.length && !coordenadaMapaValida(centroZona || { lat: null, lng: null })) return "Seleccioná primero al menos un cliente del vendedor.";
  if (puntos.length > VISITAS_POR_DIA) return "La ruta ya tiene ocho visitas. Quitá una antes de agregar otra.";
  if (puntos.some(p => p.excluido)) return "Hay destinos del borrador que ya no están disponibles. Revisá la selección.";
  return errorRuta(puntos.map(p => ({ ...p, id: p.key })), clientes.length ? centroClientes(clientes) : centroZona, completa);
}

/** Se usa la misma preferencia de ubicación en el mapa y al validar en el servidor. */
export function ubicacionesPreferidas(places: UbicacionMapa[]): Map<string, UbicacionMapa> {
  const result = new Map<string, UbicacionMapa>();
  const sorted = [...places].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary))
    || Number(Boolean(b.direccion_verificada)) - Number(Boolean(a.direccion_verificada)) || a.id.localeCompare(b.id));
  for (const p of sorted) {
    if (!result.has(p.client_id) && coordenadaMapaValida({ lat: p.lat, lng: p.long })) result.set(p.client_id, p);
  }
  return result;
}

export function carteraDelVendedor(clientes: ClienteMapa[], perfiles: { user_id: string; nombre: string | null }[], vendedorId: string,
  vinculos: { nombre: string; user_id: string }[] = []) {
  const resolvedor = crearResolvedorVendedores(perfiles, vinculos);
  return clientes.filter(c => {
    // La cartera actual es autoridad. Un dueño diferente no se sustituye por un vendedor histórico.
    const nombres = c.vendedor_actual?.trim() ? [c.vendedor_actual] : [c.vendedor_principal, ...(c.todos_vendedores || [])];
    return nombres.map(n => resolvedor.resolver(n)).find(Boolean) === vendedorId;
  });
}

export function puntosDeCartera(clientes: ClienteMapa[], places: UbicacionMapa[]) {
  const ubicaciones = ubicacionesPreferidas(places);
  const puntos: PuntoMapa[] = [], sinUbicacion: ClienteMapa[] = [];
  for (const c of clientes) {
    const p = ubicaciones.get(c.client_id);
    if (!p) { sinUbicacion.push(c); continue; }
    const dias = diasDesdeUltimaCompra(c);
    puntos.push({ key: `C:${c.client_id}`, tipo: "cliente", id: c.client_id,
      nombre: c.fantasia || c.razon_social || "Sin nombre", lat: p.lat!, lng: p.long!,
      direccion: p.direccion_principal || c.direccion_principal || "",
      barrio: p.barrio_principal || c.barrio_principal || null,
      ciudad: c.ciudad_principal || null, comuna: p.comuna || null,
      rubro: c.rubro || null, estado: estadoPorDias(dias), dias,
      ventas: c.monto_total_historico ?? null, telefono: c.telefonos?.[0] || null,
      vendedor: c.vendedor_actual || c.vendedor_principal || null, excluido: Boolean(c.excluir_recomendaciones),
    });
  }
  return { puntos, sinUbicacion };
}

const claveZona = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
const zonasPunto = (p: Pick<PuntoMapa, "barrio" | "ciudad" | "comuna">) =>
  ([['b', p.barrio], ['l', p.ciudad], ['c', p.comuna]] as const).filter(([, n]) => n?.trim());

/** Opciones de los datos del vendedor, incluyendo localidades fuera de CABA. */
export function opcionesZona(puntos: PuntoMapa[]): { value: string; label: string }[] {
  const zonas = new Map<string, { nombre: string; n: number }>();
  for (const p of puntos) for (const [tipo, nombre] of zonasPunto(p)) {
    const key = `${tipo}:${claveZona(nombre!)}`;
    const prev = zonas.get(key);
    zonas.set(key, { nombre: nombre!, n: (prev?.n || 0) + 1 });
  }
  return [...zonas].map(([value, z]) => ({ value, label: `${z.nombre} (${z.n})` }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}
export function perteneceZona(p: PuntoMapa, zona: string): boolean {
  return zona === "todas" || zonasPunto(p).some(([tipo, nombre]) => `${tipo}:${claveZona(nombre!)}` === zona);
}

export const RADIOS_BUSQUEDA_MAPA = [0.15, 0.3, 0.6, 1, RADIO_RUTA_KM];
export function distanciaAlCliente(p: Coordenada, clientes: Coordenada[]): number {
  return Math.min(...clientes.map(c => distanciaKm(c, p)));
}
