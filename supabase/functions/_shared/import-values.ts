const CP1252: Record<string, number> = {
  "\u20AC": 0x80, "\u201A": 0x82, "\u0192": 0x83, "\u201E": 0x84, "\u2026": 0x85, "\u2020": 0x86, "\u2021": 0x87,
  "\u02C6": 0x88, "\u2030": 0x89, "\u0160": 0x8A, "\u2039": 0x8B, "\u0152": 0x8C, "\u017D": 0x8E, "\u2018": 0x91,
  "\u2019": 0x92, "\u201C": 0x93, "\u201D": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97, "\u02DC": 0x98,
  "\u2122": 0x99, "\u0161": 0x9A, "\u203A": 0x9B, "\u0153": 0x9C, "\u017E": 0x9E, "\u0178": 0x9F,
};
const DOBLE_CODIFICACION = /[\u00C2\u00C3][\u0080-\u00BF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g;

/** Repara texto UTF-8 leído como Latin-1, aunque esté codificado más de una vez. Lo ya perdido (U+FFFD) no se recupera. */
export function repararCodificacion(texto: string): string {
  let actual = texto;
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const siguiente = actual.replace(DOBLE_CODIFICACION, (par) => {
      const byte = CP1252[par[1]] ?? par.charCodeAt(1);
      return String.fromCharCode(((par.charCodeAt(0) & 0x1f) << 6) | (byte & 0x3f));
    });
    if (siguiente === actual) break;
    actual = siguiente;
  }
  // Comillas y guiones de Windows que quedaron sueltos como caracteres de control.
  return actual.replace(/[\u0080-\u009F]/g, (c) => {
    const original = Object.entries(CP1252).find(([, byte]) => byte === c.charCodeAt(0));
    return original ? original[0] : " ";
  });
}

/** Locale-aware ERP values; numeric Excel cells are already unambiguous. */
export function currencyNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  let s = value.trim().replace(/^(?:ARS|AR\$|\$)\s*/i, "").replace(/\s/g, "");
  if (/^\(.*\)$/.test(s)) s = "-" + s.slice(1, -1);
  // Argentine thousands with optional decimal comma; also accept US decimal exports.
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  else if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  const number = Number(s);
  return Number.isFinite(number) ? number : null;
}

export function coordinateNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const text = String(value).trim().replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function argentinaCoordinates(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -56 && lat <= -21 && lng >= -74 && lng <= -53;
}

export function importDate(value: unknown): string | null {
  if (typeof value === "number") {
    // Serial 60 is Excel's fictitious 1900-02-29; never accept it as a real date.
    if (!Number.isFinite(value) || value < 1 || value >= 2958466 || Math.floor(value) === 60) return null;
    const date = new Date(Date.UTC(1899, 11, 31) + (Math.floor(value) - (value >= 60 ? 1 : 0)) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value !== "string") return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.exec(text);
  const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (!iso && !local) return null;
  const [year, month, day] = iso ? [+iso[1], +iso[2], +iso[3]] : [+local![3], +local![2], +local![1]];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function joinStreet(street: string | null, number: string | null): string | null {
  if (!street) return null;
  return number && !street.split(/\s+/).includes(number) ? `${street} ${number}` : street;
}
