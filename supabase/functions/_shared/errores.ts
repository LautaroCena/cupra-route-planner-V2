// Qué ve el usuario cuando algo falla. Los mensajes escritos para el usuario
// ("Elegí un barrio…") se muestran; los técnicos (base de datos, código) no, porque
// pueden mostrar nombres de tablas o detalles internos. Esos quedan en los registros.

const TECNICO = /\b(column|relation|schema|syntax|duplicate key|violates|constraint|permission denied|PGRST\d*|JWT|fetch failed|TypeError|ReferenceError|RangeError|is not a function|undefined|null value|stack|deno|postgres|sql)\b/i;

export const MENSAJE_GENERICO = "Ocurrió un error interno. Probá de nuevo; si sigue, avisale al administrador.";

export function esMensajeTecnico(mensaje: string): boolean {
  return TECNICO.test(mensaje);
}

/** Mensaje apto para mostrar. Un error de la base (objeto con código) o técnico, nunca. */
export function mensajePublico(error: unknown, generico = MENSAJE_GENERICO): string {
  if (!(error instanceof Error)) return generico;
  if (typeof (error as { code?: unknown }).code === "string" && /^(PGRST|\d{5}$)/.test((error as { code: string }).code)) return generico;
  return error.message && !esMensajeTecnico(error.message) ? error.message : generico;
}
