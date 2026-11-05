import { useDraftState, useAssignmentDraftStore } from "@/hooks/useAssignmentDraft";
import { guardarAsignaciones } from "@/lib/asignaciones";
import { SALES_PROFILE_OR_FILTER } from "@/lib/roles";
import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { Save, Search, ChevronDown, Info, ArrowLeft } from "lucide-react";
import { Sucursal } from "@/types/sales";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toTitleCase } from "@/lib/format";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Vendedor {
  id: string;
  nombre: string;
  email: string;
}

interface TableAssignmentProps {
  selectedRecommendations: Sucursal[];
  selectedVendedoresIds: string[];
  onBack: () => void;
  onComplete?: () => void;
}

const ITEMS_PER_PAGE = 100;

const TableAssignment = ({
  selectedRecommendations,
  selectedVendedoresIds,
  onBack,
  onComplete,
}: TableAssignmentProps) => {
  const draftStore = useAssignmentDraftStore();
  const draftScope = "tabla:" + selectedRecommendations.map(p => p.id).sort().join("|");
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [assignmentMap, setAssignmentMap] = useDraftState<Record<string, string | null>>(draftScope, "assignmentMap", {});
  const [selectedIds, setSelectedIds] = useDraftState<Set<string>>(draftScope, "selectedIds", new Set());
  const [searchTerm, setSearchTerm] = useDraftState(draftScope, "searchTerm", "");
  const [filterVendedor, setFilterVendedor] = useDraftState<string>(draftScope, "filterVendedor", "all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchVendedores();
  }, []);

  const fetchVendedores = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, nombre, email")
        .or(SALES_PROFILE_OR_FILTER)
        .eq("activo", true);

      if (error) throw error;

      const mapped = (data || []).map((v) => ({
        id: v.user_id,
        nombre: v.nombre,
        email: v.email,
      }));
      setVendedores(mapped);

      // Pre-assign based on AI recommendation (from payload or DB), then fallback to historical vendedor
      const nombreToId = new Map<string, string>();
      mapped.forEach((v) => nombreToId.set(v.nombre.toUpperCase().trim(), v.id));
      const vendedorIdSet = new Set(mapped.map((v) => v.id));

      // Recover AI recommended vendor from DB as fallback (useful for persisted flows)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const requestIds = Array.from(
        new Set(
          selectedRecommendations
            .map((rec) => rec.id?.slice(0, 36))
            .filter((id): id is string => Boolean(id) && uuidRegex.test(id))
        )
      );

      const aiByRecommendationKey = new Map<string, string>();
      if (requestIds.length > 0) {
        const { data: aiRows, error: aiRowsError } = await supabase
          .from("recomendaciones_ia")
          .select("request_id, client_id, prospecto_place_id, vendedor_recomendado_id")
          .in("request_id", requestIds);

        if (aiRowsError) {
          console.warn("No se pudo recuperar vendedor recomendado de IA", aiRowsError);
        } else {
          (aiRows || []).forEach((row) => {
            const entityId = row.client_id || row.prospecto_place_id;
            if (row.request_id && entityId && row.vendedor_recomendado_id) {
              aiByRecommendationKey.set(`${row.request_id}-${entityId}`, row.vendedor_recomendado_id);
            }
          });
        }
      }

      const initialMap: Record<string, string | null> = {};
      selectedRecommendations.forEach((rec) => {
        let assignedId: string | null = null;

        // Priority 1: AI-recommended vendor from current payload
        if (rec.vendedor_recomendado_id && vendedorIdSet.has(rec.vendedor_recomendado_id)) {
          assignedId = rec.vendedor_recomendado_id;
        }

        // Priority 2: AI-recommended vendor recovered from DB by request_id + entity_id
        if (!assignedId) {
          const dbRecommended = aiByRecommendationKey.get(rec.id);
          if (dbRecommended && vendedorIdSet.has(dbRecommended)) {
            assignedId = dbRecommended;
          }
        }

        // Fallback: previous historical vendedor
        if (!assignedId && rec.vendedor_principal) {
          const vid = nombreToId.get(rec.vendedor_principal.toUpperCase().trim());
          if (vid) assignedId = vid;
        }

        if (!assignedId && rec.vendedores?.length) {
          for (const name of rec.vendedores) {
            const vid = nombreToId.get(name.toUpperCase().trim());
            if (vid) {
              assignedId = vid;
              break;
            }
          }
        }

        initialMap[rec.id] = assignedId;
      });

      setAssignmentMap(prev => ({ ...initialMap, ...Object.fromEntries(Object.entries(prev).filter(([id]) => Object.prototype.hasOwnProperty.call(initialMap, id))) }));
    } catch (error) {
      console.error("Error fetching vendedores:", error);
      toast({ variant: "destructive", title: "Error", description: "Error al cargar vendedores" });
    }
  };

  // Filtered and searched data
  const filteredData = useMemo(() => {
    return selectedRecommendations.filter((rec) => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const name = (rec.nombre || rec.fantasia || "").toLowerCase();
        const dir = (rec.direccion_principal || rec.direccion || "").toLowerCase();
        if (!name.includes(term) && !dir.includes(term)) return false;
      }
      if (filterVendedor !== "all") {
        const assigned = assignmentMap[rec.id];
        if (filterVendedor === "unassigned") {
          if (assigned) return false;
        } else {
          if (assigned !== filterVendedor) return false;
        }
      }
      return true;
    });
  }, [selectedRecommendations, searchTerm, filterVendedor, assignmentMap]);

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterVendedor]);

  const unassignedCount = selectedRecommendations.filter((r) => !assignmentMap[r.id]).length;

  // Selection
  const allPageSelected = paginatedData.length > 0 && paginatedData.every((r) => selectedIds.has(r.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedData.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedData.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const deselectAll = () => setSelectedIds(new Set());

  // Bulk assign
  const assignSelectedTo = (vendedorId: string) => {
    setAssignmentMap((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => { next[id] = vendedorId; });
      return next;
    });
    const v = vendedores.find((v) => v.id === vendedorId);
    toast({
      title: `${selectedIds.size} clientes asignados`,
      description: `Asignados a ${v?.nombre || "vendedor"}`,
    });
  };

  // Get vendedor name
  const getVendedorName = (id: string | null) => {
    if (!id) return null;
    return vendedores.find((v) => v.id === id)?.nombre || null;
  };

  // El mismo guardado transaccional que la preselección y el mapa.
  const handleSave = async () => {
    setIsLoading(true);
    try {
      // La cuenta se identifica por client_id: un CUIT puede tener varias sucursales.
      const ordenPorVendedor = new Map<string, number>();
      const siguienteOrden = (vendedor: string) => {
        const orden = (ordenPorVendedor.get(vendedor) ?? 0) + 1;
        ordenPorVendedor.set(vendedor, orden);
        return orden;
      };
      const newAssignments = selectedRecommendations
        .filter((rec) => assignmentMap[rec.id])
        .map((rec) => ({
          orden_ruta: siguienteOrden(assignmentMap[rec.id]),
          vendedor_id: assignmentMap[rec.id],
          client_id: rec.es_prospecto ? null : rec.client_id,
          prospecto_place_id: rec.es_prospecto ? rec.prospecto_place_id : null,
        }));
      await guardarAsignaciones(newAssignments);

      toast({
        title: "Asignaciones guardadas",
        description: `Se asignaron ${newAssignments.length} clientes exitosamente`,
      });

      draftStore.clear(draftScope);
      if (onComplete) onComplete(); else onBack();
    } catch (error) {
      console.error("Error saving assignments:", error);
      toast({ variant: "destructive", title: "Error", description: "Error al guardar las asignaciones" });
    } finally {
      setIsLoading(false);
    }
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        pages.push(i);
      }
    }

    return (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
            />
          </PaginationItem>
          {pages.map((page, i) => {
            const prev = pages[i - 1];
            const showEllipsis = prev && page - prev > 1;
            return (
              <span key={page} className="flex items-center">
                {showEllipsis && (
                  <PaginationItem><PaginationEllipsis /></PaginationItem>
                )}
                <PaginationItem>
                  <PaginationLink
                    isActive={currentPage === page}
                    onClick={() => setCurrentPage(page)}
                    className="cursor-pointer"
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              </span>
            );
          })}
          <PaginationItem>
            <PaginationNext
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-sans text-foreground tracking-tight">Asignar Clientes</h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-sm text-muted-foreground">
            Selecciona clientes y asignalos a un vendedor rápido y eficientemente
          </p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-4 h-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Usa los checkboxes para seleccionar clientes, luego elige "Asignar a" para asignarlos masivamente.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter by vendedor */}
        <Select value={filterVendedor} onValueChange={setFilterVendedor}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Todos los vendedores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los vendedores</SelectItem>
            <SelectItem value="unassigned">Sin asignar</SelectItem>
            {vendedores.map((v) => (
              <SelectItem key={v.id} value={v.id}>{toTitleCase(v.nombre)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Bulk assign dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2" disabled={selectedIds.size === 0}>
              Asignar a
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <div className="px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <Checkbox checked={selectedIds.size > 0} className="h-4 w-4" />
                <span className="text-sm font-medium">{selectedIds.size} seleccionados</span>
              </div>
              {selectedIds.size > 0 && (
                <button onClick={deselectAll} className="text-xs text-muted-foreground hover:text-foreground mt-1">
                  Desmarcar todos
                </button>
              )}
            </div>
            {vendedores.map((v) => (
              <DropdownMenuItem key={v.id} onClick={() => assignSelectedTo(v.id)}>
                {toTitleCase(v.nombre)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Button>

        <Button onClick={handleSave} disabled={isLoading} className="gap-2">
          <Save className="w-4 h-4" />
          Guardar
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={toggleAll}
                  className="h-4 w-4"
                />
              </TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead className="text-center">Días sin visita</TableHead>
              <TableHead className="text-right">Asignado a</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                  No se encontraron clientes
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((rec) => {
                const isSelected = selectedIds.has(rec.id);
                const assignedName = getVendedorName(assignmentMap[rec.id] || null);
                const dias = rec.dias_sin_visita || rec.dias_desde_ultima_compra || 0;

                return (
                  <TableRow
                    key={rec.id}
                    data-state={isSelected ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => toggleSelect(rec.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(rec.id)}
                        className="h-4 w-4"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {rec.es_prospecto && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">P</Badge>
                        )}
                        <span className="font-medium text-sm">{rec.nombre || rec.fantasia}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rec.direccion_principal || rec.direccion || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-sm font-medium ${dias > 30 ? "text-primary" : "text-foreground"}`}>
                        {dias} días
                      </span>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={assignmentMap[rec.id] || "none"}
                        onValueChange={(val) => {
                          setAssignmentMap((prev) => ({
                            ...prev,
                            [rec.id]: val === "none" ? null : val,
                          }));
                        }}
                      >
                        <SelectTrigger className="w-[160px] ml-auto h-8 text-xs">
                          <SelectValue>
                            {assignedName || (
                              <span className="text-muted-foreground">Sin asignar</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {vendedores.map((v) => (
                            <SelectItem key={v.id} value={v.id}>{toTitleCase(v.nombre)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {unassignedCount} clientes sin asignar
        </p>
        {renderPagination()}
        <p className="text-sm text-muted-foreground">
          {unassignedCount} clientes sin asignar
        </p>
      </div>
    </div>
  );
};

export default TableAssignment;
