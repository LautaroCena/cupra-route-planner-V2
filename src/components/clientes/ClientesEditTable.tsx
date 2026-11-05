import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Pencil, ChevronLeft, ChevronRight, MapPin, MapPinOff } from "lucide-react";
import type { ClienteEditable } from "@/pages/ClientesEdicion";

interface ClientesEditTableProps {
  clientes: ClienteEditable[];
  onEdit: (cliente: ClienteEditable) => void;
}

const ITEMS_PER_PAGE = 50;

export const ClientesEditTable = ({ clientes, onEdit }: ClientesEditTableProps) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(clientes.length / ITEMS_PER_PAGE);

  const paginatedClientes = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return clientes.slice(start, end);
  }, [clientes, currentPage]);

  // Reset to page 1 when filter changes
  useMemo(() => {
    setCurrentPage(1);
  }, [clientes.length]);

  const formatTelefonos = (telefonos: string[] | null): string => {
    if (!telefonos || telefonos.length === 0) return "—";
    if (telefonos.length === 1) return telefonos[0];
    return `${telefonos[0]} (+${telefonos.length - 1})`;
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">Razón Social</TableHead>
                <TableHead className="font-semibold">Dirección</TableHead>
                <TableHead className="font-semibold">Barrio</TableHead>
                <TableHead className="font-semibold">Vendedor asignado</TableHead>
                <TableHead className="font-semibold">Teléfonos</TableHead>
                <TableHead className="font-semibold">Provincia</TableHead>
                <TableHead className="font-semibold text-center">Geo</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedClientes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No se encontraron clientes
                  </TableCell>
                </TableRow>
              ) : (
                paginatedClientes.map((cliente) => (
                  <TableRow key={cliente.client_id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{cliente.razon_social || "—"}</span>
                        {cliente.fantasia && (
                          <span className="text-xs text-muted-foreground">{cliente.fantasia}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cliente.direccion_principal || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cliente.barrio_principal || "—"}
                    </TableCell>
                    <TableCell>
                      {cliente.vendedor_actual || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatTelefonos(cliente.telefonos)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cliente.provincia_principal || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {cliente.has_location ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex justify-center">
                              <MapPin className="h-4 w-4 text-primary" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Ubicación geocodificada</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="destructive" 
                              className="text-xs px-1.5 py-0.5 cursor-pointer"
                              onClick={() => onEdit(cliente)}
                            >
                              <MapPinOff className="h-3 w-3 mr-1" />
                              Sin geo
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Sin coordenadas validadas. Haz clic para agregar.</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(cliente)}
                        className="h-8 w-8"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, clientes.length)} de {clientes.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
