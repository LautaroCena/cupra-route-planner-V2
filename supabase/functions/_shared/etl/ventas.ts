// Revisión de filas de ventas. Módulo puro: lo usan la pantalla, antes de cargar, y la función.
// Principio: se acepta lo que tiene sentido. Se rechaza una fila solo si el dato no tiene
// sentido o no se puede saber qué venta es. Lo faltante se guarda como desconocido y se avisa.
import { coordinateNumber, currencyNumber, importDate, repararCodificacion } from "../import-values.ts";

type Fila = Record<string, unknown>;

/** Se frena el archivo si se rechazan más filas que este porcentaje: suele indicar columnas mal leídas. */
export const UMBRAL_RECHAZO_PCT = 5;

const MESES: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

const normCampo = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const sinAcentos = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export const CAMPOS = {
  ticket: ["Ticket", "Comprobante"],
  letra: ["Letra"],
  fecha: ["Fecha Emisión", "Fecha", "fecha_emision"],
  documento: ["CUIT / DNI", "CUIT/DNI", "CUIT DNI", "cuit_dni", "CUIT", "Documento"],
  razon: ["Razón Social", "razon_social"],
  fantasia: ["Fantasía", "Fantasia"],
  cantidad: ["Cajas", "Cantidad"],
  producto: ["Código Producto", "codigo_producto", "Código"],
  importe: ["Precio Total Final", "Precio Total Neto", "Facturación Ar$", "Facturación Ars", "facturacion_ars"],
  vendedor: ["Vendedor"],
  provincia: ["Provincia"],
  ciudad: ["Ciudad", "Localidad"],
  latitud: ["Latitud", "Lat"],
  longitud: ["Longitud", "Lng", "Long"],
};

/** Busca una columna sin distinguir mayúsculas, acentos ni signos. */
function leer(fila: Fila, nombres: string[]): unknown {
  for (const nombre of nombres) if (fila[nombre] !== undefined) return fila[nombre];
  const buscados = new Set(nombres.map(normCampo));
  for (const clave of Object.keys(fila)) if (buscados.has(normCampo(clave))) return fila[clave];
  return undefined;
}

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim());
const texto = (v: unknown) => (vacio(v) ? null : repararCodificacion(String(v)).trim());

export type ResultadoFecha = { fecha: string | null; aviso?: "fecha_mes_dia"; invalida?: boolean };

/** Acepta celda de Excel, ISO y texto con / - . o espacios, año de 2 o 4 dígitos, hora y mes en palabras. */
export function fechaFlexible(valor: unknown, hoy: Date = new Date()): ResultadoFecha {
  if (vacio(valor)) return { fecha: null };
  const acotar = (fecha: string | null): ResultadoFecha => {
    if (!fecha) return { fecha: null, invalida: true };
    const anio = Number(fecha.slice(0, 4));
    return anio < 2000 || anio > hoy.getUTCFullYear() + 1 ? { fecha: null, invalida: true } : { fecha };
  };
  if (typeof valor !== "string") return acotar(importDate(valor));
  const limpio = valor.trim().toLowerCase().replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(am|pm|hs)?$/, "");
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(t.*)?$/.exec(limpio);
  const armar = (y: number, m: number, d: number) => {
    const fecha = new Date(Date.UTC(y, m - 1, d));
    if (fecha.getUTCFullYear() !== y || fecha.getUTCMonth() + 1 !== m || fecha.getUTCDate() !== d) return null;
    return fecha.toISOString().slice(0, 10);
  };
  if (iso) return acotar(armar(+iso[1], +iso[2], +iso[3]));
  const anioDe = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));
  const palabras = /^(\d{1,2})[\s/.-]*(?:de\s+)?([a-zñ]{3,})\.?[\s/.-]*(?:de\s+)?(\d{2}|\d{4})$/.exec(limpio);
  if (palabras) {
    const mes = MESES[palabras[2].slice(0, 3)];
    return mes ? acotar(armar(anioDe(palabras[3]), mes, +palabras[1])) : { fecha: null, invalida: true };
  }
  const numerica = /^(\d{1,2})[\s/.-]+(\d{1,2})[\s/.-]+(\d{2}|\d{4})$/.exec(limpio);
  if (!numerica) return { fecha: null, invalida: true };
  const [primero, segundo, anio] = [+numerica[1], +numerica[2], anioDe(numerica[3])];
  // Día y mes por defecto. Un "segundo" mayor a 12 solo puede ser mes/día.
  if (segundo > 12 && primero <= 12) {
    const resultado = acotar(armar(anio, primero, segundo));
    return resultado.fecha ? { ...resultado, aviso: "fecha_mes_dia" } : resultado;
  }
  return acotar(armar(anio, segundo, primero));
}

export function cuitValido(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((total, peso, i) => total + peso * Number(digitos[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === Number(digitos[10]);
}

export type Documento = { documento: string | null; tipo: "cuit" | "dni" | "revisar" | "ninguno" };

export function clasificarDocumento(valor: unknown): Documento {
  if (vacio(valor)) return { documento: null, tipo: "ninguno" };
  if (typeof valor === "string" && /e[+-]?\d/i.test(valor)) return { documento: null, tipo: "revisar" };
  const crudo = typeof valor === "number" ? String(Math.round(valor)) : String(valor);
  const digitos = crudo.replace(/\D/g, "");
  if (!digitos) return { documento: null, tipo: "revisar" };
  if (cuitValido(digitos)) return { documento: digitos, tipo: "cuit" };
  if (digitos.length === 7 || digitos.length === 8) return { documento: digitos, tipo: "dni" };
  return { documento: digitos, tipo: "revisar" };
}

const PROVINCIAS = new Set([
  "CABA", "CIUDAD AUTONOMA DE BUENOS AIRES", "CDAD AUTONOMA DE BUENOS AIRES", "CDAD. AUTONOMA DE BUENOS AIRES", "C.A.B.A.", "CAPITAL FEDERAL",
  "BUENOS AIRES", "BS AS", "BS. AS.", "PBA", "PROVINCIA DE BUENOS AIRES", "CATAMARCA", "CHACO", "CHUBUT", "CORDOBA", "CORRIENTES", "ENTRE RIOS",
  "FORMOSA", "JUJUY", "LA PAMPA", "LA RIOJA", "MENDOZA", "MISIONES", "NEUQUEN", "RIO NEGRO", "SALTA", "SAN JUAN", "SAN LUIS", "SANTA CRUZ",
  "SANTA FE", "SANTIAGO DEL ESTERO", "TIERRA DEL FUEGO", "TUCUMAN",
]);
const SIN_DATO = new Set(["S/D", "SD", "0", "-", "N/A", "NA"]);

/** "S/D" y "0" no son datos. */
export function limpiarSinDato(valor: unknown): string | null {
  const limpio = texto(valor);
  return limpio && !SIN_DATO.has(limpio.toUpperCase()) ? limpio : null;
}

export type Ubicacion = { provincia: string | null; ciudad: string | null; provinciaEraCiudad: boolean; ciudadInvalida: boolean };

/** Una ciudad en la columna Provincia ("CANNING") pasa a Ciudad. Un número no es una ciudad. */
export function normalizarUbicacion(provinciaCruda: unknown, ciudadCruda: unknown): Ubicacion {
  let provincia = limpiarSinDato(provinciaCruda);
  const original = texto(ciudadCruda);
  let ciudad = limpiarSinDato(ciudadCruda);
  const ciudadInvalida = Boolean(original) && (!ciudad || /^\d+$/.test(ciudad));
  if (ciudadInvalida) ciudad = null;
  let provinciaEraCiudad = false;
  if (provincia && !PROVINCIAS.has(sinAcentos(provincia))) {
    provinciaEraCiudad = true;
    ciudad = ciudad || provincia;
    provincia = null;
  }
  return { provincia, ciudad, provinciaEraCiudad, ciudadInvalida };
}

export const esNotaCredito = (ticket: unknown, letra: unknown) =>
  /^NC/i.test(String(ticket ?? "").trim()) || String(letra ?? "").trim().toUpperCase() === "NC";

export const MOTIVOS_RECHAZO = {
  sin_ticket: "Sin número de comprobante",
  fecha_invalida: "Fecha sin sentido o ilegible",
  sin_fecha: "Sin fecha y sin otra línea del comprobante que la tenga",
  sin_cliente: "Sin CUIT, razón social ni nombre de fantasía",
  cliente_no_conciliado: "Nota de crédito de un cliente que no se pudo identificar",
  sin_importe: "Nota de crédito sin importe",
} as const;
export type MotivoRechazo = keyof typeof MOTIVOS_RECHAZO;

export const AVISOS = {
  fecha_heredada: "Fecha vacía: se tomó de otra línea del comprobante",
  fecha_mes_dia: "Fecha leída como mes/día",
  documento_revisar: "CUIT o DNI para revisar",
  sin_vendedor: "Sin vendedor: no se asigna automático",
  cantidad_desconocida: "Cantidad desconocida: no cuenta para cajas",
  importe_desconocido: "Importe desconocido: no se toma como $0",
  sin_codigo_producto: "Sin código de producto",
  provincia_era_ciudad: "La provincia traía una ciudad: se pasó a Ciudad",
  ciudad_invalida: "Ciudad inválida: quedó vacía",
  coordenadas_descartadas: "Coordenadas fuera de Argentina: se descartaron",
  texto_perdido: "Texto con caracteres perdidos en el archivo",
  filas_identicas: "Líneas idénticas: se conservan",
} as const;
export type TipoAviso = keyof typeof AVISOS;

export type FilaRechazada = { indice: number; fila: number; motivo: MotivoRechazo; datos: Fila };
export type ResumenAviso = { tipo: TipoAviso; texto: string; cantidad: number; filas: number[] };

export type Revision = {
  total: number;
  columnasFaltantes: string[];
  rechazadas: FilaRechazada[];
  avisos: ResumenAviso[];
  fechas: (string | null)[];
  cantidades: (number | null)[];
  documentos: Documento[];
  notasCredito: boolean[];
  ubicaciones: Ubicacion[];
  pctRechazadas: number;
  frenar: boolean;
};

const MAX_FILAS_POR_AVISO = 20;

export function revisarVentas(filas: Fila[], hoy: Date = new Date()): Revision {
  const contador = new Map<TipoAviso, { cantidad: number; filas: number[] }>();
  const avisar = (tipo: TipoAviso, numero: number) => {
    const actual = contador.get(tipo) || { cantidad: 0, filas: [] };
    actual.cantidad += 1;
    if (actual.filas.length < MAX_FILAS_POR_AVISO) actual.filas.push(numero);
    contador.set(tipo, actual);
  };

  const columnas = filas[0] ? filas[0] : {};
  const columnasFaltantes: string[] = [];
  const tiene = (nombres: string[]) => {
    const buscados = new Set(nombres.map(normCampo));
    return filas.slice(0, 50).some((f) => Object.keys(f).some((c) => buscados.has(normCampo(c))));
  };
  if (Object.keys(columnas).length) {
    if (!tiene(CAMPOS.ticket)) columnasFaltantes.push("Ticket");
    if (!tiene(CAMPOS.fecha)) columnasFaltantes.push("Fecha Emisión");
    if (!tiene(CAMPOS.documento) && !tiene(CAMPOS.razon) && !tiene(CAMPOS.fantasia)) columnasFaltantes.push("CUIT / DNI o Razón Social");
  }

  // Una línea sin fecha la hereda de otra del mismo comprobante.
  const fechaPorTicket = new Map<string, string>();
  const lecturas = filas.map((fila) => {
    const ticket = texto(leer(fila, CAMPOS.ticket));
    const fecha = fechaFlexible(leer(fila, CAMPOS.fecha), hoy);
    if (ticket && fecha.fecha && !fechaPorTicket.has(ticket)) fechaPorTicket.set(ticket, fecha.fecha);
    return { ticket, fecha };
  });

  const rechazadas: FilaRechazada[] = [];
  const fechas: (string | null)[] = [];
  const cantidades: (number | null)[] = [];
  const documentos: Documento[] = [];
  const notasCredito: boolean[] = [];
  const ubicaciones: Ubicacion[] = [];
  const hayImportes = filas.some((f) => currencyNumber(leer(f, CAMPOS.importe)) !== null);
  const vistas = new Set<string>();

  filas.forEach((fila, indice) => {
    const numero = typeof fila.__fila_excel === "number" ? fila.__fila_excel : indice + 2;
    const { ticket, fecha } = lecturas[indice];
    const documento = clasificarDocumento(leer(fila, CAMPOS.documento));
    const razon = texto(leer(fila, CAMPOS.razon));
    const fantasia = texto(leer(fila, CAMPOS.fantasia));
    const nc = esNotaCredito(ticket, leer(fila, CAMPOS.letra));
    const ubicacion = normalizarUbicacion(leer(fila, CAMPOS.provincia), leer(fila, CAMPOS.ciudad));
    documentos.push(documento);
    notasCredito.push(nc);
    ubicaciones.push(ubicacion);

    let fechaFinal = fecha.fecha;
    let motivo: MotivoRechazo | null = null;
    if (!ticket) motivo = "sin_ticket";
    else if (fecha.invalida) motivo = "fecha_invalida";
    else if (!fechaFinal) {
      fechaFinal = fechaPorTicket.get(ticket) ?? null;
      if (!fechaFinal) motivo = "sin_fecha";
    }
    if (!motivo && !documento.documento && !razon && !fantasia) motivo = "sin_cliente";
    fechas.push(fechaFinal);

    const cruda = currencyNumber(leer(fila, CAMPOS.cantidad));
    const cantidadValida = cruda !== null && Number.isInteger(cruda) && (nc || cruda >= 0);
    cantidades.push(cantidadValida ? cruda : null);

    if (motivo) {
      rechazadas.push({ indice, fila: numero, motivo, datos: fila });
      return;
    }
    if (!fecha.fecha) avisar("fecha_heredada", numero);
    if (fecha.aviso) avisar(fecha.aviso, numero);
    if (documento.tipo === "revisar") avisar("documento_revisar", numero);
    if (vacio(leer(fila, CAMPOS.vendedor))) avisar("sin_vendedor", numero);
    if (!cantidadValida) avisar("cantidad_desconocida", numero);
    if (hayImportes && currencyNumber(leer(fila, CAMPOS.importe)) === null) avisar("importe_desconocido", numero);
    if (vacio(leer(fila, CAMPOS.producto))) avisar("sin_codigo_producto", numero);
    if (ubicacion.provinciaEraCiudad) avisar("provincia_era_ciudad", numero);
    if (ubicacion.ciudadInvalida) avisar("ciudad_invalida", numero);

    const lat = coordinateNumber(leer(fila, CAMPOS.latitud));
    const lng = coordinateNumber(leer(fila, CAMPOS.longitud));
    if (lat !== null && lng !== null && !(lat >= -56 && lat <= -21 && lng >= -74 && lng <= -53)) avisar("coordenadas_descartadas", numero);

    if ([razon, fantasia].some((t) => t?.includes("�"))) avisar("texto_perdido", numero);

    const { __fila_excel: _numero, ...contenido } = fila;
    const huella = JSON.stringify(contenido);
    if (vistas.has(huella)) avisar("filas_identicas", numero);
    vistas.add(huella);
  });

  const pctRechazadas = filas.length ? Math.round((rechazadas.length / filas.length) * 1000) / 10 : 0;
  return {
    total: filas.length,
    columnasFaltantes,
    rechazadas,
    avisos: [...contador.entries()].map(([tipo, datos]) => ({ tipo, texto: AVISOS[tipo], ...datos })),
    fechas,
    cantidades,
    documentos,
    notasCredito,
    ubicaciones,
    pctRechazadas,
    frenar: columnasFaltantes.length > 0 || pctRechazadas > UMBRAL_RECHAZO_PCT,
  };
}

export function mensajeFreno(revision: Revision): string {
  if (revision.columnasFaltantes.length) {
    return `Falta una columna indispensable: ${revision.columnasFaltantes.join(", ")}. No se modificó nada.`;
  }
  return `Se rechazarían ${revision.rechazadas.length} de ${revision.total} filas (${revision.pctRechazadas}%), más del ${UMBRAL_RECHAZO_PCT}% permitido. Suele indicar columnas mal leídas. No se modificó nada.`;
}
