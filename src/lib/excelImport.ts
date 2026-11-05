import * as XLSX from "xlsx";

export type ImportKind = "ventas" | "maestro" | "prospectos" | "notas";
export type SpreadsheetRow = Record<string, unknown>;
export interface ImportSheet { name: string; kind: ImportKind; headerRow: number; columns: string[]; rows: SpreadsheetRow[] }
const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function classify(columns: string[], name: string): ImportKind | null {
  const keys = columns.map(norm);
  const has = (...names: string[]) => names.some(n => keys.includes(norm(n)));
  const money = has("Precio Total Final", "Total Final", "Total Bruto", "Facturación Ar$", "facturacion_ars", "Importe No Gravado", "Importe Neto");
  if (money && /notas?.*cr[eé]dito|^nc\b/i.test(name)) return "notas";
  if (has("Ticket", "Comprobante") && money) return "ventas";
  if (has("Razón Social", "RAZON SOCIAL / NOM. FANTASIA") && has("Id", "Código", "CUIT", "CUIT / DNI", "Vendedor", "Categorías", "Latitud")) return "maestro";
  if (has("CLIENTE", "Comercio", "Nombre Fantasía", "Nombre", "Fantasía") && has("DIR. ENTREGA", "Dirección de entrega", "Dirección", "Domicilio")) return "prospectos";
  return null;
}

/** Lista lista para corregir y volver a subir: el contenido original, más la fila y el motivo. */
export function descargarFilasRechazadas(filas: { fila: number; texto: string; datos: SpreadsheetRow }[], nombre = "filas-rechazadas.xlsx"): void {
  const hoja = XLSX.utils.json_to_sheet(filas.map(({ fila, texto, datos }) => {
    const { __fila_excel: _numero, ...original } = datos;
    return { ...original, "Fila original": fila || "", "Motivo de rechazo": texto };
  }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Rechazadas");
  XLSX.writeFile(libro, nombre);
}

export function parseImportWorkbook(buffer: ArrayBuffer): { sheets: ImportSheet[]; ignored: string[] } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellNF: true });
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  const sheets: ImportSheet[] = [];
  const ignored: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet["!ref"]) { ignored.push(name); continue; }
    const range = XLSX.utils.decode_range(sheet["!ref"]!);
    if (range.e.c > 500 || range.e.r > 50_050) throw new Error(`La hoja «${name}» excede el límite de 50.000 filas o 500 columnas. Quitá filas vacías con formato al final del archivo.`);
    let header = -1;
    let kind: ImportKind | null = null;
    let columns: string[] = [];
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 49); r++) {
      const values = Array.from({ length: range.e.c + 1 }, (_, c) => String(sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? "").trim());
      const found = classify(values, name);
      if (found) { header = r; kind = found; columns = values; break; }
    }
    if (!kind) { ignored.push(name); continue; }
    const nonempty = columns.filter(Boolean);
    if (new Set(nonempty.map(norm)).size !== nonempty.length) throw new Error(`La hoja «${name}» tiene encabezados duplicados. Renombrá las columnas antes de cargarla.`);
    const rows: SpreadsheetRow[] = [];
    for (let r = header + 1; r <= range.e.r; r++) {
      const row: SpreadsheetRow = {};
      let hasData = false;
      for (let c = 0; c < columns.length; c++) {
        if (!columns[c]) continue;
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell?.t === "e") throw new Error(`La hoja «${name}», fila ${r + 1}, contiene un error de Excel en «${columns[c]}».`);
        let value: unknown = cell?.v ?? null;
        if (typeof value === "number" && (norm(columns[c]).startsWith("fecha") || cell?.z && XLSX.SSF.is_date(cell.z))) {
          const date = XLSX.SSF.parse_date_code(value, { date1904 });
          value = date ? `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}` : null;
        }
        if (value !== null && String(value).trim()) hasData = true;
        row[columns[c]] = value;
      }
      if (hasData) rows.push({ ...row, __fila_excel: r + 1 });
    }
    const limit = kind === "prospectos" ? 5000 : 50_000;
    if (rows.length > limit) throw new Error(`La hoja «${name}» excede el límite de ${limit.toLocaleString("es-AR")} filas.`);
    if (rows.length) sheets.push({ name, kind, headerRow: header + 1, columns: nonempty, rows });
    else ignored.push(name);
  }
  if (!sheets.some(s => s.kind !== "notas")) throw new Error("No se reconoció una hoja de ventas, maestro o prospectos. Revisá los encabezados del archivo.");
  return { sheets, ignored };
}
