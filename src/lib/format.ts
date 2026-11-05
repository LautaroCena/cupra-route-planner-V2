/** Importe en pesos. Un total en 0 significa que el archivo no trae precios: se muestra como desconocido. */
export function formatMonto(valor?: number | null, desconocido = "Sin dato"): string {
  const numero = Number(valor);
  if (valor === null || valor === undefined || !Number.isFinite(numero) || numero === 0) return desconocido;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(numero);
}

const LOWER_WORDS = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "do"]);

/** Normaliza nombres a Capital Letter: "CAROLINA MELANIE" -> "Carolina Melanie" */
export function toTitleCase(input?: string | null): string {
  if (!input) return "";
  return input
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-AR")
    .split(" ")
    .map((word, index) =>
      index > 0 && LOWER_WORDS.has(word)
        ? word
        : word
            .split("-")
            .map((part) => (part ? part.charAt(0).toLocaleUpperCase("es-AR") + part.slice(1) : part))
            .join("-")
    )
    .join(" ");
}

/**
 * Clave canónica de un vendedor: sin acentos, sin mayúsculas, sin espacios dobles
 * y tolerante a caracteres corruptos del Excel (se tratan como comodín "?").
 * Se usa para agrupar variantes del mismo nombre en dashboards y asignaciones.
 */
export function vendorKey(input?: string | null): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "?")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/** Compara dos nombres de vendedor tolerando variantes de escritura. */
export function sameVendor(a?: string | null, b?: string | null): boolean {
  const ka = vendorKey(a);
  const kb = vendorKey(b);
  if (!ka || !kb || ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i] && ka[i] !== "?" && kb[i] !== "?") return false;
  }
  return true;
}

/** Agrupa nombres de vendedor equivalentes y devuelve el nombre preferido de cada grupo. */
export function dedupeVendors(names: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const name = (raw || "").trim();
    if (!name) continue;
    const existing = out.findIndex((n) => sameVendor(n, name));
    if (existing === -1) out.push(name);
    else if (!/\?/.test(vendorKey(out[existing])) === false && !/\?/.test(vendorKey(name))) out[existing] = name;
  }
  return out;
}
