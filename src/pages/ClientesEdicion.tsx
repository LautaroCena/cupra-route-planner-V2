import { useEffect, useState, useMemo } from "react";
import { isAssignorLike, canViewSalesDashboard } from "@/lib/roles";
import AppNav from "@/components/AppNav";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Filter, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import cupraLogo from "@/assets/cupra-logo-new.png";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ClientesEditTable } from "@/components/clientes/ClientesEditTable";
import { EditClienteSheet } from "@/components/clientes/EditClienteSheet";

export interface ClienteEditable {
  client_id: string;
  razon_social: string | null;
  fantasia: string | null;
  cuit_dni: string | null;
  telefonos: string[] | null;
  emails: string[] | null;
  vendedor_actual: string | null;
  vendedor_sugerido: string | null;
  requiere_visita: string | null;
  excluir_recomendaciones: boolean | null;
  motivo_exclusion: string | null;
  provincia_principal: string | null;
  ciudad_principal: string | null;
  barrio_principal: string | null;
  direccion_principal: string | null;
  has_location: boolean; // Indica si tiene registro en client_places
}

const ClientesEdicion = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clientesData, setClientesData] = useState<ClienteEditable[]>([]);
  
  // Filtros
  const [selectedProvincia, setSelectedProvincia] = useState<string>("all");
  const [selectedVendedor, setSelectedVendedor] = useState<string>("all");
  const [selectedDireccion, setSelectedDireccion] = useState<string>("all");
  const [selectedUbicacion, setSelectedUbicacion] = useState<string>("all"); // "all", "with", "without"
  const [searchTerm, setSearchTerm] = useState<string>("");
  
  // Estado para edición
  const [editingCliente, setEditingCliente] = useState<ClienteEditable | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkAuthAndFetchData();
  }, []);

  const checkAuthAndFetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('rol')
        .eq('user_id', session.user.id)
        .single();

      if (!canViewSalesDashboard(profile?.rol)) {
        toast({
          title: "Acceso denegado",
          description: "No tienes permisos para acceder a esta página",
          variant: "destructive",
        });
        navigate('/');
        return;
      }

      await fetchClientes();
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Error al cargar los datos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchClientes = async () => {
    // Obtener clientes
    const { data: clientesRaw, error: clientesError } = await supabase
      .from('clientes')
      .select(`
        client_id, razon_social, fantasia, cuit_dni,
        telefonos, emails, vendedor_actual, vendedor_sugerido,
        requiere_visita, excluir_recomendaciones, motivo_exclusion,
        provincia_principal, ciudad_principal, barrio_principal, direccion_principal
      `)
      .order('razon_social');

    if (clientesError) {
      console.error('Error fetching clientes:', clientesError);
      return;
    }

    // Obtener client_ids que tienen ubicación en client_places
    const { data: placesData, error: placesError } = await supabase
      .from('client_places')
      .select('client_id')
      .eq('is_primary', true);

    if (placesError) {
      console.error('Error fetching client_places:', placesError);
    }

    // Crear set de client_ids con ubicación
    const clientsWithLocation = new Set(placesData?.map(p => p.client_id) || []);

    // Mapear clientes con has_location
    const clientesConUbicacion = (clientesRaw || []).map(cliente => ({
      ...cliente,
      has_location: clientsWithLocation.has(cliente.client_id),
    }));
    
    setClientesData(clientesConUbicacion);
  };

  // Helper: normalizar strings para comparación case-insensitive
  const normalize = (str: string | null | undefined): string => {
    return str ? str.trim().toLowerCase().replace(/\s+/g, ' ') : '';
  };

  // Opciones únicas para filtros
  const provincias = useMemo(() => {
    const provinciasMap = new Map<string, string>();
    clientesData.forEach(cliente => {
      if (cliente.provincia_principal) {
        const key = normalize(cliente.provincia_principal);
        if (!provinciasMap.has(key)) {
          provinciasMap.set(key, cliente.provincia_principal);
        }
      }
    });
    return Array.from(provinciasMap.values()).sort();
  }, [clientesData]);

  const vendedores = useMemo(() => {
    const uniqueVendedores = new Set<string>();
    clientesData.forEach(cliente => {
      if (cliente.vendedor_actual) uniqueVendedores.add(cliente.vendedor_actual);
      if (cliente.vendedor_sugerido) uniqueVendedores.add(cliente.vendedor_sugerido);
    });
    return Array.from(uniqueVendedores).sort();
  }, [clientesData]);

  const direcciones = useMemo(() => {
    const direccionesMap = new Map<string, string>();
    clientesData.forEach(cliente => {
      if (cliente.direccion_principal) {
        const key = normalize(cliente.direccion_principal);
        if (!direccionesMap.has(key)) {
          direccionesMap.set(key, cliente.direccion_principal);
        }
      }
    });
    return Array.from(direccionesMap.values()).sort();
  }, [clientesData]);

  // Contador de clientes sin ubicación
  const clientesSinUbicacion = useMemo(() => {
    return clientesData.filter(c => !c.has_location).length;
  }, [clientesData]);

  // Datos filtrados
  const filteredData = useMemo(() => {
    return clientesData.filter(cliente => {
      // Provincia: "all" = todos, "__null__" = solo nulos, otro = ese valor
      const matchProvincia = selectedProvincia === "all" ||
        (selectedProvincia === "__null__" && !cliente.provincia_principal) ||
        (selectedProvincia !== "__null__" && normalize(cliente.provincia_principal) === normalize(selectedProvincia));
      
      // Vendedor: misma lógica
      const matchVendedor = selectedVendedor === "all" ||
        (selectedVendedor === "__null__" && !cliente.vendedor_actual) ||
        (selectedVendedor !== "__null__" && cliente.vendedor_actual === selectedVendedor);
      
      // Dirección: nuevo filtro
      const matchDireccion = selectedDireccion === "all" ||
        (selectedDireccion === "__null__" && !cliente.direccion_principal) ||
        (selectedDireccion !== "__null__" && normalize(cliente.direccion_principal) === normalize(selectedDireccion));
      
      // Ubicación: filtro por has_location
      const matchUbicacion = selectedUbicacion === "all" ||
        (selectedUbicacion === "with" && cliente.has_location) ||
        (selectedUbicacion === "without" && !cliente.has_location);
      
      const matchSearch = searchTerm === "" || 
        (cliente.razon_social || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cliente.fantasia || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cliente.cuit_dni || "").toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchProvincia && matchVendedor && matchDireccion && matchUbicacion && matchSearch;
    });
  }, [clientesData, selectedProvincia, selectedVendedor, selectedDireccion, selectedUbicacion, searchTerm]);

  const handleEdit = (cliente: ClienteEditable) => {
    setEditingCliente(cliente);
    setSheetOpen(true);
  };

  const handleSave = async (changes: Partial<ClienteEditable>) => {
    if (!editingCliente) return;
    
    setSaving(true);
    try {
      // SOLO permitir estos campos
      const allowedFields = ['telefonos', 'emails', 'vendedor_actual'];
      const sanitizedChanges = Object.fromEntries(
        Object.entries(changes).filter(([key]) => allowedFields.includes(key))
      ) as Partial<Pick<Tables<'clientes'>, 'telefonos' | 'emails' | 'vendedor_actual'>>;
      
      const { error } = await supabase
        .from('clientes')
        .update(sanitizedChanges)
        .eq('client_id', editingCliente.client_id);
        
      if (error) throw error;
      
      toast({ 
        title: "Guardado", 
        description: "Datos actualizados correctamente" 
      });
      
      setSheetOpen(false);
      setEditingCliente(null);
      await fetchClientes();
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: "Error",
        description: "No se pudieron guardar los cambios",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedProvincia("all");
    setSelectedVendedor("all");
    setSelectedDireccion("all");
    setSelectedUbicacion("all");
    setSearchTerm("");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <img src={cupraLogo} alt="Cupra Logo" className="w-32 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppNav />
      <div className="max-w-[1920px] mx-auto space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate('/clientes-dashboard')}
              className="border-border/60"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-sans text-foreground tracking-tight">
                Editar Datos de Clientes
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Edición de datos comerciales y de contacto
              </p>
            </div>
          </div>
          <img src={cupraLogo} alt="Cupra Logo" className="h-10 md:h-12" />
        </div>

        {/* Panel de Filtros */}
        <Card className="matte-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Buscar Cliente
                </label>
                <Input
                  placeholder="Razón social, fantasía o CUIT..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Provincia
                </label>
                <Select value={selectedProvincia} onValueChange={setSelectedProvincia}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="__null__">— Sin provincia —</SelectItem>
                    {provincias.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Vendedor asignado
                </label>
                <Select value={selectedVendedor} onValueChange={setSelectedVendedor}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="__null__">— Sin asignar —</SelectItem>
                    {vendedores.map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Dirección
                </label>
                <Select value={selectedDireccion} onValueChange={setSelectedDireccion}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="__null__">— Sin dirección —</SelectItem>
                    {direcciones.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Estado Ubicación
                </label>
                <Select value={selectedUbicacion} onValueChange={setSelectedUbicacion}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="with">✅ Con ubicación</SelectItem>
                    <SelectItem value="without">📍 Sin ubicación ({clientesSinUbicacion})</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={handleClearFilters}
                  className="w-full"
                >
                  Limpiar filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Aviso de clientes sin geocodificar */}
        {clientesSinUbicacion > 0 && selectedUbicacion === "all" && (
          <div className="bg-muted/50 border border-border rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="font-medium">
                  {clientesSinUbicacion} clientes sin ubicación geocodificada
                </p>
                <p className="text-sm text-muted-foreground">
                  Estos clientes no tienen coordenadas validadas para el mapa
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setSelectedUbicacion("without")}
            >
              Ver clientes
            </Button>
          </div>
        )}

        {/* Contador y Tabla */}
        <Card className="matte-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Clientes ({filteredData.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ClientesEditTable 
              clientes={filteredData}
              onEdit={handleEdit}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sheet de Edición */}
      {editingCliente && (
        <EditClienteSheet
          cliente={editingCliente}
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false);
            setEditingCliente(null);
          }}
          onSave={handleSave}
          onLocationAdded={async () => {
            await fetchClientes();
            setSheetOpen(false);
            setEditingCliente(null);
          }}
          saving={saving}
          vendedores={vendedores}
        />
      )}
    </div>
  );
};

export default ClientesEdicion;
