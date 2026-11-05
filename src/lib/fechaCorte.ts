import { supabase } from "@/integrations/supabase/client";
import { fijarFechaCorte, obtenerFechaCorte } from "@/lib/segmentos";

/** Trae la fecha de la última venta cargada. Sin datos, los días se miden contra hoy. */
export async function cargarFechaCorte(): Promise<string | null> {
  const { data, error } = await supabase.rpc("fecha_corte_datos" as never);
  if (error) {
    console.error("No se pudo leer la fecha de los datos:", error);
    return obtenerFechaCorte();
  }
  fijarFechaCorte(data);
  return obtenerFechaCorte();
}
