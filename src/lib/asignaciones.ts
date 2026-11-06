import { supabase } from "@/integrations/supabase/client";
import { hoyArgentina } from "@/lib/segmentos";

export interface VisitaParaAsignar {
  vendedor_id: string;
  client_id?: string | null;
  prospecto_place_id?: string | null;
  asignacion_id?: string;
  fecha_programada?: string | null;
  estado?: "Asignado" | "Por visitar";
  orden_ruta?: number | null;
  /** Local de la cuenta a visitar; sin dato, el principal. */
  client_place_id?: string | null;
}

/** Guardado transaccional: visitas, rotación y transferencia de cartera opcional. */
export async function guardarAsignaciones(visitas: VisitaParaAsignar[], actualizarCartera = false): Promise<number> {
  if (!visitas.length) throw new Error("Seleccioná al menos una visita.");
  for (const visita of visitas) {
    if (!visita.vendedor_id || Boolean(visita.client_id) === Boolean(visita.prospecto_place_id)) {
      throw new Error("Cada visita necesita un vendedor y un identificador de cliente o prospecto.");
    }
  }
  const { data, error } = await supabase.rpc("guardar_asignaciones", {
    p_asignaciones: visitas.map((visita) => ({ ...visita })),
    p_actualizar_cartera: actualizarCartera,
  });
  if (error) throw error;
  return data;
}

export async function guardarVisitaPropia(visita: Omit<VisitaParaAsignar, "asignacion_id">): Promise<boolean> {
  if (Boolean(visita.client_id) === Boolean(visita.prospecto_place_id)) throw new Error("Elegí un cliente o prospecto.");
  const { data, error } = await supabase.rpc("autoasignar_visita", {
    p_client_id: visita.client_id ?? null, p_prospecto_id: visita.prospecto_place_id ?? null,
    p_fecha: visita.fecha_programada ?? hoyArgentina(),
  });
  if (error) throw error;
  return (data as { creada: boolean }).creada;
}
