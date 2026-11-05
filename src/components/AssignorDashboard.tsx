import { errorRuta, VISITAS_POR_DIA } from "../../supabase/functions/_shared/ruta";
import DatosAl from "@/components/shared/DatosAl";
import { guardarAsignaciones } from "@/lib/asignaciones";
import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin, List, Plus, Calendar, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FilterPanel from "./assignor/FilterPanel";
import ResultsMap from "./assignor/ResultsMap";
import PreselectionStep from "./assignor/PreselectionStep";
import TableAssignment from "@/components/assignor/TableAssignment";
import TodayAssignments from "./assignor/TodayAssignments";
import AsignadorCalendario from "./assignor/AsignadorCalendario";

import { RecorridoAPie } from "./shared/RecorridoAPie";
import AIInsightsCard from "./assignor/AIInsightsCard";
import AssignmentsSelector from "./assignor/AssignmentsSelector";
import EditAssignmentsTable from "./assignor/EditAssignmentsTable";
import RecommendationProgress from "./assignor/RecommendationProgress";
import { Sucursal } from "@/types/sales";
import { supabase } from "@/integrations/supabase/client";
import { useRecommendationsStore } from "@/hooks/useRecommendationsStore";
import { useDraftState, useAssignmentDraftStore } from "@/hooks/useAssignmentDraft";

type FlowStep = "recommendations" | "preselection" | "assignment" | "edit-select" | "edit-kanban";

const AssignorDashboard = () => {
  const {
    flowStep, setFlowStep,
    recommendations, setRecommendations,
    selectedSucursales, setSelectedSucursales,
    toggleSucursal: toggleSucursalStore,
    toggleAllSucursales: toggleAllSucursalesStore,
    isLoading, setIsLoading,
    aiInsights, setAiInsights,
    vendedoresData, setVendedoresData,
    instruccionesAdicionales, setInstruccionesAdicionales,
    resetToInitial,
    setCurrentRequestId,
  } = useRecommendationsStore();
  const draftStore = useAssignmentDraftStore();

  const [viewMode, setViewMode] = useDraftState<"list" | "map">("panel", "viewMode", "list");
  const [selectedCiudad, setSelectedCiudad] = useDraftState<string>("panel", "selectedCiudad", "all");
  const [selectedProvincia, setSelectedProvincia] = useDraftState<string>("panel", "selectedProvincia", "all");
  const [selectedVendedor, setSelectedVendedor] = useDraftState<string>("panel", "selectedVendedor", "all");
  const [selectedVendedoresIds, setSelectedVendedoresIds] = useDraftState<string[]>("panel", "selectedVendedoresIds", []);
  const [selectedPlacesComuna, setSelectedPlacesComuna] = useDraftState<string[]>("panel", "selectedPlacesComuna", []);
  const [selectedPlacesBarrio, setSelectedPlacesBarrio] = useDraftState<string[]>("panel", "selectedPlacesBarrio", []);
  const [selectedPlacesProvincia, setSelectedPlacesProvincia] = useDraftState<string>("panel", "selectedPlacesProvincia", "all");
  const [placesData, setPlacesData] = useState<
    Array<{ comuna: string | null; barrio_principal: string | null; provincia_principal: string | null }>
  >([]);
  const [activeTab, setActiveTab] = useDraftState<string>("panel", "activeTab", "nueva");
  const [resumeFlowStep, setResumeFlowStep] = useDraftState<FlowStep | null>("panel", "resumeFlowStep", null);
  const { toast } = useToast();

  const getPlaceIdFromUrl = (url: string | null | undefined) => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      const q = parsed.searchParams.get("q");
      if (q && q.startsWith("place_id:")) return q.replace("place_id:", "");
      const match = url.match(/place_id:([^&]+)/);
      return match ? match[1] : null;
    } catch (err) {
      console.error("URL inválida:", err);
      return null;
    }
  };

  useEffect(() => {
    const loadPlacesData = async () => {
      // Zonas reales: se arman con los lugares de clientes + prospectos
      const [clientRes, prospectRes] = await Promise.all([
        supabase.from("client_places").select("comuna, barrio_principal, provincia_principal").limit(20000),
        supabase.from("prospectos").select("comuna, barrio, provincia").limit(20000),
      ]);

      if (clientRes.error) console.error("Error loading client_places:", clientRes.error);
      if (prospectRes.error) console.error("Error loading prospectos zones:", prospectRes.error);

      const combined = [
        ...(clientRes.data || []).map((p) => ({
          comuna: p.comuna,
          barrio_principal: p.barrio_principal,
          provincia_principal: p.provincia_principal,
        })),
        ...(prospectRes.data || []).map((p) => ({
          comuna: p.comuna,
          barrio_principal: p.barrio,
          provincia_principal: p.provincia,
        })),
      ];

      // Deduplicar combinaciones
      const seen = new Set<string>();
      const unique = combined.filter((p) => {
        const key = `${p.provincia_principal || ""}|${p.comuna || ""}|${p.barrio_principal || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setPlacesData(unique);
    };
    loadPlacesData();
  }, []);


  const [selectedExistingAssignments, setSelectedExistingAssignments] = useDraftState<any[]>("panel", "selectedExistingAssignments", []);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isSavingAssignments, setIsSavingAssignments] = useState(false);
  const [falloGeneracion, setFalloGeneracion] = useState<string | null>(null);
  const [showConfirmAssign, setShowConfirmAssign] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // El botón "Volver al inicio" vive en la barra superior fija (Index) y avisa por evento.
  useEffect(() => {
    const handler = () => {
      if (flowStep === "recommendations") return;
      setShowExitDialog(true);
    };
    window.addEventListener("cupra:volver-inicio", handler);
    return () => window.removeEventListener("cupra:volver-inicio", handler);
  }, [flowStep]);



  useEffect(() => {
    if (!isLoading) {
      setGenerationProgress(0);
      return;
    }

    const startedAt = Date.now();
    setGenerationProgress(4);

    const progressInterval = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const estimatedProgress = 4 + 90 * (1 - Math.exp(-elapsedSeconds / 24));
      setGenerationProgress(Math.min(94, estimatedProgress));
    }, 500);

    return () => window.clearInterval(progressInterval);
  }, [isLoading]);

  const handleCancelRecommendations = () => {
    setCurrentRequestId(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    toast({ title: "Cancelado", description: "Generación de recomendaciones detenida." });
  };

  const handleRequestRecommendations = async (
    filters: any,
    selectedVendedoresData: { ids: string[]; nombres: string[] },
    placesFilters: any,
  ) => {
    const requestId = crypto.randomUUID();
    setCurrentRequestId(requestId);
    setResumeFlowStep(null);
    setIsLoading(true);
    setFalloGeneracion(null);
    setSelectedVendedoresIds(selectedVendedoresData.ids);
    setVendedoresData(
      selectedVendedoresData.ids.map((id, idx) => ({
        id,
        nombre: selectedVendedoresData.nombres[idx] || `Vendedor ${id.substring(0, 8)}`,
      })),
    );

    try {


      const payload = {
        vendedores: selectedVendedoresData.ids,
        provincia: placesFilters.provincia !== "all" ? placesFilters.provincia : undefined,
        comuna: placesFilters.comuna,
        barrio: placesFilters.barrio,
        area_id: filters.area_id,
        max_recomendaciones: 8,
        estados: Array.isArray(filters.estados) ? filters.estados : [],
        regalos_empresariales: filters.regalos_empresariales === true,
        rubros: Array.isArray(filters.rubros) ? filters.rubros : [],
        instrucciones_adicionales: instruccionesAdicionales || null,
      };

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || supabaseKey;

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status}: ${errorText}`);
      }

      const data = await response.json();
      abortControllerRef.current = null;
      const todas = data.recomendaciones || [];
      const idsUnicos = new Set(todas.map(r => r.es_prospecto ? r.prospecto_place_id : r.client_id));
      if (todas.length !== selectedVendedoresData.ids.length * VISITAS_POR_DIA || idsUnicos.size !== todas.length) {
        throw new Error('"error":"La generación recibida está incompleta o contiene repetidos. Reintentá; no se guardó ninguna asignación."');
      }
      for (const id of selectedVendedoresData.ids) {
        const filas = todas.filter(r => r.vendedor_recomendado_id === id);
        const centro = data.resumen?.cobertura?.find(c => c.vendedor_id === id)?.centro;
        const fallo = errorRuta(filas.map(r=>({id:r.client_id || r.prospecto_place_id,lat:Number(r.lat),lng:Number(r.long)})),centro);
        if(fallo) throw new Error(`"error":"${fallo} Reintentá la generación."`);
      }

      // Build local vendedor ID→name lookup for fallback
      const vendedorNombrePorId = new Map(
        selectedVendedoresData.ids.map((id, idx) => [id, selectedVendedoresData.nombres[idx] || id]),
      );

      const mappedRecommendations: Sucursal[] = (data.recomendaciones || []).map((rec: any) => {
        // Priority: API name > local lookup by ID > historical vendor name
        const vendedorNombre = rec.vendedor_recomendado_nombre
          || (rec.vendedor_recomendado_id ? vendedorNombrePorId.get(rec.vendedor_recomendado_id) : undefined)
          || rec.vendedor_principal
          || undefined;

        return ({
          id: rec.request_id + "-" + (rec.client_id || rec.prospecto_place_id),
          nombre: rec.razon_social,
          direccion: rec.ciudades?.[0] || "Sin dirección",
          zona: rec.provincias?.[0] || "Sin zona",
          tipo_cliente: rec.score_comercial || "Estándar",
          score: rec.priority_score || 0,
          dias_sin_visita: rec.days_since_last_purchase || 0,
          latitud: rec.lat || null, longitud: rec.long || null,
          justificacion: rec.ai_reasoning, cuit_dni: rec.cuit_dni,
          vendedores: rec.vendedores || [], client_id: rec.client_id,
          es_prospecto: rec.es_prospecto || false,
          prospecto_place_id: rec.prospecto_place_id,
          tipo_negocio: rec.factores_ia?.tipo_negocio, rating: rec.factores_ia?.rating,
          website: rec.factores_ia?.website, fantasia: rec.razon_social,
          primera_compra: rec.first_purchase_at, ultima_compra: rec.last_purchase_at,
          dias_desde_ultima_compra: rec.days_since_last_purchase,
          cantidad_ordenes: rec.orders_count, monto_total_historico: rec.monto_total_vendido,
          ticket_promedio: rec.avg_ticket, categoria_recencia: rec.score_recencia,
          categoria_volumen: rec.score_volumen, score_recencia: rec.score_recencia_num,
          score_volumen: rec.score_volumen_num, score_comercial: rec.priority_score,
          participacion_mercado: rec.participacion,
          ciudad_principa: rec.ciudades?.[0], provincia_principal: rec.provincias?.[0],
          productos_comprados: rec.etiquetas || [], todas_ciudades: rec.ciudades || [],
          todos_vendedores: rec.vendedores || [], etiquetas: rec.etiquetas || [],
          telefonos: rec.telefonos || [], barrio_principal: rec.barrio_principal,
          direccion_principal: rec.direccion_principal,
          google_maps_link: rec.google_maps_link,
          place_id: getPlaceIdFromUrl(rec.google_maps_link),
          ai_reasoning: rec.ai_reasoning, score_geografico: rec.score_geografico,
          factores_ia: rec.factores_ia,
          vendedor_recomendado_id: rec.vendedor_recomendado_id,
          vendedor_actual: vendedorNombre || rec.vendedor_actual,
          estado_cliente: rec.estado_comercial || (rec.es_prospecto ? 'POTENCIAL' : undefined),
          rubro: rec.rubro ?? rec.factores_ia?.rubro ?? null,
        });
      });

      setGenerationProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 350));

      if (draftStore.get<{ currentRequestId: string | null } | null>("recomendaciones", "state", null)?.currentRequestId !== requestId) return;
      setRecommendations(mappedRecommendations);
      setAiInsights(data.resumen);
      setFlowStep("preselection");
      setSelectedSucursales([]);
      toast({ title: "Recomendaciones generadas", description: data.resumen?.descripcion || `${mappedRecommendations.length} recomendaciones listas` });
    } catch (error: any) {
      if (draftStore.get<{ currentRequestId: string | null } | null>("recomendaciones", "state", null)?.currentRequestId !== requestId) return;
      if (error.name === 'AbortError') return;
      let errorMessage = "Error al solicitar recomendaciones";
      if (error.message?.includes("429")) errorMessage = "Límite de consultas alcanzado. Reintenta en unos minutos.";
      else if (error.message?.includes("402")) errorMessage = "Créditos agotados.";
      else {
        errorMessage = error.message || errorMessage;
        // Mensaje del servidor (ej. sesión vencida o sin permiso), si vino en JSON.
        const detalle = String(error.message || "").match(/"error"\s*:\s*"([^"]+)"/)?.[1];
        if (detalle) errorMessage = detalle;
      }
      setFalloGeneracion(errorMessage);
      toast({ variant: "destructive", title: "No se completaron las rutas", description: errorMessage });
    } finally {
      if (draftStore.get<{ currentRequestId: string | null } | null>("recomendaciones", "state", null)?.currentRequestId === requestId) setIsLoading(false);
    }
  };

  const validarRutasSeleccionadas = () => {
    const filas = recommendations.filter(r=>selectedSucursales.includes(r.id));
    for (const vendedorId of new Set(filas.map(r=>r.vendedor_recomendado_id))) {
      const grupo = filas.filter(r=>r.vendedor_recomendado_id===vendedorId);
      const centro = aiInsights?.cobertura?.find(c=>c.vendedor_id===vendedorId)?.centro;
      const fallo = errorRuta(grupo.map(r=>({id:r.client_id || r.prospecto_place_id,lat:Number(r.latitud),lng:Number(r.longitud)})),centro);
      if (fallo) {
        toast({variant:"destructive",title:"Seleccioná una ruta completa",description:`${grupo[0]?.vendedor_actual || "Vendedor"}: ${fallo}`});
        return false;
      }
    }
    return filas.length > 0;
  };

  const handleRequestAssignmentConfirm = () => {
    if (!validarRutasSeleccionadas()) return;
    setShowConfirmAssign(true);
  };

  const handleGoToModify = () => {
    setShowConfirmAssign(false);
    setFlowStep("assignment");
  };

  const handleContinueToAssignment = async () => {
    if (!validarRutasSeleccionadas()) return;
    setShowConfirmAssign(false);
    const selected = recommendations.filter((rec) => selectedSucursales.includes(rec.id));
    if (selected.length === 0) return;
    // El orden de la lista es el del recorrido de cada vendedor.
    const ordenPorVendedor = new Map<string, number>();
    const siguienteOrden = (vendedor: string) => {
      const orden = (ordenPorVendedor.get(vendedor) ?? 0) + 1;
      ordenPorVendedor.set(vendedor, orden);
      return orden;
    };


    const missingVendor = selected.filter((rec) => !rec.vendedor_recomendado_id);
    if (missingVendor.length > 0) {
      toast({
        variant: "destructive",
        title: "Falta vendedor recomendado",
        description: "Volvé a generar la evaluación: hay resultados sin vendedor de destino.",
      });
      return;
    }

    setIsSavingAssignments(true);
    try {
      const assignments: Array<{
        vendedor_id: string;
        client_id?: string;
        prospecto_place_id?: string;
        es_prospecto: boolean;
        origen_asignacion: string; orden_ruta?: number;
      }> = [];
      selected.forEach((rec) => {
        const vendedorId = rec.vendedor_recomendado_id;
        if (!vendedorId) return;
        if (rec.es_prospecto && rec.prospecto_place_id) {
          assignments.push({
            orden_ruta: siguienteOrden(vendedorId),
            vendedor_id: vendedorId,
            prospecto_place_id: rec.prospecto_place_id,
            es_prospecto: true,
            origen_asignacion: "asignador",
          });
          return;
        }
        if (rec.client_id) {
          assignments.push({
            orden_ruta: siguienteOrden(vendedorId),
            vendedor_id: vendedorId,
            client_id: rec.client_id,
            es_prospecto: false,
            origen_asignacion: "asignador",
          });
        }
      });

      if (assignments.length !== selected.length) {
        throw new Error("Hay recomendaciones sin identificador de cliente o prospecto.");
      }
      await guardarAsignaciones(assignments);

      toast({
        title: "Asignaciones guardadas",
        description: `${assignments.length} visitas quedaron asignadas al vendedor recomendado.`,
      });
      handleBackToRecommendations();
    } catch (error) {
      console.error("Error saving evaluated assignments:", error);
      toast({
        variant: "destructive",
        title: "No se pudieron guardar",
        description: "Las asignaciones no se completaron. Reintentá sin volver a generar.",
      });
    } finally {
      setIsSavingAssignments(false);
    }
  };
  const handleBackToPreselection = () => setFlowStep("preselection");
  const handleBackToRecommendations = () => { setShowExitDialog(false); resetToInitial(); setResumeFlowStep(null); setSelectedCiudad("all"); setSelectedProvincia("all"); setSelectedVendedor("all"); setSelectedVendedoresIds([]); };
  const handleDiscardDraft = () => {
    const step = resumeFlowStep || flowStep;
    if (step === "edit-select" || step === "edit-kanban") {
      draftStore.clear("editar:" + selectedExistingAssignments.map(p => p.id).sort().join("|"));
      draftStore.clear("selector-asignaciones"); setSelectedExistingAssignments([]);
    } else {
      draftStore.clear("tabla:" + recommendations.filter(r => selectedSucursales.includes(r.id)).map(r => r.id).sort().join("|"));
    }
    handleBackToRecommendations();
  };
  // Guardar y salir: conserva las recomendaciones y la selección (persistidas) para retomarlas luego.
  const handleSaveAndExit = () => {
    setShowExitDialog(false);
    setResumeFlowStep(flowStep);
    setFlowStep("recommendations");
    toast({ title: "Borrador guardado", description: "Podés retomarlo desde el panel de asignación." });
  };
  const handleAssignmentComplete = () => handleBackToRecommendations();

  const handleEditAssignments = () => { setResumeFlowStep(null); setFlowStep("edit-select"); };
  const handleContinueToEditKanban = (assignments: any[]) => { setSelectedExistingAssignments(assignments); setFlowStep("edit-kanban"); };
  const handleBackFromEditKanban = () => setFlowStep("edit-select");
  const handleEditComplete = () => { setFlowStep("recommendations"); setResumeFlowStep(null); setSelectedExistingAssignments([]); draftStore.clear("selector-asignaciones"); toast({ title: "Modificaciones guardadas", description: "Las asignaciones se actualizaron correctamente" }); };

  const filteredRecommendations = useMemo(() => {
    return recommendations.filter((rec: any) => {
      if (selectedCiudad !== "all" && rec.direccion !== selectedCiudad) return false;
      if (selectedProvincia !== "all" && rec.zona !== selectedProvincia) return false;
      if (selectedVendedor !== "all") {
        if (!rec.vendedores || !Array.isArray(rec.vendedores)) return false;
        if (!rec.vendedores.includes(selectedVendedor)) return false;
      }
      if (selectedPlacesProvincia !== "all") {
        if (!rec.zona || rec.zona !== selectedPlacesProvincia) return false;
      }
      if (selectedPlacesBarrio.length > 0) {
        if (!rec.barrio_principal || !selectedPlacesBarrio.includes(rec.barrio_principal)) return false;
      }
      return true;
    });
  }, [recommendations, selectedCiudad, selectedProvincia, selectedVendedor, selectedPlacesProvincia, selectedPlacesBarrio]);

  const selectedRecommendations = filteredRecommendations.filter((r) => selectedSucursales.includes(r.id));

  const resumenPorVendedor = useMemo(() => {
    const map = new Map<string, number>();
    selectedRecommendations.forEach((rec) => {
      const nombre = rec.vendedor_actual || rec.vendedor_principal || "Sin vendedor";
      map.set(nombre, (map.get(nombre) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [selectedRecommendations]);

  const prospectosSeleccionados = selectedRecommendations.filter((r) => r.es_prospecto).length;


  return (
    <div className="space-y-10">
      {isLoading && (
        <RecommendationProgress progress={generationProgress} onCancel={handleCancelRecommendations} />
      )}

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir del flujo?</AlertDialogTitle>
            <AlertDialogDescription>
              Podés guardar la búsqueda para retomarla más tarde, o descartarla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={handleDiscardDraft}>Descartar</Button>
            <AlertDialogAction onClick={handleSaveAndExit}>Guardar y salir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showConfirmAssign} onOpenChange={setShowConfirmAssign}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar estas asignaciones?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a asignar {selectedRecommendations.length} destino
              {selectedRecommendations.length !== 1 ? "s" : ""}
              {prospectosSeleccionados > 0
                ? ` (${prospectosSeleccionados} prospecto${prospectosSeleccionados !== 1 ? "s" : ""} nuevo${prospectosSeleccionados !== 1 ? "s" : ""})`
                : ""}
              . Si querés cambiar el vendedor de destino o sacar clientes, pasá a la pantalla de modificación.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5 max-h-52 overflow-y-auto">
            {resumenPorVendedor.map(([nombre, cantidad]) => (
              <div key={nombre} className="flex items-center justify-between text-sm">
                <span className="truncate text-foreground">{nombre}</span>
                <span className="tabular-nums text-muted-foreground">
                  {cantidad} cliente{cantidad !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingAssignments}>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={handleGoToModify} disabled={isSavingAssignments}>
              Modificar
            </Button>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleContinueToAssignment();
              }}
              disabled={isSavingAssignments}
            >
              {isSavingAssignments ? "Guardando..." : "Confirmar y asignar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {flowStep === "recommendations" && (
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-sans text-foreground tracking-tight">Panel de Asignación</h1>
            <p className="text-sm text-muted-foreground mt-2">Recomendaciones inteligentes y gestión de asignaciones</p>
            <DatosAl />
          </div>

          {(recommendations.length > 0 || resumeFlowStep) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-sm text-foreground/80">
                {resumeFlowStep === "edit-select" || resumeFlowStep === "edit-kanban"
                  ? "Tenés una modificación de asignaciones guardada para retomar."
                  : `Tenés una búsqueda guardada con ${recommendations.length} recomendaciones${selectedSucursales.length > 0 ? ` (${selectedSucursales.length} seleccionadas)` : ""}.`}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => { setFlowStep(resumeFlowStep || "preselection"); setResumeFlowStep(null); }}>Retomar</Button>
                <Button size="sm" variant="ghost" onClick={handleDiscardDraft}>Descartar</Button>
              </div>
            </div>
          )}


          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid h-auto w-full max-w-2xl grid-cols-3">
              <TabsTrigger value="nueva" className="min-w-0 gap-1 whitespace-normal px-2 py-2 text-xs sm:gap-2 sm:text-sm">
                <Plus className="w-4 h-4" />
                Nueva Asignación
              </TabsTrigger>
              <TabsTrigger value="hoy" className="min-w-0 gap-1 whitespace-normal px-2 py-2 text-xs sm:gap-2 sm:text-sm">
                <Calendar className="w-4 h-4" />
                Asignaciones de Hoy
              </TabsTrigger>
              <TabsTrigger value="calendario" className="min-w-0 gap-1 whitespace-normal px-2 py-2 text-xs sm:gap-2 sm:text-sm">
                <Calendar className="w-4 h-4" />
                Calendario
              </TabsTrigger>
            </TabsList>

            <TabsContent value="nueva">
              <Card>
                <CardContent className="p-4 sm:p-8">
                  {falloGeneracion && <p role="alert" className="mb-4 border border-destructive/30 rounded-md p-3 text-sm text-destructive">{falloGeneracion}</p>}
                  <FilterPanel
                    onRequestRecommendations={handleRequestRecommendations}
                    isLoading={isLoading}
                    onCancel={handleCancelRecommendations}
                    placesData={placesData}
                    instruccionesAdicionales={instruccionesAdicionales}
                    onInstruccionesChange={setInstruccionesAdicionales}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hoy">
              <Card>
                <CardContent className="p-8">
                  <TodayAssignments onEditAssignments={handleEditAssignments} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="calendario">
              <Card>
                <CardContent className="p-8">
                  <AsignadorCalendario />
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        </div>
      )}

      {flowStep === "edit-select" && (
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-2xl">Modificar Asignaciones</CardTitle>
            <CardDescription>Selecciona las asignaciones que deseas modificar</CardDescription>
          </CardHeader>
          <CardContent>
            <AssignmentsSelector onContinue={handleContinueToEditKanban} onBack={handleSaveAndExit} />
          </CardContent>
        </Card>
      )}

      {flowStep === "edit-kanban" && (
        <EditAssignmentsTable selectedAssignments={selectedExistingAssignments} onBack={handleBackFromEditKanban} onComplete={handleEditComplete} />
      )}

      {flowStep === "preselection" && recommendations.length > 0 && (
        <div className="space-y-8">
          {aiInsights && vendedoresData.length > 0 && (
            <AIInsightsCard resumen={aiInsights} vendedores={vendedoresData} />
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {vendedoresData.map(v => {
              const filas = recommendations.filter(r => r.vendedor_recomendado_id === v.id && selectedSucursales.includes(r.id));
              const puntos = filas.map(r => ({key:r.es_prospecto ? `P:${r.prospecto_place_id}` : `C:${r.client_id}`,nombre:r.nombre}));
              if (puntos.length !== 8) return null;
              return <Card key={v.id}><CardHeader><CardTitle>{v.nombre}</CardTitle></CardHeader><CardContent>
                <RecorridoAPie puntos={puntos} onOrden={ids => {
                  const orden = new Map(ids.map((id,i) => [id,i]));
                  const organizadas = [...filas].sort((a,b) => orden.get(a.es_prospecto ? `P:${a.prospecto_place_id}` : `C:${a.client_id}`)! - orden.get(b.es_prospecto ? `P:${b.prospecto_place_id}` : `C:${b.client_id}`)!);
                  const siguientes = [...organizadas];
                  setRecommendations(recommendations.map(r => filas.some(f => f.id===r.id) ? siguientes.shift()! : r));
                }} />
              </CardContent></Card>;
            })}
          </div>

          <Card>
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="font-sans text-2xl tracking-tight">Preselección</CardTitle>
                  <CardDescription>Selecciona los clientes que deseas asignar</CardDescription>
                </div>
                <div className="flex items-center rounded-md border border-border p-0.5">
                  <Button
                    variant={viewMode === "list" ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-2 px-3"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                    Lista
                  </Button>
                  <Button
                    variant={viewMode === "map" ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-2 px-3"
                    onClick={() => setViewMode("map")}
                  >
                    <MapPin className="w-4 h-4" />
                    Mapa
                  </Button>
                </div>
              </div>
            </CardHeader>


            <CardContent className="pt-6">
              {viewMode === "list" ? (
                <PreselectionStep recommendations={filteredRecommendations} selectedIds={selectedSucursales} onToggle={toggleSucursalStore} onToggleAll={toggleAllSucursalesStore} onContinue={handleRequestAssignmentConfirm} isSaving={isSavingAssignments} />
              ) : (
                <ResultsMap sucursales={filteredRecommendations} selectedIds={selectedSucursales} onToggle={toggleSucursalStore} onToggleAll={toggleAllSucursalesStore} onContinue={handleRequestAssignmentConfirm} />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {flowStep === "assignment" && (
        <TableAssignment
          selectedRecommendations={selectedRecommendations}
          selectedVendedoresIds={selectedVendedoresIds}
          onBack={handleBackToPreselection}
          onComplete={handleAssignmentComplete}
        />
      )}
    </div>
  );
};

export default AssignorDashboard;
