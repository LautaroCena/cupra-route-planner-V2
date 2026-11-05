import { guardarAsignaciones } from "@/lib/asignaciones";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, UserCheck, Users, AlertCircle, Lightbulb, Clock, UserX, TrendingDown, Loader2, SlidersHorizontal, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Building2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatMonto, toTitleCase } from "@/lib/format";
import { SALES_PROFILE_OR_FILTER } from "@/lib/roles";
import { MultiSelect } from "@/components/ui/multi-select";
import { useRubros } from "@/hooks/useRubros";
import { useDraftState } from "@/hooks/useAssignmentDraft";
import { fechaReferencia, colorEstado, DIAS_ACTIVO, DIAS_INACTIVO, ESTADOS, estadoPorDias, hoyArgentina, labelEstado } from "@/lib/segmentos";


interface Cliente {
  client_id: string;
  cuit_dni: string | null;
  razon_social: string | null;
  fantasia: string | null;
  ciudad_principal: string | null;
  provincia_principal: string | null;
  vendedor_actual: string | null;
  vendedor_principal: string | null;
  monto_total_historico: number | null;
  ultima_compra: string | null;
  dias_desde_ultima_compra: number | null;
  cantidad_ordenes: number | null;
  rubro?: string | null;
}

interface Prospecto {
  place_id: string;
  nombre: string;
  ciudad: string | null;
  provincia: string | null;
  barrio: string | null;
  telefono: string | null;
  rating: number | null;
  total_ratings: number | null;
  rubro?: string | null;
}

/** Fila unificada de la tabla: puede ser un cliente consolidado o un prospecto */
interface Fila {
  key: string;
  tipo: "cliente" | "prospecto";
  /** client_ids reales (clientes) — vacío para prospectos */
  clientIds: string[];
  /** place_id de Google (solo prospectos) */
  placeId?: string;
  nombre: string;
  ciudad: string | null;
  provincia: string | null;
  vendedor_actual: string | null;
  monto_total_historico: number;
  dias_sin_compra: number | null;
  cantidad_ordenes: number;
  registros: number;
  /** datos extra de prospecto */
  rating?: number | null;
  total_ratings?: number | null;
  rubro?: string | null;
}

interface Vendedor {
  user_id: string;
  nombre: string;
}

type SuggestionMode = "sin_vendedor" | "baja_frecuencia" | "no_visitados";
type SortKey = "nombre" | "ciudad" | "provincia" | "vendedor" | "monto" | "dias" | "tipo";
type SortDir = "asc" | "desc";
type TipoFiltro = "todos" | "clientes" | "prospectos";

const formatCurrency = (v: number | null) => formatMonto(v, "—");

const normalizeRS = (rs: string) => rs.trim().toUpperCase().replace(/\s+/g, " ");

// Días reales desde la última compra, calculados en horario Argentina (UTC-3)
const diasDesde = (fecha: string | null): number | null => {
  if (!fecha) return null;
  const parsed = new Date(`${fecha.slice(0, 10)}T00:00:00-03:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const hoyAR = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hoy = new Date(`${hoyAR.toISOString().slice(0, 10)}T00:00:00-03:00`);
  return Math.max(0, Math.round((hoy.getTime() - parsed.getTime()) / 86400000));
};


const ManualAssignment = () => {
  const { toast } = useToast();

  // ── State ──
  const [searchQuery, setSearchQuery] = useDraftState("manual", "searchQuery", "");
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const [filterTipo, setFilterTipo] = useDraftState<TipoFiltro>("manual", "filterTipo", "todos");
  const [filterCiudad, setFilterCiudad] = useDraftState("manual", "filterCiudad", "all");
  const [filterProvincia, setFilterProvincia] = useDraftState("manual", "filterProvincia", "all");
  const [filterVendedor, setFilterVendedor] = useDraftState("manual", "filterVendedor", "all");
  const [filterEstados, setFilterEstados] = useDraftState<string[]>("manual", "filterEstados", []);
  const [filterRubros, setFilterRubros] = useDraftState<string[]>("manual", "filterRubros", []);
  const { rubros: rubrosOpciones } = useRubros();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [selectedRows, setSelectedRows] = useDraftState<Set<string>>("manual", "selectedRows", new Set());
  const [selectedSnapshots, setSelectedSnapshots] = useDraftState<Record<string, Fila>>("manual", "selectedSnapshots", {});
  const [selectedVendedorId, setSelectedVendedorId] = useDraftState<string>("manual", "selectedVendedorId", "");
  const [isSearching, setIsSearching] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [suggestionMode, setSuggestionMode] = useDraftState<SuggestionMode | null>("manual", "suggestionMode", null);
  const [hasSearched, setHasSearched] = useState(false);
  const [filtersOpen, setFiltersOpen] = useDraftState("manual", "filtersOpen", false);
  const [sortKey, setSortKey] = useDraftState<SortKey>("manual", "sortKey", "monto");
  const [sortDir, setSortDir] = useDraftState<SortDir>("manual", "sortDir", "desc");

  const activeFilterCount =
    (filterCiudad !== "all" ? 1 : 0) +
    (filterProvincia !== "all" ? 1 : 0) +
    (filterVendedor !== "all" ? 1 : 0) +
    (filterEstados.length > 0 ? 1 : 0) +
    (filterRubros.length > 0 ? 1 : 0);

  // ── Debounce search ──
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Load vendedores on mount ──
  useEffect(() => {
    const loadVendedores = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, nombre")
        .or(SALES_PROFILE_OR_FILTER)
        .eq("activo", true)
        .order("nombre");
      setVendedores(data || []);
    };
    loadVendedores();
  }, []);

  // ── Search clientes + prospectos ──
  const buscar = useCallback(async (
    query: string,
    tipo: TipoFiltro,
    ciudad: string,
    provincia: string,
    vendedor: string,
    suggestion?: SuggestionMode,
    estados: string[] = [],
    rubros: string[] = [],
  ) => {
    setIsSearching(true);
    setHasSearched(true);
    try {
      const sanitized = query.trim().replace(/[%_]/g, "");

      // ── Clientes ──
      const incluirClientes = tipo !== "prospectos";
      let clientesData: Cliente[] = [];
      if (incluirClientes) {
        let q = supabase
          .from("clientes")
          .select("client_id, cuit_dni, ultima_compra, razon_social, fantasia, ciudad_principal, provincia_principal, vendedor_actual, vendedor_principal, monto_total_historico, dias_desde_ultima_compra, cantidad_ordenes, rubro")
          .order("monto_total_historico", { ascending: false })
          .limit(200);

        if (sanitized) q = q.or(`razon_social.ilike.%${sanitized}%,fantasia.ilike.%${sanitized}%`);
        if (ciudad !== "all") q = q.eq("ciudad_principal", ciudad);
        if (provincia !== "all") q = q.eq("provincia_principal", provincia);
        if (vendedor !== "all") {
          if (vendedor === "__SIN_ASIGNAR__") q = q.is("vendedor_actual", null);
          else q = q.eq("vendedor_actual", vendedor);
        }

        if (rubros.length > 0) q = q.in("rubro", rubros);
        // Estado comercial por fecha de última compra (calculado hoy, hora Argentina).
        if (estados.length > 0) {
          const hoy = new Date(`${fechaReferencia()}T00:00:00Z`);
          const hace = (d: number) => new Date(hoy.getTime() - d * 86400000).toISOString().slice(0, 10);
          const conds: string[] = [];
          if (estados.includes("ACTIVO")) conds.push(`ultima_compra.gte.${hace(DIAS_ACTIVO)}`);
          if (estados.includes("INACTIVO")) conds.push(`and(ultima_compra.lt.${hace(DIAS_ACTIVO)},ultima_compra.gte.${hace(DIAS_INACTIVO)})`);
          if (estados.includes("PERDIDO")) conds.push(`ultima_compra.lt.${hace(DIAS_INACTIVO)}`);
          if (estados.includes("POTENCIAL")) conds.push("ultima_compra.is.null");
          if (conds.length > 0) q = q.or(conds.join(","));
        }

        if (suggestion === "sin_vendedor") q = q.is("vendedor_actual", null);
        else if (suggestion === "baja_frecuencia") q = q.lt("cantidad_ordenes", 3).not("cantidad_ordenes", "is", null);
        else if (suggestion === "no_visitados") q = q.gt("dias_desde_ultima_compra", 60);

        const { data, error } = await q;
        if (error) throw error;
        clientesData = data || [];
      }

      // ── Prospectos ──
      // Los prospectos no tienen vendedor titular ni historial de compras:
      // se excluyen si el usuario filtra por un vendedor concreto o pide baja
      // frecuencia / sin compra reciente (métricas que no aplican).
      const incluirProspectos =
        tipo !== "clientes" &&
        (vendedor === "all" || vendedor === "__SIN_ASIGNAR__") &&
        (!suggestion || suggestion === "sin_vendedor") &&
        (estados.length === 0 || estados.includes("POTENCIAL"));

      let prospectosData: Prospecto[] = [];
      if (incluirProspectos) {
        let p = supabase
          .from("prospectos")
          .select("place_id, nombre, ciudad, provincia, barrio, telefono, rating, total_ratings, rubro")
          .eq("es_cliente_cupra", false)
          .order("total_ratings", { ascending: false, nullsFirst: false })
          .limit(200);

        if (sanitized) p = p.ilike("nombre", `%${sanitized}%`);
        if (rubros.length > 0) p = p.in("rubro", rubros);
        if (ciudad !== "all") p = p.eq("ciudad", ciudad);
        if (provincia !== "all") p = p.eq("provincia", provincia);

        const { data, error } = await p;
        if (error) throw error;
        prospectosData = data || [];
      }

      setClientes(clientesData);
      setProspectos(prospectosData);
    } catch (err) {
      console.error("Error searching:", err);
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los resultados" });
    } finally {
      setIsSearching(false);
    }
  }, [toast]);

  // ── Carga inicial + búsqueda al cambiar query o filtros ──
  useEffect(() => {
    buscar(debouncedQuery, filterTipo, filterCiudad, filterProvincia, filterVendedor, suggestionMode || undefined, filterEstados, filterRubros);
  }, [debouncedQuery, filterTipo, filterCiudad, filterProvincia, filterVendedor, suggestionMode, filterEstados, filterRubros, buscar]);


  // ── Opciones de filtro (catálogo completo, independiente del resultado actual) ──
  const [geoOptions, setGeoOptions] = useState<{ ciudades: string[]; provincias: string[] }>({ ciudades: [], provincias: [] });
  useEffect(() => {
    const loadGeo = async () => {
      const [{ data: cli }, { data: pros }] = await Promise.all([
        supabase.from("clientes").select("ciudad_principal, provincia_principal").limit(5000),
        supabase.from("prospectos").select("ciudad, provincia").limit(5000),
      ]);
      const ci = new Set<string>();
      const pr = new Set<string>();
      (cli || []).forEach((r: { ciudad_principal: string | null; provincia_principal: string | null }) => {
        if (r.ciudad_principal) ci.add(r.ciudad_principal);
        if (r.provincia_principal) pr.add(r.provincia_principal);
      });
      (pros || []).forEach((r: { ciudad: string | null; provincia: string | null }) => {
        if (r.ciudad) ci.add(r.ciudad);
        if (r.provincia) pr.add(r.provincia);
      });
      setGeoOptions({ ciudades: Array.from(ci).sort(), provincias: Array.from(pr).sort() });
    };
    loadGeo();
  }, []);
  const ciudades = geoOptions.ciudades;
  const provincias = geoOptions.provincias;


  // ── Unificar registros duplicados del mismo cliente + sumar prospectos ──
  const filas = useMemo<Fila[]>(() => {
    const map = new Map<string, Fila>();
    const ultimaCompraPorGrupo = new Map<string, string>();

    for (const c of clientes) {
      const key = `C:${c.cuit_dni?.trim() || normalizeRS(c.razon_social || c.fantasia || c.client_id)}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          tipo: "cliente",
          clientIds: [c.client_id],
          nombre: c.razon_social || c.fantasia || "Sin nombre",
          ciudad: c.ciudad_principal,
          provincia: c.provincia_principal,
          vendedor_actual: c.vendedor_actual || c.vendedor_principal,
          monto_total_historico: c.monto_total_historico || 0,
          dias_sin_compra: null,
          cantidad_ordenes: c.cantidad_ordenes || 0,
          registros: 1,
          rubro: c.rubro ?? null,
        });
      } else {
        existing.clientIds.push(c.client_id);
        existing.monto_total_historico += c.monto_total_historico || 0;
        existing.cantidad_ordenes += c.cantidad_ordenes || 0;
        existing.registros += 1;
        existing.ciudad ||= c.ciudad_principal;
        existing.provincia ||= c.provincia_principal;
        existing.vendedor_actual ||= c.vendedor_actual || c.vendedor_principal;
        existing.rubro ||= c.rubro ?? null;
      }
      const prev = ultimaCompraPorGrupo.get(key);
      if (c.ultima_compra && (!prev || c.ultima_compra > prev)) {
        ultimaCompraPorGrupo.set(key, c.ultima_compra);
      }
    }

    const filasClientes = Array.from(map.values()).map(g => ({
      ...g,
      dias_sin_compra: diasDesde(ultimaCompraPorGrupo.get(g.key) || null),
    }));

    const filasProspectos: Fila[] = prospectos.map(p => ({
      key: `P:${p.place_id}`,
      tipo: "prospecto" as const,
      clientIds: [],
      placeId: p.place_id,
      nombre: p.nombre,
      ciudad: p.ciudad,
      provincia: p.provincia,
      vendedor_actual: null,
      monto_total_historico: 0,
      dias_sin_compra: null,
      cantidad_ordenes: 0,
      registros: 1,
      rating: p.rating,
      total_ratings: p.total_ratings,
      rubro: p.rubro ?? null,
    }));

    return [...filasClientes, ...filasProspectos];
  }, [clientes, prospectos]);

  const totalClientes = filas.filter(f => f.tipo === "cliente").length;
  const totalProspectos = filas.filter(f => f.tipo === "prospecto").length;

  // ── Ordenamiento de la tabla ──
  const sortedFilas = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const txt = (v: string | null) => (v || "").toLocaleLowerCase("es-AR");
    return [...filas].sort((a, b) => {
      switch (sortKey) {
        case "nombre":
          return txt(a.nombre).localeCompare(txt(b.nombre), "es-AR") * dir;
        case "tipo":
          return a.tipo.localeCompare(b.tipo) * dir;
        case "ciudad":
          return txt(a.ciudad).localeCompare(txt(b.ciudad), "es-AR") * dir;
        case "provincia":
          return txt(a.provincia).localeCompare(txt(b.provincia), "es-AR") * dir;
        case "vendedor":
          return txt(a.vendedor_actual).localeCompare(txt(b.vendedor_actual), "es-AR") * dir;
        case "dias":
          return ((a.dias_sin_compra ?? -1) - (b.dias_sin_compra ?? -1)) * dir;
        default:
          return (a.monto_total_historico - b.monto_total_historico) * dir;
      }
    });
  }, [filas, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "monto" || key === "dias" ? "desc" : "asc");
    }
  };

  const SortHeader = ({ column, label, align = "left" }: { column: SortKey; label: string; align?: "left" | "right" }) => (
    <button
      type="button"
      onClick={() => toggleSort(column)}
      className={`flex items-center gap-1 text-xs font-medium hover:text-foreground transition-colors ${
        sortKey === column ? "text-foreground" : "text-muted-foreground"
      } ${align === "right" ? "ml-auto" : ""}`}
    >
      {label}
      {sortKey !== column ? (
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      ) : sortDir === "asc" ? (
        <ArrowUp className="w-3 h-3" />
      ) : (
        <ArrowDown className="w-3 h-3" />
      )}
    </button>
  );

  // ── Selection helpers ──
  const toggleRow = (rowKey: string) => {
    const row = filas.find(f => f.key === rowKey);
    if (row) setSelectedSnapshots(prev => ({ ...prev, [rowKey]: row }));
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedSnapshots(prev => ({ ...prev, ...Object.fromEntries(filas.map(f => [f.key, f])) }));
    setSelectedRows(prev => {
      const next = new Set(prev);
      const quitar = filas.every(f => prev.has(f.key));
      filas.forEach(f => { if (quitar) next.delete(f.key); else next.add(f.key); });
      return next;
    });
  };

  // ── Assign ──
  const selectedVendedor = vendedores.find(v => v.user_id === selectedVendedorId);
  const selectedFilas = [...selectedRows].map(key => filas.find(f => f.key === key) || selectedSnapshots[key]).filter((f): f is Fila => Boolean(f));
  const selClientes = selectedFilas.filter(f => f.tipo === "cliente");
  const selProspectos = selectedFilas.filter(f => f.tipo === "prospecto");

  const handleAssign = async () => {
    if (!selectedVendedorId || selectedRows.size === 0) return;
    setIsAssigning(true);
    setShowConfirmDialog(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No autenticado");

      const clientIds = selClientes.flatMap(f => f.clientIds);
      const placeIds = selProspectos.map(f => f.placeId!).filter(Boolean);

      // 1. Crear asignaciones (clientes + prospectos)
      const assignments = [
        ...clientIds.map(client_id => ({
          vendedor_id: selectedVendedorId,
          client_id,
          es_prospecto: false,
          origen_asignacion: "asignador",
          estado: "Asignado" as const,
        })),
        ...placeIds.map(place_id => ({
          vendedor_id: selectedVendedorId,
          prospecto_place_id: place_id,
          es_prospecto: true,
          origen_asignacion: "asignador",
          estado: "Asignado" as const,
        })),
      ];

      await guardarAsignaciones(assignments, true);

      const partes = [
        clientIds.length ? `${clientIds.length} cliente(s)` : null,
        placeIds.length ? `${placeIds.length} prospecto(s)` : null,
      ].filter(Boolean).join(" y ");

      toast({
        title: "Asignación realizada",
        description: `${partes} asignado(s) a ${selectedVendedor!.nombre}`,
      });

      setSelectedRows(new Set()); setSelectedSnapshots({});
      buscar(debouncedQuery, filterTipo, filterCiudad, filterProvincia, filterVendedor, suggestionMode || undefined, filterEstados, filterRubros);

    } catch (err: any) {
      console.error("Assignment error:", err);
      const msg = err.message?.includes("duplicate")
        ? "Algunos registros ya están asignados a este vendedor"
        : "Error al realizar la asignación";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleSuggestion = (mode: SuggestionMode) => {
    setSuggestionMode(prev => prev === mode ? null : mode);
    setSearchQuery("");
    setFilterCiudad("all");
    setFilterProvincia("all");
    setFilterVendedor("all");
  };

  const TipoBadge = ({ tipo }: { tipo: Fila["tipo"] }) =>
    tipo === "cliente" ? (
      <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
        <Building2 className="w-3 h-3" /> Cliente
      </Badge>
    ) : (
      <Badge variant="outline" className="gap-1 text-[10px] font-normal border-primary/50 text-primary">
        <Sparkles className="w-3 h-3" /> Prospecto
      </Badge>
    );

  return (
    <div className="space-y-4">
      {/* ── Barra superior: vendedor destino + sugerencias + acción ── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="w-full lg:w-[320px] shrink-0">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <UserCheck className="w-3.5 h-3.5 text-primary" /> Vendedor destino
              </label>
              <SearchableSelect
                options={vendedores.map(v => ({ value: v.user_id, label: toTitleCase(v.nombre) }))}
                value={selectedVendedorId}
                onValueChange={setSelectedVendedorId}
                placeholder="Seleccionar vendedor..."
                searchPlaceholder="Escribí el nombre..."
                emptyMessage="No se encontró ese vendedor."
                className="h-10"
              />
            </div>

            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-primary" /> Sugerencias inteligentes
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={suggestionMode === "sin_vendedor" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSuggestion("sin_vendedor")}
                  className="gap-2 h-10"
                >
                  <UserX className="w-4 h-4" /> Sin vendedor
                </Button>
                <Button
                  variant={suggestionMode === "baja_frecuencia" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSuggestion("baja_frecuencia")}
                  className="gap-2 h-10"
                >
                  <TrendingDown className="w-4 h-4" /> Baja frecuencia
                </Button>
                <Button
                  variant={suggestionMode === "no_visitados" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSuggestion("no_visitados")}
                  className="gap-2 h-10"
                >
                  <Clock className="w-4 h-4" /> Sin compra +60d
                </Button>
              </div>
            </div>

            <div className="shrink-0">
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={!selectedVendedorId || selectedRows.size === 0 || isAssigning}
                className="gap-2 h-10 w-full lg:w-auto"
              >
                {isAssigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                Asignar{selectedRows.size > 0 ? ` (${selectedRows.size})` : ""}
              </Button>
            </div>
          </div>

          {!selectedVendedorId && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Seleccioná un vendedor para habilitar la asignación
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Búsqueda + filtros colapsables + resultados ── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            {/* Selector Clientes / Prospectos */}
            <div className="flex rounded-md border border-border/60 p-0.5 bg-muted/30 shrink-0">
              {([
                { v: "todos", label: "Todos", icon: Users },
                { v: "clientes", label: "Clientes", icon: Building2 },
                { v: "prospectos", label: "Prospectos", icon: Sparkles },
              ] as const).map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setFilterTipo(opt.v)}
                  className={`flex items-center gap-1.5 rounded px-3 h-9 text-xs font-medium transition-colors ${
                    filterTipo === opt.v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <opt.icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o razón social..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen(o => !o)}
              className="gap-2 h-10"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{activeFilterCount}</Badge>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </Button>
          </div>

          {filtersOpen && (
            <div className="flex flex-col sm:flex-row gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <div className="w-full sm:w-[220px] space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Provincia</label>
                <SearchableSelect
                  options={[
                    { value: "all", label: "Todas las provincias" },
                    ...provincias.map(p => ({ value: p, label: p })),
                  ]}
                  value={filterProvincia}
                  onValueChange={setFilterProvincia}
                  placeholder="Todas las provincias"
                  searchPlaceholder="Escribí para buscar provincia..."
                  emptyMessage="No se encontró esa provincia."
                  className="h-9"
                />
              </div>
              <div className="w-full sm:w-[220px] space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ciudad</label>
                <SearchableSelect
                  options={[
                    { value: "all", label: "Todas las ciudades" },
                    ...ciudades.map(c => ({ value: c, label: c })),
                  ]}
                  value={filterCiudad}
                  onValueChange={setFilterCiudad}
                  placeholder="Todas las ciudades"
                  searchPlaceholder="Escribí para buscar ciudad..."
                  emptyMessage="No se encontró esa ciudad."
                  className="h-9"
                />
              </div>
              <div className="w-full sm:w-[240px] space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Vendedor actual</label>
                <SearchableSelect
                  options={[
                    { value: "all", label: "Todos los vendedores" },
                    { value: "__SIN_ASIGNAR__", label: "Sin asignar" },
                    ...vendedores.map(v => ({ value: v.nombre, label: toTitleCase(v.nombre) })),
                  ]}
                  value={filterVendedor}
                  onValueChange={setFilterVendedor}
                  placeholder="Todos los vendedores"
                  searchPlaceholder="Escribí para buscar vendedor..."
                  emptyMessage="No se encontró ese vendedor."
                  className="h-9"
                />
              </div>
              <div className="w-full sm:w-[200px] space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Estado</label>
                <MultiSelect
                  options={ESTADOS.map((e) => ({ value: e.value, label: e.plural }))}
                  selected={filterEstados}
                  onChange={setFilterEstados}
                  placeholder="Todos"
                  className="h-9"
                />
              </div>
              <div className="w-full sm:w-[220px] space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Rubro</label>
                <MultiSelect
                  options={rubrosOpciones}
                  selected={filterRubros}
                  onChange={setFilterRubros}
                  placeholder="Todos los rubros"
                  className="h-9"
                />
              </div>
              {activeFilterCount > 0 && (
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setFilterCiudad("all"); setFilterProvincia("all"); setFilterVendedor("all"); setFilterEstados([]); setFilterRubros([]); }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              )}
            </div>
          )}

          {filterTipo !== "clientes" && filterVendedor !== "all" && filterVendedor !== "__SIN_ASIGNAR__" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Los prospectos no tienen vendedor titular, por eso quedan fuera al filtrar por vendedor.
            </p>
          )}

          {/* ── Results counter + orden ── */}
          {hasSearched && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <Building2 className="w-3 h-3" /> {totalClientes} cliente(s)
                </Badge>
                <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
                  <Sparkles className="w-3 h-3" /> {totalProspectos} prospecto(s)
                </Badge>
                {selectedRows.size > 0 && (
                  <Badge variant="default" className="gap-1">
                    <Users className="w-3 h-3" />
                    {selectedRows.size} seleccionado(s)
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Ordenar por</span>
                <Select
                  value={`${sortKey}:${sortDir}`}
                  onValueChange={v => {
                    const [k, d] = v.split(":");
                    setSortKey(k as SortKey);
                    setSortDir(d as SortDir);
                  }}
                >
                  <SelectTrigger className="h-8 w-[220px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tipo:asc">Tipo (clientes primero)</SelectItem>
                    <SelectItem value="tipo:desc">Tipo (prospectos primero)</SelectItem>
                    <SelectItem value="nombre:asc">Nombre (A → Z)</SelectItem>
                    <SelectItem value="nombre:desc">Nombre (Z → A)</SelectItem>
                    <SelectItem value="vendedor:asc">Vendedor (A → Z)</SelectItem>
                    <SelectItem value="vendedor:desc">Vendedor (Z → A)</SelectItem>
                    <SelectItem value="monto:desc">Ventas (mayor a menor)</SelectItem>
                    <SelectItem value="monto:asc">Ventas (menor a mayor)</SelectItem>
                    <SelectItem value="dias:desc">Días s/compra (más)</SelectItem>
                    <SelectItem value="dias:asc">Días s/compra (menos)</SelectItem>
                    <SelectItem value="ciudad:asc">Ciudad (A → Z)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Separator />


          {/* ── Results table ── */}
          {isSearching ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Buscando...
            </div>
          ) : !hasSearched ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Search className="w-8 h-8 opacity-40" />
              <p className="text-sm">Usá el buscador o las sugerencias inteligentes para encontrar clientes y prospectos</p>
            </div>
          ) : filas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <AlertCircle className="w-8 h-8 opacity-40" />
              <p className="text-sm">No se encontraron resultados con esos criterios</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[450px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filas.length > 0 && filas.every(f => selectedRows.has(f.key))}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead className="w-[110px]"><SortHeader column="tipo" label="Tipo" /></TableHead>
                    <TableHead><SortHeader column="nombre" label="Nombre / Razón Social" /></TableHead>
                    <TableHead><SortHeader column="ciudad" label="Ciudad" /></TableHead>
                    <TableHead><SortHeader column="provincia" label="Provincia" /></TableHead>
                    <TableHead><SortHeader column="vendedor" label="Vendedor Actual" /></TableHead>
                    <TableHead className="text-right"><SortHeader column="monto" label="Total Compras" align="right" /></TableHead>
                    <TableHead className="text-right"><SortHeader column="dias" label="Días s/compra" align="right" /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFilas.map(c => {
                    const isSelected = selectedRows.has(c.key);
                    const esProspecto = c.tipo === "prospecto";
                    return (
                      <TableRow
                        key={c.key}
                        className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-accent/30"}`}
                        onClick={() => toggleRow(c.key)}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRow(c.key)}
                          />
                        </TableCell>
                        <TableCell><TipoBadge tipo={c.tipo} /></TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{c.nombre}</span>
                            {(() => {
                              const estado = esProspecto ? "POTENCIAL" : estadoPorDias(c.dias_sin_compra);
                              return (
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: colorEstado(estado) }}
                                  title={labelEstado(estado)}
                                />
                              );
                            })()}
                            {c.rubro && (
                              <Badge variant="outline" className="text-[10px] font-normal">{c.rubro}</Badge>
                            )}
                            {c.registros > 1 && (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                {c.registros} registros
                              </Badge>
                            )}
                            {esProspecto && c.total_ratings ? (
                              <span className="text-[11px] text-muted-foreground">
                                ★ {c.rating ?? "—"} ({c.total_ratings})
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.ciudad || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.provincia || "—"}
                        </TableCell>
                        <TableCell>
                          {esProspecto ? (
                            <span className="text-xs text-muted-foreground italic">No aplica</span>
                          ) : c.vendedor_actual ? (
                            <span className="text-sm">{toTitleCase(c.vendedor_actual)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Sin asignar</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {esProspecto ? <span className="text-xs text-muted-foreground italic">—</span> : formatCurrency(c.monto_total_historico)}
                        </TableCell>
                        <TableCell className="text-right">
                          {esProspecto ? (
                            <span className="text-xs text-muted-foreground italic">Sin historial</span>
                          ) : c.dias_sin_compra != null ? (
                            <Badge variant={c.dias_sin_compra > 90 ? "destructive" : c.dias_sin_compra > 30 ? "secondary" : "default"} className="text-xs">
                              {c.dias_sin_compra}d
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Sin compras</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ── Confirmation Dialog ── */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar asignación manual</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Vas a asignar{" "}
                <strong>{selClientes.length} cliente(s)</strong>
                {selProspectos.length > 0 && <> y <strong>{selProspectos.length} prospecto(s)</strong></>}
                {" "}a <strong>{selectedVendedor ? toTitleCase(selectedVendedor.nombre) : ""}</strong>.
              </span>
              <span className="block text-xs text-muted-foreground">
                Se crea una asignación por cada registro. En los clientes se actualiza el vendedor actual y queda
                registrado en el historial de auditoría; los prospectos se asignan sin cambiar titularidad.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAssign}>
              Confirmar asignación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManualAssignment;
