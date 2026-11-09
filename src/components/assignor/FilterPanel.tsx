import { EnfoqueRegalos } from "@/components/prospectos/EnfoqueRegalos";
import { candidatoRegalos } from "../../../supabase/functions/_shared/prospect-categories";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, MapPin, X, LayoutGrid, Search, Square, Hand, Map as MapIcon } from "lucide-react";
import ManualAssignment from "./ManualAssignment";
import MapaZonaAsignacion from "./MapaZonaAsignacion";
import { MultiSelect } from "@/components/ui/multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { toTitleCase } from "@/lib/format";
import { GEO_PROVINCIAS, geoComunas, geoBarrios } from "@/data/geoBuenosAires";
import { SALES_PROFILE_OR_FILTER } from "@/lib/roles";
import { ESTADOS } from "@/lib/segmentos";
import { useRubros } from "@/hooks/useRubros";
import { useDraftState, useAssignmentDraftStore } from "@/hooks/useAssignmentDraft";


interface Vendedor { id: string; profileId: string; nombre: string; email: string; }
interface Area { id: string; nombre: string; vendedores: string[]; barrios: string[]; }

interface FilterPanelProps {
  onRequestRecommendations: (filters: any, selectedVendedoresData: { ids: string[], nombres: string[] }, placesFilters: any) => void;
  isLoading: boolean;
  onCancel?: () => void;
  placesData: Array<{ comuna: string | null, barrio_principal: string | null, provincia_principal: string | null }>;
}

const FilterPanel = ({
  onRequestRecommendations, isLoading, onCancel, placesData
}: FilterPanelProps) => {
  const [mode, setMode] = useDraftState<'area' | 'custom' | 'manual' | 'mapa'>("filtros", "mode", 'area');
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [selectedVendedores, setSelectedVendedores] = useDraftState<string[]>("filtros", "selectedVendedores", []);
  const [isLoadingVendedores, setIsLoadingVendedores] = useState(true);
  const [selectedComuna, setSelectedComuna] = useDraftState<string[]>("filtros", "selectedComuna", []);
  const [selectedBarrio, setSelectedBarrio] = useDraftState<string[]>("filtros", "selectedBarrio", []);
  const [selectedProvincia, setSelectedProvincia] = useDraftState<string>("filtros", "selectedProvincia", 'all');
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedArea, setSelectedArea] = useDraftState<string>("filtros", "selectedArea", 'none');
  const [isLoadingAreas, setIsLoadingAreas] = useState(true);
  // Qué tipo de visitas pedir: vacío = todos los estados, sin cupos.
  const [selectedEstados, setSelectedEstados] = useDraftState<string[]>("filtros", "selectedEstados", []);
  const [selectedRubros, setSelectedRubros] = useDraftState<string[]>("filtros", "selectedRubros", []);
  const [regalos, setRegalos] = useDraftState("filtros", "regalosEmpresariales", false);
  const { rubros: rubrosOpciones, loading: loadingRubros } = useRubros();
  
  const { toast } = useToast();
  const draftStore = useAssignmentDraftStore();

  const provincias = useMemo(() => {
    const set = new Set<string>(GEO_PROVINCIAS);
    placesData.forEach(place => { if (place.provincia_principal) set.add(place.provincia_principal); });
    return Array.from(set).sort();
  }, [placesData]);

  const provinciaScope = useMemo(
    () => (selectedProvincia === 'all' ? [] : [selectedProvincia]),
    [selectedProvincia]
  );

  const comunas = useMemo(() => {
    const set = new Set<string>(geoComunas(provinciaScope));
    placesData
      .filter(place => selectedProvincia === 'all' || place.provincia_principal === selectedProvincia)
      .forEach(place => { if (place.comuna) set.add(place.comuna); });
    return Array.from(set).sort().map(c => ({ label: c, value: c }));
  }, [placesData, selectedProvincia, provinciaScope]);

  const barrios = useMemo(() => {
    const set = new Set<string>(geoBarrios(provinciaScope, selectedComuna));
    placesData
      .filter(place =>
        (selectedProvincia === 'all' || place.provincia_principal === selectedProvincia) &&
        (selectedComuna.length === 0 || selectedComuna.includes(place.comuna || ''))
      )
      .forEach(place => { if (place.barrio_principal) set.add(place.barrio_principal); });
    return Array.from(set).sort().map(b => ({ label: b, value: b }));
  }, [placesData, selectedProvincia, selectedComuna, provinciaScope]);


  const handleProvinciaChange = (value: string) => { setSelectedProvincia(value); setSelectedComuna([]); setSelectedBarrio([]); };
  const handleAreaChange = async (areaId: string) => { setSelectedArea(areaId); };
  const handleClearFilters = () => { setSelectedProvincia('all'); setSelectedComuna([]); setSelectedBarrio([]); setSelectedArea('none'); };
  const hasActiveFilters = selectedProvincia !== 'all' || selectedComuna.length > 0 || selectedBarrio.length > 0;

  useEffect(() => { fetchVendedores(); fetchAreas(); }, []);

  const fetchAreas = async () => {
    setIsLoadingAreas(true);
    try {
      const { data: areasData, error: areasError } = await supabase.from('areas').select('id, nombre');
      if (areasError) throw areasError;
      const areasWithRelations = await Promise.all(
        (areasData || []).map(async (area) => {
          const { data: vendedoresData } = await supabase.from('areas_vendedores').select('vendedor_id').eq('area_id', area.id);
          const { data: placesData } = await supabase.from('areas_places').select('place_id').eq('area_id', area.id);
          const placeIds = (placesData || []).map(p => p.place_id);
          const barrios: string[] = [];
          if (placeIds.length > 0) {
            const { data: barriosData } = await supabase.from('places').select('barrio_principal').in('id', placeIds);
            (barriosData || []).forEach(p => { if (p.barrio_principal) barrios.push(p.barrio_principal); });
          }
          return { id: area.id, nombre: area.nombre, vendedores: (vendedoresData || []).map(v => v.vendedor_id), barrios };
        })
      );
      setAreas(areasWithRelations);
    } catch (error) { console.error('Error fetching areas:', error); }
    finally { setIsLoadingAreas(false); }
  };

  const fetchVendedores = async () => {
    setIsLoadingVendedores(true);
    try {
      const { data, error } = await supabase.from('profiles').select('id, user_id, nombre, email').or(SALES_PROFILE_OR_FILTER).eq('activo', true);
      if (error) throw error;
      const mapped = (data || []).map(v => ({ id: v.user_id, profileId: v.id, nombre: toTitleCase(v.nombre), email: v.email }));
      setVendedores(mapped);
      // Un borrador puede guardar un vendedor que ya no está disponible.
      setSelectedVendedores((prev) => prev.filter((id) => mapped.some((v) => v.id === id)));
      if (draftStore.get("filtros", "selectedVendedores", null) === null) setSelectedVendedores(mapped.map(v => v.id));
    } catch (error) { console.error('Error fetching vendedores:', error); }
    finally { setIsLoadingVendedores(false); }
  };

  const toggleVendedor = (vendedorId: string) => {
    setSelectedVendedores(prev => prev.includes(vendedorId) ? prev.filter(id => id !== vendedorId) : [...prev, vendedorId]);
  };
  const toggleAllVendedores = () => {
    setSelectedVendedores(selectedVendedores.length === vendedores.length ? [] : vendedores.map(v => v.id));
  };

  const handleSubmitArea = () => {
    const area = areas.find(a => a.id === selectedArea);
    if (!area) return;

    const areaVendedores = vendedores.filter(v => area.vendedores.includes(v.profileId));
    const ids = areaVendedores.map(v => v.id);
    const nombres = areaVendedores.map(v => v.nombre);

    if (ids.length === 0) {
      toast({ variant: "destructive", title: "Área sin vendedores", description: `El área "${area.nombre}" no tiene vendedores asignados. Asigná vendedores al área o usá el modo Personalizado.` });
      return;
    }


    onRequestRecommendations(
      { area_id: selectedArea, cantidad_vendedores: ids.length, estados: selectedEstados, rubros: selectedRubros, regalos_empresariales: regalos },
      { ids, nombres },
      { comuna: null, barrio: area.barrios.length > 0 ? area.barrios : null, provincia: null }
    );
  };

  const handleSubmitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedVendedores.length === 0) { toast({ variant: "destructive", title: "Error", description: "Seleccioná al menos un vendedor" }); return; }
    const nombres = selectedVendedores.map(id => vendedores.find(v => v.id === id)?.nombre || "Vendedor");
    onRequestRecommendations({ cantidad_vendedores: selectedVendedores.length, estados: selectedEstados, rubros: selectedRubros, regalos_empresariales: regalos }, { ids: selectedVendedores, nombres }, { comuna: selectedComuna.length > 0 ? selectedComuna : null, barrio: selectedBarrio.length > 0 ? selectedBarrio : null, provincia: selectedProvincia !== 'all' ? selectedProvincia : null });
  };

  const selectedAreaData = areas.find(a => a.id === selectedArea);

  return (
    <div className="space-y-8">
      {/* Mode selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setMode('area')}
          className={`group p-4 sm:p-6 rounded-xl text-left transition-all duration-200 ${
            mode === 'area'
              ? 'bg-primary/8 border border-primary/20'
              : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2">
            <LayoutGrid className={`w-4 h-4 shrink-0 ${mode === 'area' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="font-medium text-sm">Por Área</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">Área predefinida con vendedores y zonas</p>
        </button>

        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`group p-4 sm:p-6 rounded-xl text-left transition-all duration-200 ${
            mode === 'custom'
              ? 'bg-primary/8 border border-primary/20'
              : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2">
            <Search className={`w-4 h-4 shrink-0 ${mode === 'custom' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="font-medium text-sm">Personalizado</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">Selección manual de vendedores y zonas</p>
        </button>

        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`group p-4 sm:p-6 rounded-xl text-left transition-all duration-200 ${
            mode === 'manual'
              ? 'bg-primary/8 border border-primary/20'
              : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2">
            <Hand className={`w-4 h-4 shrink-0 ${mode === 'manual' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="font-medium text-sm">Asignación Manual</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">Buscar y asignar clientes directamente</p>
        </button>

        <button
          type="button"
          onClick={() => setMode('mapa')}
          className={`group p-4 sm:p-6 rounded-xl text-left transition-all duration-200 ${
            mode === 'mapa'
              ? 'bg-primary/8 border border-primary/20'
              : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
          }`}
        >
          <div className="flex items-center gap-2.5 mb-2">
            <MapIcon className={`w-4 h-4 shrink-0 ${mode === 'mapa' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className="font-medium text-sm">Mapa de la zona</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">Elegir clientes de un vendedor y completar con prospectos cercanos</p>
        </button>
      </div>

      {/* Mode: Area */}
      {mode === 'area' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="area-filter" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Área</Label>
            <SearchableSelect
              options={[{ value: 'none', label: 'Sin área seleccionada' }, ...areas.map(a => ({ value: a.id, label: a.nombre }))]}
              value={selectedArea}
              onValueChange={handleAreaChange}
              disabled={isLoadingAreas}
              placeholder="Seleccionar área..."
              searchPlaceholder="Buscar área..."
              emptyMessage="No se encontró esa área."
              className="bg-secondary/30 border-border/30 h-11"
            />

          </div>

          {selectedAreaData && (
            <div className="rounded-xl bg-secondary/20 p-5 space-y-3">
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs font-medium text-muted-foreground mr-1">Vendedores</span>
                {vendedores.filter(v => selectedAreaData.vendedores.includes(v.profileId)).length > 0 ? (
                  vendedores.filter(v => selectedAreaData.vendedores.includes(v.profileId)).map(v => (
                    <Badge key={v.id} variant="secondary" className="text-xs font-normal">{v.nombre.split(' ')[0]}</Badge>
                  ))
                ) : (<span className="text-xs text-destructive">Sin vendedores asignados</span>)}

              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs font-medium text-muted-foreground mr-1">Barrios</span>
                {selectedAreaData.barrios.length > 0 ? (
                  selectedAreaData.barrios.slice(0, 5).map(b => <Badge key={b} variant="outline" className="text-xs font-normal">{b}</Badge>)
                ) : (<span className="text-xs text-muted-foreground">Todos</span>)}
                {selectedAreaData.barrios.length > 5 && <span className="text-xs text-muted-foreground">+{selectedAreaData.barrios.length - 5}</span>}
              </div>
            </div>
          )}

          <VisitTypeFilters
            regalos={regalos}
            onRegalosChange={value => { setRegalos(value); setSelectedRubros([]); }}
            estados={selectedEstados}
            onEstadosChange={setSelectedEstados}
            rubros={selectedRubros}
            onRubrosChange={setSelectedRubros}
            rubrosOpciones={rubrosOpciones}
            loadingRubros={loadingRubros}
          />


          {isLoading ? (
            <Button type="button" onClick={onCancel} variant="destructive" size="lg" className="w-full">
              <Square className="w-4 h-4" />
              Detener
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmitArea} disabled={selectedArea === 'none'} size="lg" className="w-full">
              <Sparkles className="w-4 h-4" />
              Generar Recomendaciones
            </Button>
          )}
        </div>
      )}

      {/* Mode: Custom */}
      {mode === 'custom' && (
        <form onSubmit={handleSubmitCustom} className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendedores</Label>
              <Button type="button" variant="ghost" size="sm" onClick={toggleAllVendedores} disabled={isLoadingVendedores} className="h-7 px-2 text-xs text-muted-foreground">
                {selectedVendedores.length === vendedores.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </Button>
            </div>
            <MultiSelect
              options={vendedores.map(v => ({ label: v.nombre, value: v.id }))}
              selected={selectedVendedores}
              onChange={setSelectedVendedores}
              placeholder={isLoadingVendedores ? "Cargando vendedores..." : "Buscar y seleccionar vendedores..."}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">{selectedVendedores.length} de {vendedores.length} seleccionados</p>
          </div>


          {/* Geographic filters */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtros Geográficos</span>
              </div>
              {hasActiveFilters && (
                <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters} className="h-7 px-2 text-xs text-muted-foreground">
                  <X className="w-3 h-3 mr-1" />Limpiar
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Provincia</Label>
                <SearchableSelect
                  options={[{ value: 'all', label: 'Todas las provincias' }, ...provincias.map(p => ({ value: p, label: p }))]}
                  value={selectedProvincia}
                  onValueChange={handleProvinciaChange}
                  placeholder="Todas"
                  searchPlaceholder="Buscar provincia..."
                  className="bg-secondary/20 border-border/20 h-10"
                />

              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Comuna / Distrito</Label>
                <MultiSelect options={comunas} selected={selectedComuna} onChange={setSelectedComuna} placeholder="Todas" className="w-full" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Barrio</Label>
                <MultiSelect options={barrios} selected={selectedBarrio} onChange={setSelectedBarrio} placeholder="Todos" className="w-full" />
              </div>
            </div>
          </div>

          <VisitTypeFilters
            regalos={regalos}
            onRegalosChange={value => { setRegalos(value); setSelectedRubros([]); }}
            estados={selectedEstados}
            onEstadosChange={setSelectedEstados}
            rubros={selectedRubros}
            onRubrosChange={setSelectedRubros}
            rubrosOpciones={rubrosOpciones}
            loadingRubros={loadingRubros}
          />


          {isLoading ? (
            <Button type="button" onClick={onCancel} variant="destructive" size="lg" className="w-full">
              <Square className="w-4 h-4" />
              Detener
            </Button>
          ) : (
            <Button type="submit" disabled={selectedVendedores.length === 0} size="lg" className="w-full">
              <Sparkles className="w-4 h-4" />
              Generar Recomendaciones
            </Button>
          )}
        </form>
      )}

      {/* Mode: Manual */}
      {mode === 'manual' && (
        <ManualAssignment />
      )}

      {mode === 'mapa' && (
        <MapaZonaAsignacion vendedores={vendedores.map((v) => ({ id: v.id, nombre: v.nombre }))}
          onIrAManual={vendedorId => { draftStore.set("manual", "selectedVendedorId", vendedorId, ""); setMode("manual"); }} />
      )}
    </div>
  );
};

function VisitTypeFilters({ regalos, onRegalosChange, estados, onEstadosChange, rubros, onRubrosChange, rubrosOpciones, loadingRubros }: {
  regalos: boolean;
  onRegalosChange: (value: boolean) => void;
  estados: string[];
  onEstadosChange: (v: string[]) => void;
  rubros: string[];
  onRubrosChange: (v: string[]) => void;
  rubrosOpciones: { value: string; label: string }[];
  loadingRubros: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/40 p-4">
      <EnfoqueRegalos checked={regalos} onChange={onRegalosChange} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Estado de los clientes a visitar</Label>
          <MultiSelect
            options={ESTADOS.map((e) => ({ value: e.value, label: e.plural }))}
            selected={estados}
            onChange={onEstadosChange}
            placeholder="Todos los estados"
            className="w-full"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Rubro</Label>
          <MultiSelect
            options={regalos ? rubrosOpciones.filter(r => candidatoRegalos({ rubro: r.value })) : rubrosOpciones}
            selected={rubros}
            onChange={onRubrosChange}
            placeholder={loadingRubros ? "Cargando rubros..." : "Todos los rubros"}
            className="w-full"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {estados.length === 0
          ? "Hasta 8 visitas por vendedor dentro de 1,5 km, elegidas por valor. Se prioriza la cartera y se completa con prospectos, sin cupos por estado."
          : `Objetivo: hasta 8 visitas por vendedor, priorizando ${ESTADOS.filter((e) => estados.includes(e.value)).map((e) => e.plural.toLowerCase()).join(" y ")}. Si no alcanzan, se proponen otras visitas disponibles y se informa la sustitución.`}
        {rubros.length > 0 && " Solo se incluyen clientes y prospectos de los rubros elegidos."}
      </p>
    </div>
  );
}

export default FilterPanel;
