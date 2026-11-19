import { supabase } from "@/integrations/supabase/client";
import { fijarFechaCorte, obtenerFechaCorte } from "@/lib/segmentos";

let ultimaVenta: string | null = null;

/** Fecha de la última venta cargada (para avisar si el Excel está atrasado). */
export function obtenerUltimaVenta(): string | null {
  return ultimaVenta;
}

/** Trae la fecha contra la que se miden los días (hoy, en Argentina) y la de la última venta. */
export async function cargarFechaCorte(): Promise<string | null> {
  const [corte, venta] = await Promise.all([
    supabase.rpc("fecha_corte_datos" as never),
    supabase.rpc("fecha_ultima_venta" as never),
  ]);
  if (venta.error) console.error("No se pudo leer la fecha de la última venta:", venta.error);
  else {
    const valor: unknown = venta.data;
    ultimaVenta = typeof valor === "string" ? valor.slice(0, 10) : null;
  }
  if (corte.error) {
    console.error("No se pudo leer la fecha de los datos:", corte.error);
    return obtenerFechaCorte();
  }
  fijarFechaCorte(corte.data);
  return obtenerFechaCorte();
}
