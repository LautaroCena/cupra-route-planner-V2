import { type Cupos, cuposValidos } from "../_shared/cupos.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SolicitudInvalida extends Error {}

export function validarSolicitud(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SolicitudInvalida("Solicitud inválida.");
  const body = raw as Record<string, unknown>;
  const lista = (key: string, max: number, ids = false): string[] => {
    const value = body[key];
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > max || value.some((v) =>
      typeof v !== "string" || !v.trim() || v.length > 160 || (ids && !UUID.test(v)))) {
      throw new SolicitudInvalida(`El filtro ${key} es inválido.`);
    }
    return [...new Set(value.map((v: string) => v.trim()))];
  };
  const texto = (key: string, max: number): string | null => {
    if (body[key] == null) return null;
    if (typeof body[key] !== "string" || body[key].length > max) throw new SolicitudInvalida(`El campo ${key} es inválido.`);
    return body[key].trim() || null;
  };
  const area_id = texto("area_id", 36);
  if (area_id && !UUID.test(area_id)) throw new SolicitudInvalida("El área es inválida.");
  const estados = lista("estados", 5);
  if (estados.some((s) => !/^(activos?|inactivos?|perdidos?|potenciales?|potencial|prospectos?)$/i.test(s))) {
    throw new SolicitudInvalida("El estado comercial es inválido.");
  }
  if (body.regalos_empresariales != null && typeof body.regalos_empresariales !== "boolean") {
    throw new SolicitudInvalida("El enfoque comercial es inválido.");
  }
  // Cupos por ruta: si no vienen, el motor usa los de por defecto.
  let cupos: Cupos | null = null;
  if (body.cupos != null) {
    cupos = cuposValidos(body.cupos);
    if (!cupos) throw new SolicitudInvalida("Los cupos tienen que ser números enteros que sumen 8.");
  }
  return {
    cupos,
    regalos_empresariales: body.regalos_empresariales === true,
    vendedores: lista("vendedores", 30, true), barrio: lista("barrio", 100), comuna: lista("comuna", 30),
    estados, rubros: lista("rubros", 30), area_id,
    provincia: texto("provincia", 160), instrucciones_adicionales: texto("instrucciones_adicionales", 4000),
  };
}
