import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { isAssignorLike, canViewSalesDashboard } from "@/lib/roles";
import AppNav from "@/components/AppNav";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X, Eye, MapPin, AlertTriangle, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import cupraLogo from "@/assets/cupra-logo-new.png";
import { parseImportWorkbook, type ImportSheet, descargarFilasRechazadas } from "@/lib/excelImport";
import { formatMonto, toTitleCase } from "@/lib/format";
import { cargarFechaCorte } from "@/lib/fechaCorte";
import { MOTIVOS_RECHAZO, mensajeFreno, revisarVentas, type ResumenAviso } from "../../supabase/functions/_shared/etl/ventas";

type Step = "upload" | "preview" | "processing" | "done";
type FileKind = "ventas" | "maestro" | "prospectos";
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type SpreadsheetRow = Record<string, unknown>;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Error inesperado";

interface MaestroResults {
  clientes_nuevos: number;
  clientes_actualizados: number;
  clientes_errores: number;
  coordenadas_actualizadas: number;
  sin_vendedor: number;
  sin_resolver: number;
  errores: string[];
}

interface ProspectosResults {
  filas_recibidas: number;
  prospectos_cargados: number;
  duplicados_en_archivo: number;
  geocodificados: number;
  sin_coordenadas: number;
  ya_son_clientes: number;
  errores: string[];
}




interface ProcessResults {
  ventas_procesadas: number;
  ventas_errores: number;
  clientes_actualizados: number;
  clientes_errores: number;
  errores: string[];
}

interface QualityReport {
  pct_sin_barrio: number;
  pct_sin_vendedor: number;
  pct_sin_client_id: number;
  clientes_sin_barrio: number;
  clientes_sin_vendedor: number;
  alerta: boolean;
}

interface VendedorBreakdown {
  vendedor: string;
  monto: number;
  registros: number;
}

interface Reconciliacion {
  filas_excel: number;
  filas_excel_recibidas?: number;
  filas_excel_notas_credito?: number;
  notas_credito_aplicadas?: number;
  notas_credito_sin_match?: number;
  notas_credito_duplicadas?: number;
  sin_importes?: boolean;
  importes_conservados?: number;
  filas_sin_importe?: number;
  notas_credito_sin_importe?: number;
  monto_notas_credito?: number;
  filas_procesadas: number;
  filas_deduplicadas: number;
  renglones_con_ordinal?: number;
  filas_bonificadas_100?: number;
  cajas_bonificadas_100?: number;
  filas_venta_insertadas?: number;
  filas_nota_credito_insertadas?: number;
  filas_descartadas_total?: number;
  filas_descartadas_por_motivo?: Record<string, number>;
  filas_descartadas_sin_id: number;
  facturacion_total_procesada: number;
  tickets_unicos: number;
  clientes_unicos: number;
  clientes_razon_social?: number;
  tickets_compartidos: number;
  vendedor_breakdown?: VendedorBreakdown[];
  rango?: RangoCarga | null;
}

interface RangoCarga {
  modo?: string;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  base_desde?: string | null;
  base_hasta?: string | null;
  base_filas?: number;
  base_vacia?: boolean;
  filas_rango_base?: number;
  filas_a_eliminar?: number;
  pct_eliminacion?: number;
  clientes_archivo?: number;
  clientes_match?: number;
  pct_match_clientes?: number;
  filas_insertadas?: number;
  filas_actualizadas?: number;
  filas_eliminadas?: number;
  requiere_confirmacion?: boolean;
  archivo_ajeno?: boolean;
}



interface ETLMetadata {
  fecha_carga: string;
  version_etl: string;
  columna_facturacion: string | null;
  columnas_evaluadas: string[];
  filas_origen: number;
  filas_facturacion_null: number;
}

interface Integridad {
  descartados_sin_client_id: { cuit_dni: string | null; razon_social: string | null }[];
  total_descartados: number;
}

interface GeocodeResults {
  total: number;
  geocoded: number;
  errors: number;
  skipped: number;
  error_details: string[];
  reverse?: {
    total: number;
    resueltos: number;
    errores: number;
  };
  pendientes_barrio?: number;
}

const CargaDatos = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [availableSheets, setAvailableSheets] = useState<ImportSheet[]>([]);
  const [ignoredSheets, setIgnoredSheets] = useState<string[]>([]);
  const [sheetsReviewed, setSheetsReviewed] = useState(true);
  const [creditSheet, setCreditSheet] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const processing = useRef(false);
  const parsingVersion = useRef(0);
  const stopGeocoding = useRef(false);
  const [geocodeProgress, setGeocodeProgress] = useState(0);
  const [rows, setRows] = useState<SpreadsheetRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [results, setResults] = useState<ProcessResults | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);

  // Detección automática de archivo (ventas vs maestro de clientes)
  const [fileKind, setFileKind] = useState<FileKind>("ventas");
  const [sheetName, setSheetName] = useState<string>("");
  const [headerRow, setHeaderRow] = useState<number>(1);
  const [notasCredito, setNotasCredito] = useState<SpreadsheetRow[]>([]);
  const [maestroResults, setMaestroResults] = useState<MaestroResults | null>(null);
  const [maestroVendedores, setMaestroVendedores] = useState<{ vendedor: string; clientes: number }[]>([]);
  const [conciliacionEntidades, setConciliacionEntidades] = useState<{
    razones_sociales: number;
    clientes_unicos: number;
    fusionados_por_identidad: number;
  } | null>(null);
  const [prospectosResults, setProspectosResults] = useState<ProspectosResults | null>(null);
  const [geocodificarProspectos, setGeocodificarProspectos] = useState(true);


  // TAREA 7, 9, 10: Extended ETL response
  const [calidad, setCalidad] = useState<QualityReport | null>(null);
  const [reconciliacion, setReconciliacion] = useState<Reconciliacion | null>(null);
  const [guardaCarga, setGuardaCarga] = useState<{ mensaje: string; previa: RangoCarga | null } | null>(null);
  const [revirtiendo, setRevirtiendo] = useState(false);

  const [metadata, setMetadata] = useState<ETLMetadata | null>(null);
  const [integridad, setIntegridad] = useState<Integridad | null>(null);

  // Geocoding state
  const [pendingGeocount, setPendingGeocount] = useState<number | null>(null);
  const [totalClientes, setTotalClientes] = useState<number | null>(null);
  const [validacion, setValidacion] = useState<{
    filas_rechazadas: number;
    pct_rechazadas: number;
    rechazadas: { fila: number; texto: string; datos: Record<string, unknown> }[];
    avisos: ResumenAviso[];
    vendedores_sin_usuario: string[];
    clientes_sin_coordenadas: number;
    posibles_duplicados?: { nombre: string; clientes: { client_id: string; documento: string | null }[] }[];
    clientes_varios_locales?: number;
    clientes_con_otros_nombres?: number;
  } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeType, setGeocodeType] = useState<"clientes" | "prospectos">("clientes");
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResults | null>(null);

  useEffect(() => () => { stopGeocoding.current = true; parsingVersion.current++; }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) navigate("/auth");
    });
  }, [navigate]);

  useEffect(() => {
    if (session?.user) {
      supabase.from("profiles").select("*").eq("user_id", session.user.id).single()
        .then(({ data }) => {
          if (!isAssignorLike(data?.rol)) { navigate("/"); return; }
          setProfile(data);
        });
    }
  }, [session, navigate]);

  // Se revisa antes de cargar, con las mismas reglas que aplica la función.
  const revisionPrevia = useMemo(() => (fileKind === "ventas" && rows.length ? revisarVentas(rows) : null), [fileKind, rows]);

  const fetchPendingGeocount = useCallback(async () => {
    const { data, error } = await supabase.rpc("resumen_ubicaciones" as never);
    if (error) {
      console.error("No se pudo contar clientes sin barrio:", error);
      setPendingGeocount(null);
      return;
    }
    setPendingGeocount(Number((data as { pendientes?: number } | null)?.pendientes ?? 0));
    const { count } = await supabase.from("clientes").select("client_id", { count: "exact", head: true });
    setTotalClientes(count ?? null);
  }, []);

  useEffect(() => {
    if (profile) fetchPendingGeocount();
  }, [profile, fetchPendingGeocount]);

  const chooseSheet = (sheet: ImportSheet, all = availableSheets) => {
    if (sheet.kind === "notas") return;
    setFileKind(sheet.kind); setSheetName(sheet.name); setHeaderRow(sheet.headerRow);
    setRows(sheet.rows); setColumns(sheet.columns);
    const nc = all.filter(s => s.kind === "notas");
    const chosen = sheet.kind === "ventas" && nc.length === 1 ? nc[0] : null;
    setCreditSheet(chosen?.name || ""); setNotasCredito(chosen?.rows || []);
    requestId.current = crypto.randomUUID();
    setSheetsReviewed(all.length <= 1);
  };

  const parseExcel = async (f: File) => {
    const version = ++parsingVersion.current;
    setRows([]); setColumns([]); setFile(null); setStep("upload");
    try {
      if (!/\.xlsx?$/i.test(f.name)) throw new Error("Solo se admiten archivos .xlsx o .xls");
      if (f.size > 15 * 1024 * 1024) throw new Error("El límite de carga es 15 MB.");
      const buffer = await f.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const parsed = parseImportWorkbook(buffer);
      if (version !== parsingVersion.current) return;
      setAvailableSheets(parsed.sheets); setIgnoredSheets(parsed.ignored);
      const chosen = parsed.sheets.find(s => s.kind === "ventas") || parsed.sheets.find(s => s.kind !== "notas")!;
      chooseSheet(chosen, parsed.sheets);
      setFile(f); setFileHash([...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join(""));
      setStep("preview");
    } catch (error) {
      if (version === parsingVersion.current) toast({ title: "No se pudo leer el archivo", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parseExcel(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && (/\.xlsx?$/i.test(f.name))) parseExcel(f);
    else toast({ title: "Formato inválido", description: "Solo archivos .xlsx o .xls", variant: "destructive" });
  };

  const handleProcess = async (opts?: { confirmarEliminaciones?: boolean }) => {
    if (processing.current || !sheetsReviewed || !rows.length) return;
    processing.current = true;
    setStep("processing");
    setProgress(10);
    setGuardaCarga(null);
    try {
      setProgress(30);
      const fileMetadata = {
        name: file?.name,
        size: file?.size,
        lastModified: file?.lastModified,
        sha256: fileHash,
        sheetName,
        headerRow,
      };

      if (fileKind === "prospectos") {
        const { data, error } = await supabase.functions.invoke("process-prospectos-excel", {
          body: { rows, fileMetadata, requestId: requestId.current },
        });
        setProgress(90);
        if (error) { const details = await error.context?.json?.().catch(() => null); throw new Error(details?.error || error.message || "Error al procesar"); }
        if (!data?.success) throw new Error(data?.error || "Error desconocido");
        setProspectosResults(data.results);
        setBatchId(data.batch_id || null);
        setProgress(100);
        setStep("done");
        toast({
          title: "Prospectos cargados",
          description: `${data.results.prospectos_cargados} nuevos · ${data.results.prospectos_existentes || 0} ya existentes`,
        });
        if (geocodificarProspectos) await handleBatchGeocode("prospectos", data.batch_id);
        return;
      }

      if (fileKind === "maestro") {
        const { data, error } = await supabase.functions.invoke("process-clientes-maestro", {
          body: { rows, fileMetadata, requestId: requestId.current },
        });
        setProgress(90);
        if (error) { const details = await error.context?.json?.().catch(() => null); throw new Error(details?.error || error.message || "Error al procesar"); }
        if (!data?.success) throw new Error(data?.error || "Error desconocido");
        setMaestroResults(data.results);
        setMaestroVendedores(data.vendedor_breakdown || []);
        setConciliacionEntidades(data.conciliacion_entidades || null);
        setBatchId(data.batch_id || null);
        setProgress(100);
        setStep("done");
        toast({
          title: "Maestro de clientes actualizado",
          description: `${data.results.clientes_nuevos} nuevos · ${data.results.clientes_actualizados} actualizados`,
        });
        fetchPendingGeocount();
        return;
      }

      const { data, error } = await supabase.functions.invoke("process-ventas-excel", {
        body: {
          rows,
          requestId: requestId.current,
          replaceExisting,
          notasCredito: notasCredito.length ? notasCredito : undefined,
          fileMetadata,
          modoCarga: "rango",
          confirmarEliminaciones: opts?.confirmarEliminaciones === true,
        },
      });
      if (error) {
        // La función devuelve el detalle de la guarda en el cuerpo del 500
        let payload: any = null;
        try { payload = await (error as any)?.context?.json?.(); } catch { /* sin cuerpo */ }
        if (payload?.requiere_confirmacion) {
          setGuardaCarga({ mensaje: payload.error, previa: payload.previa || null });
          setStep("preview");
          return;
        }
        throw new Error(payload?.error || error.message || "Error al procesar");
      }

      setProgress(90);
      if (error) { const details = await error.context?.json?.().catch(() => null); throw new Error(details?.error || error.message || "Error al procesar"); }
      if (!data?.success) throw new Error(data?.error || "Error desconocido");
      setResults(data.results);
      setValidacion(data.validacion || null);
      cargarFechaCorte();
      setBatchId(data.batch_id || null);
      // TAREA 7, 9, 10: Guardar datos extendidos
      if (data.calidad) setCalidad(data.calidad);
      if (data.reconciliacion) setReconciliacion(data.reconciliacion);
      if (data.metadata) setMetadata(data.metadata);
      if (data.integridad) setIntegridad(data.integridad);
      setProgress(100);
      setStep("done");
      toast({ title: "Carga completada", description: `${data.results.ventas_procesadas} ventas y ${data.results.clientes_actualizados} clientes procesados` });
      fetchPendingGeocount();
    } catch (err: unknown) {
      toast({ title: "Error en la carga", description: getErrorMessage(err), variant: "destructive" });
      setStep("preview");
    } finally { processing.current = false; }
  };

  const handleRevertirCarga = async () => {
    if (!batchId) return;
    setRevirtiendo(true);
    try {
      const { data, error } = await supabase.rpc("revertir_import_ventas" as never, { p_batch_id: batchId } as never);
      if (error) throw new Error(error.message);
      const res = (data || {}) as { filas_borradas?: number; filas_restauradas?: number };
      toast({
        title: "Carga revertida",
        description: `${res.filas_borradas ?? 0} filas quitadas · ${res.filas_restauradas ?? 0} restauradas`,
      });
      setBatchId(null);
    } catch (err: unknown) {
      toast({ title: "No se pudo revertir", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setRevirtiendo(false);
    }
  };


  const handleBatchGeocode = async (tipo: "clientes" | "prospectos" = "clientes", importBatch?: string) => {
    setIsGeocoding(true); setGeocodeType(tipo); setGeocodeResults(null); setGeocodeProgress(0); stopGeocoding.current = false;
    let cursor = "";
    const total: GeocodeResults = { total: 0, geocoded: 0, errors: 0, skipped: 0, error_details: [], reverse: { total: 0, resueltos: 0, errores: 0 } };
    try {
      do {
        const { data, error } = await supabase.functions.invoke("geocode-clients", { body: { tipo, after: cursor, batch_id: importBatch } });
        if (error || !data?.success) throw new Error(data?.error || error?.message || "No se pudo completar la ubicación");
        for (const key of ["total", "geocoded", "errors", "skipped"] as const) total[key] += data.results[key] || 0;
        total.error_details.push(...data.results.error_details || []);
        total.reverse!.total += data.reverse?.total || 0; total.reverse!.resueltos += data.reverse?.resueltos || 0;
        total.reverse!.errores += data.reverse?.errores || 0;
        total.pendientes_barrio = data.pendientes_barrio;
        setGeocodeProgress(total.total); setGeocodeResults({ ...total, error_details: [...total.error_details] });
        if (!data.next_cursor || data.next_cursor === cursor) break;
        cursor = data.next_cursor;
        if (data.service_error) throw new Error(data.service_error);
      } while (!stopGeocoding.current);
      toast({ title: stopGeocoding.current ? "Ubicación detenida" : "Ubicaciones procesadas", description: `${total.geocoded} resueltas · ${total.errors} requieren revisión` });
    } catch (error) {
      toast({ title: "Quedaron ubicaciones pendientes", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      if (tipo === "prospectos") setProspectosResults(previous => previous ? {
        ...previous, geocodificados: previous.geocodificados + total.geocoded,
        sin_coordenadas: Math.max(0, previous.sin_coordenadas - total.geocoded),
      } : previous);
      setIsGeocoding(false); fetchPendingGeocount();
    }
  };

  const reset = () => {
    parsingVersion.current++;
    requestId.current = crypto.randomUUID();
    setAvailableSheets([]); setIgnoredSheets([]); setCreditSheet("");
    setStep("upload");
    setFile(null);
    setFileHash(null);
    setBatchId(null);
    setRows([]);
    setColumns([]);
    setResults(null);
    setCalidad(null);
    setReconciliacion(null);
    setGuardaCarga(null);

    setConciliacionEntidades(null);
    setMetadata(null);
    setIntegridad(null);
    setNotasCredito([]);
    setMaestroResults(null);
    setMaestroVendedores([]);
    setProspectosResults(null);
    setSheetName("");
    setHeaderRow(1);
    setFileKind("ventas");
    setProgress(0);

  };

  const formatCurrency = (amount: number) => formatMonto(amount);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNav />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-sans text-foreground tracking-tight">
            Carga de Datos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Subí el archivo de <strong>ventas</strong>, el <strong>maestro de clientes</strong> o una planilla de{" "}
            <strong>prospectos</strong>. El sistema detecta automáticamente el tipo, la hoja y la fila de encabezados.
          </p>
        </div>


        {/* STEP: Upload */}
        {isGeocoding && <Alert className="mb-4"><AlertDescription>Ubicando registros: {geocodeProgress} revisados. Los datos del Excel ya están guardados. <Button variant="outline" size="sm" onClick={() => { stopGeocoding.current = true; }}>Detener al terminar este bloque</Button></AlertDescription></Alert>}
        {step === "upload" && (
          <Card>
            <CardContent className="p-8">
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                  isDragging ? "border-primary bg-primary/5" : "border-border/60 hover:border-border"
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground mb-1">Arrastrá el archivo Excel aquí</p>
                <p className="text-xs text-muted-foreground mb-4">Formatos soportados: .xlsx, .xls</p>
                <label>
                  <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
                  <Button variant="outline" size="sm" asChild>
                    <span className="cursor-pointer">
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      Seleccionar archivo
                    </span>
                  </Button>
                </label>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP: Preview */}
        {step === "preview" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-sans">{file?.name}</CardTitle>
                      <Badge variant={fileKind === "ventas" ? "default" : "outline"} className="text-[10px]">
                        {fileKind === "maestro" ? "Maestro de clientes" : fileKind === "prospectos" ? "Prospectos" : "Ventas"}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs mt-0.5">
                      Hoja "{sheetName}" · encabezados en fila {headerRow} · {rows.length.toLocaleString()} filas · {columns.length} columnas
                      {notasCredito.length > 0 && ` · ${notasCredito.length.toLocaleString()} notas de crédito`}
                    </CardDescription>
                  </div>

                  <Button variant="ghost" size="icon" onClick={reset} disabled={isGeocoding} className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 mb-4">
                  <label className="text-sm">Hoja a importar
                    <select aria-label="Hoja a importar" className="block w-full border rounded p-2 bg-background mt-1" value={sheetName}
                      onChange={e => chooseSheet(availableSheets.find(s => s.name === e.target.value)!)}>
                      {availableSheets.filter(s => s.kind !== "notas").map(s => <option key={s.name} value={s.name}>{s.name} · {s.kind} · {s.rows.length} filas</option>)}
                    </select>
                  </label>
                  {fileKind === "ventas" && availableSheets.some(s => s.kind === "notas") && <label className="text-sm">Notas de crédito que acompañan esta carga
                    <select aria-label="Hoja de notas de crédito" className="block w-full border rounded p-2 bg-background mt-1" value={creditSheet} onChange={e => {
                      setCreditSheet(e.target.value); setNotasCredito(availableSheets.find(s => s.name === e.target.value)?.rows || []);
                      requestId.current = crypto.randomUUID(); setSheetsReviewed(false);
                    }}><option value="">No incluir una hoja de notas de crédito</option>{availableSheets.filter(s => s.kind === "notas").map(s => <option key={s.name} value={s.name}>{s.name} · {s.rows.length} filas</option>)}</select>
                  </label>}
                  {ignoredSheets.length > 0 && <p className="text-xs text-muted-foreground">Hojas no reconocidas o vacías: {ignoredSheets.join(", ")}.</p>}
                  {availableSheets.length > 1 && <label className="flex items-center gap-2 text-sm"><Checkbox checked={sheetsReviewed} onCheckedChange={v => setSheetsReviewed(v === true)} />Confirmo las hojas seleccionadas. Las demás hojas no se importan.</label>}
                </div>
                <div className="mb-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Eye className="h-3 w-3" /> Columnas detectadas
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {columns.map((col) => (
                      <Badge key={col} variant="secondary" className="text-xs font-normal">{col}</Badge>
                    ))}
                  </div>
                </div>
                <div className="border border-border/60 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/30">
                          {columns.slice(0, 8).map((col) => (
                            <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                          ))}
                          {columns.length > 8 && (
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">+{columns.length - 8} más</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {rows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="hover:bg-muted/20">
                            {columns.slice(0, 8).map((col) => (
                              <td key={col} className="px-3 py-1.5 whitespace-nowrap text-foreground/80 max-w-[160px] truncate">
                                {row[col] !== null && row[col] !== undefined ? String(row[col]) : "—"}
                              </td>
                            ))}
                            {columns.length > 8 && <td className="px-3 py-1.5 text-muted-foreground">…</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rows.length > 5 && (
                    <div className="px-3 py-1.5 bg-muted/20 text-xs text-muted-foreground text-center">
                      Mostrando 5 de {rows.length.toLocaleString()} filas
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            {revisionPrevia && (
              <div className={`rounded-lg border p-3 text-xs space-y-1.5 ${revisionPrevia.frenar ? "border-destructive/40 bg-destructive/10" : "border-border bg-muted/30"}`}>
                {revisionPrevia.frenar ? (
                  <p className="font-medium text-destructive">{mensajeFreno(revisionPrevia)}</p>
                ) : (
                  <p className="font-medium text-foreground">
                    Se cargarán {(revisionPrevia.total - revisionPrevia.rechazadas.length).toLocaleString()} de {revisionPrevia.total.toLocaleString()} filas.
                    {revisionPrevia.rechazadas.length > 0 && ` ${revisionPrevia.rechazadas.length} se rechazan y vas a poder descargarlas.`}
                  </p>
                )}
                {Object.entries(revisionPrevia.rechazadas.reduce<Record<string, number>>((acc, r) => { acc[r.motivo] = (acc[r.motivo] || 0) + 1; return acc; }, {})).map(([motivo, cantidad]) => (
                  <p key={motivo} className="text-destructive">Rechazo · {MOTIVOS_RECHAZO[motivo as keyof typeof MOTIVOS_RECHAZO]}: {cantidad.toLocaleString()}</p>
                ))}
                {revisionPrevia.avisos.map((a) => (
                  <p key={a.tipo} className="text-muted-foreground">Aviso · {a.texto}: {a.cantidad.toLocaleString()}</p>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {fileKind === "ventas" ? (
                  <>
                    <Checkbox
                      id="replaceExisting"
                      checked={replaceExisting}
                      onCheckedChange={(checked) => { setReplaceExisting(checked === true); requestId.current = crypto.randomUUID(); }}
                    />
                    <label htmlFor="replaceExisting" className="text-sm text-muted-foreground cursor-pointer">
                      Reemplazar las ventas del período del archivo{" "}
                      <span className="text-xs">
                        Desmarcado: agrega o actualiza comprobantes y conserva los demás. Siempre se validan todas las filas antes de guardar.
                      </span>
                    </label>
                  </>
                ) : fileKind === "prospectos" ? (
                  <div className="flex items-start gap-2 max-w-md">
                    <Checkbox
                      id="geoProspectos"
                      checked={geocodificarProspectos}
                      onCheckedChange={(checked) => setGeocodificarProspectos(checked === true)}
                    />
                    <label htmlFor="geoProspectos" className="text-xs text-muted-foreground cursor-pointer">
                      Geolocalizar direcciones con Google Maps (recomendado).
                      Los prospectos se agregan al pool de visitas; si el CUIT ya es cliente, se marcan como tal y no se duplican.
                    </label>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground max-w-md">
                    El maestro actualiza cartera, contacto, categorías, vendedor asignado y coordenadas.
                    No modifica el histórico de ventas ni el feedback de los vendedores.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={reset} disabled={isGeocoding}>Cancelar</Button>
                <Button onClick={() => handleProcess()} disabled={!sheetsReviewed || !rows.length || Boolean(revisionPrevia?.frenar)}>
                  <Upload className="h-4 w-4 mr-1.5" />
                  Procesar {rows.length.toLocaleString()} filas
                </Button>
              </div>
            </div>

            <AlertDialog open={Boolean(guardaCarga)} onOpenChange={(open) => { if (!open) setGuardaCarga(null); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Esta carga requiere tu aprobación
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-4 text-left">
                      <p>{guardaCarga?.mensaje}</p>
                      {guardaCarga?.previa && (
                        <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 text-xs">
                          <div>
                            <p className="text-muted-foreground">Período del archivo</p>
                            <p className="font-semibold text-foreground">{guardaCarga.previa.fecha_desde} → {guardaCarga.previa.fecha_hasta}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Filas actuales del período</p>
                            <p className="font-semibold text-foreground">{(guardaCarga.previa.filas_rango_base ?? 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Filas que se eliminarán</p>
                            <p className="font-semibold text-destructive">{(guardaCarga.previa.filas_a_eliminar ?? 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Porcentaje</p>
                            <p className="font-semibold text-destructive">{guardaCarga.previa.pct_eliminacion ?? 0}%</p>
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">Si aprobás, se reemplaza únicamente este período. El resto del historial no se modifica.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setGuardaCarga(null)}>No, cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleProcess({ confirmarEliminaciones: true })}>
                    Sí, aprobar y continuar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

          </div>

        )}

        {/* STEP: Processing */}
        {step === "processing" && (
          <Card>
            <CardContent className="p-8">
              <div className="text-center space-y-4">
                <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {fileKind === "maestro"
                      ? "Procesando maestro de clientes…"
                      : fileKind === "prospectos"
                        ? "Cargando prospectos y geolocalizando direcciones…"
                        : "Procesando ventas…"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Normalizando datos, calculando métricas y actualizando base de datos</p>
                </div>
                <Progress value={progress} className="max-w-xs mx-auto" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP: Done — Prospectos */}
        {step === "done" && prospectosResults && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
                  <p className="text-lg font-semibold text-foreground">Prospectos cargados</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Prospectos cargados", value: prospectosResults.prospectos_cargados },
                    { label: "Con coordenadas", value: prospectosResults.geocodificados },
                    { label: "Sin coordenadas", value: prospectosResults.sin_coordenadas },
                    { label: "Ya son clientes", value: prospectosResults.ya_son_clientes },
                  ].map((m) => (
                    <div key={m.label} className="text-center p-3 rounded-lg bg-muted/20">
                      <p className="text-xl font-semibold text-foreground">{m.value.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>
                {prospectosResults.errores.length > 0 && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <p className="font-medium mb-1">{prospectosResults.errores.length} filas con problemas</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {prospectosResults.errores.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                {geocodeType === "prospectos" && geocodeResults && geocodeResults.errors > 0 && <Alert className="mt-4">
                  <AlertDescription>
                    <p>{geocodeResults.errors} prospectos requieren revisar su dirección.</p>
                    <ul className="mt-2 list-disc pl-4 text-xs">{geocodeResults.error_details.slice(0, 5).map((message, index) => <li key={index}>{message}</li>)}</ul>
                    {batchId && <Button className="mt-3" variant="outline" disabled={isGeocoding} onClick={() => handleBatchGeocode("prospectos", batchId)}>Reintentar ubicaciones del lote</Button>}
                  </AlertDescription>
                </Alert>}
                <div className="flex justify-center gap-3 mt-6">
                  <Button variant="outline" onClick={reset} disabled={isGeocoding}>Cargar otro archivo</Button>
                  <Button onClick={() => navigate("/prospectos-dashboard")}>Ver prospectos</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}


        {/* STEP: Done — Maestro de clientes */}
        {step === "done" && maestroResults && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
                  <p className="text-lg font-semibold text-foreground">Maestro de clientes actualizado</p>
                  {batchId && <p className="text-xs text-muted-foreground mt-1">Lote {batchId}</p>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Clientes nuevos", value: maestroResults.clientes_nuevos },
                    { label: "Actualizados", value: maestroResults.clientes_actualizados },
                    { label: "Coordenadas", value: maestroResults.coordenadas_actualizadas },
                    { label: "Sin vendedor", value: maestroResults.sin_vendedor },
                  ].map((m) => (
                    <div key={m.label} className="text-center p-3 rounded-lg bg-muted/20">
                      <p className="text-xl font-semibold text-foreground">{m.value.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
                    </div>
                  ))}
                </div>
                {conciliacionEntidades && (
                  <p className="text-sm text-center mt-4 text-foreground">
                    {conciliacionEntidades.razones_sociales.toLocaleString()} razones sociales →{" "}
                    {conciliacionEntidades.clientes_unicos.toLocaleString()} clientes
                    {conciliacionEntidades.fusionados_por_identidad > 0
                      ? ` (${conciliacionEntidades.fusionados_por_identidad} fusionados por identidad)`
                      : " (sin fusiones)"}
                  </p>
                )}
                {(maestroResults.clientes_errores > 0 || maestroResults.sin_resolver > 0) && (
                  <p className="text-xs text-muted-foreground mt-4 text-center">
                    {maestroResults.clientes_errores} errores · {maestroResults.sin_resolver} filas sin identificador resoluble
                  </p>
                )}
              </CardContent>
            </Card>

            {maestroVendedores.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-sans">Cartera por vendedor</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {maestroVendedores.map((v) => (
                      <div key={v.vendedor} className="flex justify-between text-sm">
                        <span className="text-foreground/80">{toTitleCase(v.vendedor)}</span>
                        <span className="text-muted-foreground">{v.clientes.toLocaleString()} clientes</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={reset} disabled={isGeocoding}>Cargar otro archivo</Button>
              <Button onClick={() => navigate("/")}>Ir al panel</Button>
            </div>
          </div>
        )}


        {/* STEP: Done */}
        {step === "done" && results && (
          <div className="space-y-4">
            {/* Resumen principal */}
            <Card>
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
                  <p className="text-lg font-semibold text-foreground">Carga completada</p>
                  {metadata && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ETL {metadata.version_etl} · Columna: {metadata.columna_facturacion || 'No resuelta'} · {new Date(metadata.fecha_carga).toLocaleString('es-AR')}
                    </p>
                  )}
                  {batchId && <p className="text-xs text-muted-foreground mt-1">Lote {batchId}</p>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-2xl font-bold text-foreground">{results.ventas_procesadas.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Ventas procesadas</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-2xl font-bold text-foreground">{results.clientes_actualizados.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Clientes actualizados</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-2xl font-bold text-foreground">{results.ventas_errores}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Ventas con error</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-2xl font-bold text-foreground">{results.clientes_errores}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Clientes con error</p>
                  </div>
                </div>

                {results.errores.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1.5 mb-2">
                      <AlertCircle className="h-3.5 w-3.5" /> Errores encontrados
                    </p>
                    <ul className="text-xs text-destructive/80 space-y-1 max-h-32 overflow-y-auto">
                      {results.errores.map((err, i) => <li key={i}>• {err}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {validacion && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    Revisión de la carga
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {validacion.filas_rechazadas > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                      <p className="text-destructive font-medium">{validacion.filas_rechazadas.toLocaleString()} filas rechazadas ({validacion.pct_rechazadas}%). El resto se cargó.</p>
                      <Button size="sm" variant="outline" onClick={() => descargarFilasRechazadas(validacion.rechazadas)}>
                        Descargar filas rechazadas
                      </Button>
                    </div>
                  ) : (
                    <p className="text-foreground font-medium">No se rechazó ninguna fila.</p>
                  )}
                  {validacion.filas_rechazadas > 0 && (
                    <p className="text-muted-foreground">Corregilas y volvé a subir ese archivo con «Reemplazar» desmarcado: se agregan sin duplicar lo ya cargado.</p>
                  )}
                  {validacion.avisos.map((a) => (
                    <p key={a.tipo} className="text-muted-foreground">Aviso · {a.texto}: {a.cantidad.toLocaleString()}</p>
                  ))}
                  <p className="text-muted-foreground">Clientes sin coordenadas: {validacion.clientes_sin_coordenadas.toLocaleString()}</p>
                  {Boolean(validacion.clientes_varios_locales) && (
                    <p className="text-muted-foreground">Clientes con más de un local: {validacion.clientes_varios_locales}. Se guardan todos; el más usado queda como principal.</p>
                  )}
                  {Boolean(validacion.clientes_con_otros_nombres) && (
                    <p className="text-muted-foreground">Clientes que aparecen con otro nombre: {validacion.clientes_con_otros_nombres}. Se guardan los nombres para poder encontrarlos.</p>
                  )}
                  {Boolean(validacion.posibles_duplicados?.length) && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
                      <p className="font-medium text-foreground">Posibles duplicados para revisar ({validacion.posibles_duplicados!.length}). No se unieron.</p>
                      <ul className="max-h-40 overflow-y-auto space-y-0.5 text-muted-foreground">
                        {validacion.posibles_duplicados!.map((d) => (
                          <li key={d.clientes.map((c) => c.client_id).join("|")}>• {toTitleCase(d.nombre)}: {d.clientes.map((c) => c.documento || c.client_id).join(" · ")}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {validacion.vendedores_sin_usuario.length > 0 && (
                    <p className="text-muted-foreground">Vendedores sin usuario en la app: {validacion.vendedores_sin_usuario.map(toTitleCase).join(", ")}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* TAREA 9: Reconciliación */}
            {reconciliacion?.rango && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    Período reemplazado
                  </CardTitle>
                  <CardDescription className="text-xs">
                    El archivo es la verdad solo para su propio rango de fechas. Fuera de ese rango no se tocó nada.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div className="p-2.5 rounded-lg bg-muted/20">
                      <p className="text-sm font-bold text-foreground">
                        {reconciliacion.rango.fecha_desde} → {reconciliacion.rango.fecha_hasta}
                      </p>
                      <p className="text-xs text-muted-foreground">Rango del archivo</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/20">
                      <p className="text-sm font-bold text-foreground">
                        {reconciliacion.rango.base_desde || "—"} → {reconciliacion.rango.base_hasta || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">Rango en la base (antes)</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/20">
                      <p className="text-lg font-bold text-foreground">
                        {(reconciliacion.rango.filas_insertadas ?? 0).toLocaleString()} / {(reconciliacion.rango.filas_actualizadas ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Nuevas / actualizadas</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/20">
                      <p className="text-lg font-bold text-amber-500">
                        {(reconciliacion.rango.filas_eliminadas ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Anuladas dentro del rango</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clientes del archivo que coinciden con la base: {(reconciliacion.rango.clientes_match ?? 0).toLocaleString()} de{" "}
                    {(reconciliacion.rango.clientes_archivo ?? 0).toLocaleString()} ({reconciliacion.rango.clientes_archivo ? Math.round(((reconciliacion.rango.clientes_match ?? 0) / reconciliacion.rango.clientes_archivo) * 100) : 0}%)
                  </p>
                  {batchId && (
                    <Button size="sm" variant="outline" onClick={handleRevertirCarga} disabled={revirtiendo}>
                      {revirtiendo ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <X className="h-4 w-4 mr-1.5" />}
                      Revertir esta carga
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {reconciliacion && (

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    Reconciliación — Verificá contra tu Excel
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="p-2.5 rounded-lg bg-muted/20 text-center">
                      <p className="text-lg font-bold text-foreground">{reconciliacion.filas_excel.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Filas Excel</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/20 text-center">
                      <p className="text-lg font-bold text-foreground">{reconciliacion.filas_deduplicadas.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Líneas deduplicadas</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/20 text-center">
                      <p className="text-lg font-bold text-foreground">{reconciliacion.tickets_unicos.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Tickets únicos</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/20 text-center">
                      <p className="text-lg font-bold text-foreground">{(reconciliacion.clientes_razon_social ?? reconciliacion.clientes_unicos).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Clientes (razón social)</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/20 text-center">
                      <p className="text-lg font-bold text-foreground">{reconciliacion.clientes_unicos.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Clientes (por ID)</p>
                    </div>
                  </div>
                  <div className="mt-3 p-2.5 rounded-lg bg-accent/5 text-center">
                    <p className="text-xs text-muted-foreground">Facturación total procesada</p>
                    <p className="text-xl font-bold text-accent">{formatCurrency(reconciliacion.facturacion_total_procesada)}</p>
                  </div>

                  {/* Conciliación fila por fila: Excel vs base */}
                  <div className="mt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Cómo cierra el conteo</p>
                    <div className="border border-border/40 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-border/20">
                          <tr>
                            <td className="px-3 py-1.5 text-foreground/80">Filas de venta leídas del Excel</td>
                            <td className="px-3 py-1.5 text-right font-medium text-foreground">{(reconciliacion.filas_excel_recibidas ?? reconciliacion.filas_excel).toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-1.5 text-foreground/80">Notas de crédito leídas del Excel</td>
                            <td className="px-3 py-1.5 text-right font-medium text-foreground">{(reconciliacion.filas_excel_notas_credito ?? 0).toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-1.5 text-foreground/80">Ventas cargadas en la base</td>
                            <td className="px-3 py-1.5 text-right font-medium text-foreground">{(reconciliacion.filas_venta_insertadas ?? reconciliacion.filas_deduplicadas).toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-1.5 text-foreground/80">Notas de crédito cargadas (importe negativo)</td>
                            <td className="px-3 py-1.5 text-right font-medium text-foreground">{(reconciliacion.filas_nota_credito_insertadas ?? reconciliacion.notas_credito_aplicadas ?? 0).toLocaleString()}</td>
                          </tr>
                          <tr className="bg-muted/20">
                            <td className="px-3 py-1.5 font-medium text-foreground">Total de filas en la base</td>
                            <td className="px-3 py-1.5 text-right font-bold text-foreground">{reconciliacion.filas_deduplicadas.toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-1.5 text-foreground/80">Renglones bonificados al 100% (regalo)</td>
                            <td className="px-3 py-1.5 text-right font-medium text-foreground">
                              {(reconciliacion.filas_bonificadas_100 ?? 0).toLocaleString()}
                              {reconciliacion.cajas_bonificadas_100
                                ? ` (${reconciliacion.cajas_bonificadas_100.toLocaleString()} cajas)`
                                : ''}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-3 py-1.5 text-foreground/80">Filas omitidas</td>
                            <td className="px-3 py-1.5 text-right font-medium text-amber-500">{(reconciliacion.filas_descartadas_total ?? reconciliacion.filas_descartadas_sin_id).toLocaleString()}</td>
                          </tr>
                          {reconciliacion.sin_importes && (
                            <>
                              <tr>
                                <td className="px-3 py-1.5 text-foreground/80">Líneas con importe conservado</td>
                                <td className="px-3 py-1.5 text-right font-medium text-foreground">{(reconciliacion.importes_conservados ?? 0).toLocaleString()}</td>
                              </tr>
                              <tr>
                                <td className="px-3 py-1.5 text-foreground/80">Líneas sin importe (el archivo no trae precios)</td>
                                <td className="px-3 py-1.5 text-right font-medium text-amber-500">{(reconciliacion.filas_sin_importe ?? 0).toLocaleString()}</td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {reconciliacion.filas_descartadas_por_motivo && Object.keys(reconciliacion.filas_descartadas_por_motivo).length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Motivo de las filas omitidas</p>
                      <div className="border border-border/40 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-border/20">
                            {Object.entries(reconciliacion.filas_descartadas_por_motivo).map(([key, count]) => {
                              const [origen, motivo] = key.split(':');
                              const labels: Record<string, string> = {
                                sin_identidad_cliente: 'Sin cliente identificable',
                                duplicada_exacta: 'Fila duplicada exacta',
                                sin_razon_social: 'Sin razón social',
                                cliente_no_conciliado: 'Cliente no encontrado en la base',
                                sin_importe: 'Sin importe',
                              };
                              return (
                                <tr key={key}>
                                  <td className="px-3 py-1.5 text-foreground/80">
                                    {origen === 'nota_credito' ? 'Nota de crédito' : 'Venta'} — {labels[motivo] || motivo}
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-medium text-foreground">{count.toLocaleString()}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Las filas omitidas quedan guardadas 7 días con su motivo para poder revisarlas.
                      </p>
                    </div>
                  )}

                  {reconciliacion.tickets_compartidos > 0 && (
                    <p className="text-xs text-amber-500 mt-2">
                      ⚠️ {reconciliacion.tickets_compartidos} tickets compartidos entre múltiples clientes
                    </p>
                  )}

                  {/* Fix 4: Desglose por vendedor */}
                  {reconciliacion.vendedor_breakdown && reconciliacion.vendedor_breakdown.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Monto por vendedor</p>
                      <div className="border border-border/40 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/30">
                              <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Vendedor</th>
                              <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">Registros</th>
                              <th className="text-right px-3 py-1.5 text-muted-foreground font-medium">Monto</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/20">
                            {reconciliacion.vendedor_breakdown.map((vb, i) => (
                              <tr key={i} className="hover:bg-muted/10">
                                <td className="px-3 py-1.5 text-foreground">{toTitleCase(vb.vendedor)}</td>
                                <td className="px-3 py-1.5 text-right text-foreground/70">{vb.registros.toLocaleString()}</td>
                                <td className="px-3 py-1.5 text-right font-medium text-foreground">{formatCurrency(vb.monto)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* TAREA 7: Alertas de calidad */}
            {calidad && calidad.alerta && (
              <Card className="border-amber-500/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-500">
                    <AlertTriangle className="h-4 w-4" />
                    Alertas de Calidad de Datos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {calidad.pct_sin_barrio > 10 && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                          {calidad.pct_sin_barrio}%
                        </Badge>
                        <span className="text-muted-foreground">
                          clientes sin barrio asignado ({calidad.clientes_sin_barrio})
                        </span>
                      </div>
                    )}
                    {calidad.pct_sin_vendedor > 5 && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                          {calidad.pct_sin_vendedor}%
                        </Badge>
                        <span className="text-muted-foreground">
                          clientes sin vendedor ({calidad.clientes_sin_vendedor})
                        </span>
                      </div>
                    )}
                    {calidad.pct_sin_client_id > 0 && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-amber-500/30 text-amber-500">
                          {calidad.pct_sin_client_id}%
                        </Badge>
                        <span className="text-muted-foreground">
                          filas del Excel sin identificador de cliente
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* TAREA 12: Descartados sin client_id */}
            {integridad && integridad.total_descartados > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    Registros descartados ({integridad.total_descartados})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-32 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/40">
                          <th className="text-left py-1 px-2 text-muted-foreground">CUIT/DNI</th>
                          <th className="text-left py-1 px-2 text-muted-foreground">Razón Social</th>
                        </tr>
                      </thead>
                      <tbody>
                        {integridad.descartados_sin_client_id.map((d, i) => (
                          <tr key={i} className="border-b border-border/20">
                            <td className="py-1 px-2 text-foreground/70">{d.cuit_dni || '—'}</td>
                            <td className="py-1 px-2 text-foreground/70">{d.razon_social || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {integridad.total_descartados > 20 && (
                      <p className="text-xs text-muted-foreground text-center mt-1">
                        Mostrando 20 de {integridad.total_descartados}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={reset} disabled={isGeocoding}>Cargar otro archivo</Button>
              <Button onClick={() => navigate("/")}>Volver al inicio</Button>
            </div>
          </div>
        )}

        {/* ── Section 2: Batch Geocoding ── */}
        <div className="pt-4 border-t border-border/30">
          <h2 className="text-xl font-sans text-foreground tracking-tight">
            Calidad de ubicación de clientes
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Un cliente solo está listo para recomendaciones geográficas cuando tiene barrio y coordenadas válidas.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            {pendingGeocount === null ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Calculando clientes pendientes…</span>
              </div>
            ) : pendingGeocount === 0 && (!geocodeResults || geocodeType !== "clientes") ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">{totalClientes === 0 ? "Todavía no hay clientes cargados" : "Todos los clientes tienen coordenadas y barrio"}</span>
              </div>
            ) : (
              <div className="space-y-4">
                {!isGeocoding && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {pendingGeocount} cliente{pendingGeocount !== 1 ? "s" : ""} con ubicación pendiente
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Se conservan las coordenadas guardadas y se completan los datos geográficos que faltan.
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => handleBatchGeocode()} size="sm">
                      <MapPin className="h-3.5 w-3.5 mr-1.5" />
                      Completar ubicaciones
                    </Button>
                  </div>
                )}

                {isGeocoding && geocodeType === "clientes" && (
                  <div className="text-center space-y-3 py-4">
                    <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Completando barrios y ubicaciones…</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Consultando Google Maps para {pendingGeocount} clientes. No se marcarán como completos si siguen sin barrio.
                      </p>
                    </div>
                  </div>
                )}

                {geocodeResults && geocodeType === "clientes" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="text-sm font-medium text-foreground">Resultado de la geocodificación</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="text-center p-2.5 rounded-lg bg-muted/30">
                        <p className="text-xl font-bold text-foreground">{geocodeResults.total}</p>
                        <p className="text-xs text-muted-foreground">Registros revisados</p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-green-500/10">
                        <p className="text-xl font-bold text-green-600">{geocodeResults.geocoded}</p>
                        <p className="text-xs text-muted-foreground">Barrios completados</p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-destructive/10">
                        <p className="text-xl font-bold text-destructive">{geocodeResults.pendientes_barrio ?? geocodeResults.reverse?.errores ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Aún sin barrio</p>
                      </div>
                      <div className="text-center p-2.5 rounded-lg bg-muted/30">
                        <p className="text-xl font-bold text-foreground">{geocodeResults.skipped}</p>
                        <p className="text-xs text-muted-foreground">Sin dirección</p>
                      </div>
                    </div>
                    {geocodeResults.error_details.length > 0 && (
                      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                        <p className="text-xs font-medium text-destructive flex items-center gap-1.5 mb-2">
                          <AlertCircle className="h-3.5 w-3.5" /> Detalle de errores
                        </p>
                        <ul className="text-xs text-destructive/80 space-y-1 max-h-32 overflow-y-auto">
                          {geocodeResults.error_details.slice(0, 20).map((err, i) => <li key={i}>• {err}</li>)}
                          {geocodeResults.error_details.length > 20 && (
                            <li className="text-muted-foreground">…y {geocodeResults.error_details.length - 20} más</li>
                          )}
                        </ul>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => { setGeocodeResults(null); fetchPendingGeocount(); }}>
                        Verificar de nuevo
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CargaDatos;
