import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Save } from "lucide-react";
import { Sucursal } from "@/types/sales";
import ClientDetailCard from "./ClientDetailCard";

interface PreselectionStepProps {
  recommendations: Sucursal[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onContinue: () => void;
  isSaving?: boolean;
  /** Cambia la visita por la siguiente mejor del mismo vendedor. */
  onReplace?: (id: string) => void;
  canReplace?: (id: string) => boolean;
}

const PreselectionStep = ({ 
  recommendations, 
  selectedIds, 
  onToggle, 
  onToggleAll,
  onContinue,
  isSaving = false,
  onReplace,
  canReplace,
}: PreselectionStepProps) => {
  const allSelected = recommendations.length > 0 && selectedIds.length === recommendations.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox
            id="seleccionar-recomendaciones"
            checked={allSelected}
            onCheckedChange={onToggleAll}
            className="h-4 w-4"
          />
          <label htmlFor="seleccionar-recomendaciones" className="text-sm font-medium cursor-pointer">
            {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
          </label>
          <Badge variant="secondary" className="text-xs">
            {selectedIds.length} de {recommendations.length} seleccionados
          </Badge>
        </div>
        
        <Button 
          onClick={onContinue} 
          disabled={selectedIds.length === 0 || isSaving}
          className="gap-2"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Guardando..." : "Confirmar asignaciones"}
        </Button>
      </div>

      <div className="space-y-3">
        {recommendations.map((recomendacion) => (
          <div key={recomendacion.id} className="space-y-1">
            <ClientDetailCard
              cliente={recomendacion}
              isSelected={selectedIds.includes(recomendacion.id)}
              onToggle={onToggle}
            />
            {onReplace && canReplace?.(recomendacion.id) && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => onReplace(recomendacion.id)}>
                  <RefreshCw className="w-3.5 h-3.5" /> Reemplazar por la siguiente mejor
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PreselectionStep;
