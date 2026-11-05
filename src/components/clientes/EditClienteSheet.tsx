import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, X, Loader2, Bot, MapPin, User, Phone, AlertTriangle } from "lucide-react";
import type { ClienteEditable } from "@/pages/ClientesEdicion";
import { GeocodificarClienteForm } from "./GeocodificarClienteForm";

interface EditClienteSheetProps {
  cliente: ClienteEditable;
  open: boolean;
  onClose: () => void;
  onSave: (changes: Partial<ClienteEditable>) => Promise<void>;
  onLocationAdded: () => Promise<void>;
  saving: boolean;
  vendedores: string[];
}

export const EditClienteSheet = ({
  cliente,
  open,
  onClose,
  onSave,
  onLocationAdded,
  saving,
  vendedores,
}: EditClienteSheetProps) => {
  // Estado local para campos editables
  const [telefonos, setTelefonos] = useState<string[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const [vendedorPrincipal, setVendedorPrincipal] = useState<string>("");
  const [newTelefono, setNewTelefono] = useState("");
  const [newEmail, setNewEmail] = useState("");
  
  // Estado para mostrar formulario de geocodificación
  const [showGeocodingForm, setShowGeocodingForm] = useState(false);

  // Inicializar estado cuando cambia el cliente
  useEffect(() => {
    setTelefonos(cliente.telefonos || []);
    setEmails(cliente.emails || []);
    setVendedorPrincipal(cliente.vendedor_actual || "");
    setNewTelefono("");
    setNewEmail("");
    setShowGeocodingForm(false);
  }, [cliente]);

  const handleAddTelefono = () => {
    if (newTelefono.trim() && !telefonos.includes(newTelefono.trim())) {
      setTelefonos([...telefonos, newTelefono.trim()]);
      setNewTelefono("");
    }
  };

  const handleRemoveTelefono = (index: number) => {
    setTelefonos(telefonos.filter((_, i) => i !== index));
  };

  const handleAddEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (email && !emails.includes(email)) {
      // Validación básica de email
      if (email.includes("@") && email.includes(".")) {
        setEmails([...emails, email]);
        setNewEmail("");
      }
    }
  };

  const handleRemoveEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({
      telefonos,
      emails,
      vendedor_actual: vendedorPrincipal || null,
    });
  };

  const hasChanges = 
    JSON.stringify(telefonos) !== JSON.stringify(cliente.telefonos || []) ||
    JSON.stringify(emails) !== JSON.stringify(cliente.emails || []) ||
    vendedorPrincipal !== (cliente.vendedor_actual || "");

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar Cliente</SheetTitle>
          <SheetDescription>
            Modifica los datos de contacto y comerciales
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* SECCIÓN: Identificación (Solo lectura) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Identificación
              </h3>
            </div>
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Razón Social</Label>
                <p className="text-sm font-medium">{cliente.razon_social || "—"}</p>
              </div>
              {cliente.fantasia && (
                <div>
                  <Label className="text-xs text-muted-foreground">Fantasía</Label>
                  <p className="text-sm font-medium">{cliente.fantasia}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">CUIT/DNI</Label>
                  <p className="text-sm font-medium">{cliente.cuit_dni || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Client ID</Label>
                  <p className="text-sm font-medium font-mono text-xs">{cliente.client_id}</p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* SECCIÓN: Datos Editables */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold uppercase tracking-wide">
                Contacto y Comercial
              </h3>
              <Badge variant="default" className="text-xs">Editable</Badge>
            </div>
            
            {/* Teléfonos */}
            <div className="space-y-2">
              <Label>Teléfonos</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {telefonos.map((tel, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary"
                    className="flex items-center gap-1 py-1 px-2"
                  >
                    {tel}
                    <button
                      type="button"
                      onClick={() => handleRemoveTelefono(idx)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {telefonos.length === 0 && (
                  <span className="text-sm text-muted-foreground">Sin teléfonos registrados</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Agregar teléfono..."
                  value={newTelefono}
                  onChange={(e) => setNewTelefono(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTelefono()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleAddTelefono}
                  disabled={!newTelefono.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Emails */}
            <div className="space-y-2">
              <Label>Emails</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {emails.map((email, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary"
                    className="flex items-center gap-1 py-1 px-2"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(idx)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {emails.length === 0 && (
                  <span className="text-sm text-muted-foreground">Sin emails registrados</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Agregar email..."
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleAddEmail}
                  disabled={!newEmail.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Vendedor asignado */}
            <div className="space-y-2">
              <Label>Vendedor asignado</Label>
              <Select 
                value={vendedorPrincipal || "__none__"} 
                onValueChange={(val) => setVendedorPrincipal(val === "__none__" ? "" : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar vendedor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {vendedores.map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Una venta de otro vendedor no cambia el asignado. Se cambia solo desde acá.
              </p>
              {cliente.vendedor_sugerido && (
                <p className="text-xs text-amber-600">
                  {cliente.vendedor_sugerido} le vendió varias veces en los últimos 90 días. Si ahora lo atiende
                  {" "}{cliente.vendedor_sugerido}, cambiá el asignado.
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* SECCIÓN: Automatización (Bloqueado) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Automatización
              </h3>
              <Badge variant="outline" className="text-xs">Automático</Badge>
            </div>
            <div className="bg-muted/30 rounded-lg p-4 border border-dashed space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox 
                  checked={cliente.requiere_visita === "Si"} 
                  disabled 
                  className="opacity-60"
                />
                <Label className="text-sm text-muted-foreground">Requiere Visita</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox 
                  checked={cliente.excluir_recomendaciones || false} 
                  disabled 
                  className="opacity-60"
                />
                <Label className="text-sm text-muted-foreground">Excluir de Recomendaciones</Label>
              </div>
              {cliente.motivo_exclusion && (
                <div>
                  <Label className="text-xs text-muted-foreground">Motivo de Exclusión</Label>
                  <p className="text-sm text-muted-foreground">{cliente.motivo_exclusion}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground italic">
                Estos campos son gestionados por automatizaciones
              </p>
            </div>
          </div>

          <Separator />

          {/* SECCIÓN: Ubicación */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Ubicación
              </h3>
              {cliente.has_location ? (
                <Badge variant="outline" className="text-xs">Geocodificado</Badge>
              ) : (
                <Badge variant="destructive" className="text-xs">Sin ubicación</Badge>
              )}
            </div>
            
            {/* Cliente CON ubicación: mostrar datos solo lectura */}
            {cliente.has_location && !showGeocodingForm && (
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Provincia</Label>
                    <p className="text-sm">{cliente.provincia_principal || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ciudad</Label>
                    <p className="text-sm">{cliente.ciudad_principal || "—"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Barrio</Label>
                    <p className="text-sm">{cliente.barrio_principal || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Dirección</Label>
                    <p className="text-sm">{cliente.direccion_principal || "—"}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  ✅ La ubicación está validada con coordenadas geográficas
                </p>
              </div>
            )}
            
            {/* Cliente SIN ubicación: mostrar alerta y botón */}
            {!cliente.has_location && !showGeocodingForm && (
              <div className="space-y-3">
                <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Este cliente no tiene coordenadas validadas. No aparecerá en mapas ni en recomendaciones geográficas.
                  </AlertDescription>
                </Alert>
                
                {/* Mostrar datos actuales (sin validar) si existen */}
                {(cliente.direccion_principal || cliente.barrio_principal || cliente.provincia_principal) && (
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2 border border-dashed">
                    <p className="text-xs text-muted-foreground font-medium">Datos actuales (sin validar):</p>
                    <div className="text-sm">
                      {cliente.direccion_principal && <p>{cliente.direccion_principal}</p>}
                      {cliente.barrio_principal && <p>{cliente.barrio_principal}</p>}
                      {(cliente.ciudad_principal || cliente.provincia_principal) && (
                        <p>{[cliente.ciudad_principal, cliente.provincia_principal].filter(Boolean).join(", ")}</p>
                      )}
                    </div>
                  </div>
                )}
                
                <Button
                  onClick={() => setShowGeocodingForm(true)}
                  className="w-full"
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  Agregar ubicación
                </Button>
              </div>
            )}
            
            {/* Formulario de geocodificación */}
            {showGeocodingForm && (
              <GeocodificarClienteForm
                clientId={cliente.client_id}
                razonSocial={cliente.razon_social}
                direccionActual={cliente.direccion_principal}
                ciudadActual={cliente.ciudad_principal}
                provinciaActual={cliente.provincia_principal}
                onSuccess={onLocationAdded}
                onCancel={() => setShowGeocodingForm(false)}
              />
            )}
          </div>
        </div>

        <SheetFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving || !hasChanges || showGeocodingForm}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar Cambios"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
