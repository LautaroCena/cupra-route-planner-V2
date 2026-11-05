import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import BriefingVisita from "@/components/shared/BriefingVisita";
import DatosAl from "@/components/shared/DatosAl";
import { formatMonto } from "@/lib/format";
import { 
  DndContext, 
  DragEndEvent, 
  DragOverlay, 
  DragStartEvent, 
  PointerSensor, 
  useSensor, 
  useSensors,
  useDroppable,
  useDraggable
} from "@dnd-kit/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getGoogleMapsUrl } from "@/lib/utils";
import { MapPin, Phone, Building, TrendingUp, TrendingDown, Package, Mail, Navigation, Map as MapIcon, Columns, Plus, UserPlus, X, AlertTriangle, MoreHorizontal, UserCheck, Laptop, CircleSlash, CalendarClock, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ExcludeClientButton from "@/components/assignor/ExcludeClientButton";
import VendedorAssignmentsMap from "./VendedorAssignmentsMap";
import RecordatoriosCalendario from "./RecordatoriosCalendario";
import AgregarProspectoForm, { hasProspectoDraft } from "./AgregarProspectoForm";
import AutoAsignarDialog from "./AutoAsignarDialog";
import ProspectoFormModal from "./ProspectoFormModal";

export interface VendedorKanbanRef {
  focusAssignment: (assignmentId: string) => void;
}

export interface ClienteAsignado {
  id: string;
  client_id: string;
  estado: 'Por visitar' | 'Visitado';
  razon_social: string;
  cuit_dni: string;
  barrio_principal?: string;
  dias_desde_ultima_compra?: number;
  // Información de contacto y ubicación
  ciudad_principal?: string;
  provincia_principal?: string;
  direccion_principal?: string;
  todas_direcciones?: string[];
  todas_ciudades?: string[];
  todos_barrios?: string[];
  // Información comercial
  primera_compra?: string;
  ultima_compra?: string;
  cantidad_ordenes?: number;
  monto_total_historico?: number;
  ticket_promedio?: number;
  categoria_recencia?: string;
  categoria_volumen?: string;
  score_recencia?: number;
  score_volumen?: number;
  score_comercial?: number;
  participacion_mercado?: number;
  // Productos y vendedores
  productos_comprados?: string[];
  todos_vendedores?: string[];
  etiquetas?: string[];
  canal?: string;
  // Información de contacto adicional
  telefonos?: string[];
  emails?: string[];
  // Link de Google Maps
  google_maps_link?: string;
  prospecto_place_id?: string;
  // Información de prospectos
  website?: string;
  rating?: number;
  nivel_precio?: string;
  // Origen de la asignación
  origen_asignacion: 'auto' | 'asignador';
  // Fecha de creación de la asignación (para alertas)
  created_at?: string;
  // Coordenadas directas para prospectos manuales
  rubro?: string | null;
  prospecto_latitud?: number;
  prospecto_longitud?: number;
}

interface ClienteInfo {
  razon_social: string;
  cuit_dni: string;
  // Scores
  score_comercial?: string;
  score_recencia?: string;
  score_volumen?: string;
  score_volumen_num?: number;
  score_recencia_num?: number;
  priority_score?: number;
  // Ubicación
  provincias?: string[];
  ciudades?: string[];
  telefonos?: string[];
  // Ventas
  orders_count?: number;
  monto_total_vendido?: number;
  avg_ticket?: number;
  participacion?: number;
  // Fechas
  first_purchase_at?: string;
  last_purchase_at?: string;
  days_since_last_purchase?: number;
  // Productos y vendedores
  etiquetas?: string[];
  vendedores?: string[];
  // Feedback
  ultimo_feedback?: string;
}

// Mobile-specific card component
const MobileClientCard = ({ 
  cliente, 
  onInfoClick,
  onMarkVisited,
}: { 
  cliente: ClienteAsignado; 
  onInfoClick: () => void;
  onMarkVisited?: () => void;
}) => {
  const esProspecto = cliente.etiquetas?.includes('Prospecto');
  const diasAbierto = cliente.created_at 
    ? Math.floor((Date.now() - new Date(cliente.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const mostrarAlertaPendiente = diasAbierto >= 2 && cliente.estado === 'Por visitar';
  
  return (
    <Card 
      id={`assignment-${cliente.id}`}
      className="p-3"
    >
      <div className="flex items-start gap-3">
        {/* Contenido clickeable para info */}
        <div 
          className="flex-1 min-w-0 cursor-pointer" 
          onClick={onInfoClick}
        >
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-sm truncate">{cliente.razon_social}</h4>
            {esProspecto && <Badge variant="secondary" className="text-xs shrink-0">NUEVO</Badge>}
          </div>
          
          {cliente.canal && esProspecto && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Building className="w-3 h-3 shrink-0" />
              <span className="truncate">{cliente.canal}</span>
            </p>
          )}
          
          {cliente.barrio_principal && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{cliente.barrio_principal}</span>
            </p>
          )}
          
          {cliente.telefonos?.[0] && (
            <a 
              href={`tel:${cliente.telefonos[0]}`}
              className="text-xs text-primary flex items-center gap-1 mt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="w-3 h-3 shrink-0" />
              {cliente.telefonos[0]}
            </a>
          )}
          
          {mostrarAlertaPendiente && (
            <div className="flex items-center gap-1.5 mt-2 p-1.5 bg-amber-50 dark:bg-amber-950/30 rounded text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-medium">{diasAbierto} días sin cerrar</span>
            </div>
          )}
        </div>
        
        {/* Botón para marcar visitado (alternativa táctil al drag) */}
        {onMarkVisited && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onMarkVisited();
            }}
            className="shrink-0 h-8 px-3"
          >
            Marcar ✓
          </Button>
        )}
      </div>
    </Card>
  );
};

const VendedorKanban = forwardRef<VendedorKanbanRef, object>(function VendedorKanban(_props, ref) {
  const [viewMode, setViewMode] = useState<'kanban' | 'map' | 'calendar'>('kanban');
  const [desasignarTarget, setDesasignarTarget] = useState<ClienteAsignado | null>(null);
  const [mobileActiveTab, setMobileActiveTab] = useState<'Por visitar' | 'Visitado'>('Por visitar');
  const [assignments, setAssignments] = useState<Record<string, ClienteAsignado[]>>({
    'Por visitar': [],
    'Visitado': [],
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<ClienteAsignado | null>(null);
  const [clienteInfo, setClienteInfo] = useState<ClienteInfo | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [tipoCierre, setTipoCierre] = useState<'visitado' | 'online' | 'no_visitado' | ''>('');
  const [motivoNoVisita, setMotivoNoVisita] = useState("");
  const [tipoInteraccion, setTipoInteraccion] = useState("");
  const [estadoCliente, setEstadoCliente] = useState("");
  const [recordatorioActivo, setRecordatorioActivo] = useState(false);
  const [recordatorioFecha, setRecordatorioFecha] = useState("");
  const [recordatorioNota, setRecordatorioNota] = useState("");
  const [showAgregarProspecto, setShowAgregarProspecto] = useState(false);
  useEffect(() => {
    let mounted=true;
    supabase.auth.getUser().then(({data})=>{ if(mounted && data.user) setShowAgregarProspecto(hasProspectoDraft(data.user.id)); });
    return ()=>{mounted=false;};
  }, []);
  const [showAutoAsignar, setShowAutoAsignar] = useState(false);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetchAsignaciones();
  }, []);

  const fetchAsignaciones = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Obtener asignaciones del vendedor (ocultando las agendadas para días futuros)
      const hoyAR = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: asignaciones, error } = await supabase
        .from('asignaciones_vendedores_clientes')
        .select('*')
        .eq('vendedor_id', user.id)
        .or(`fecha_programada.is.null,fecha_programada.lte.${hoyAR}`);

      if (error) throw error;

      // Separar clientes y prospectos
      const clienteAsignaciones = asignaciones?.filter(a => !a.es_prospecto) || [];
      const prospectoAsignaciones = asignaciones?.filter(a => a.es_prospecto) || [];

      // Obtener información de clientes
      const clientIds = [...new Set(clienteAsignaciones.map(a => a.client_id))];
      let clientesData: any[] = [];
      
      if (clientIds.length > 0) {
        const { data, error: clientesError } = await supabase
          .from('clientes')
          .select(`
            razon_social,
            cuit_dni,
            barrio_principal,
            dias_desde_ultima_compra,
            ciudad_principal,
            provincia_principal,
            direccion_principal,
            todas_direcciones,
            todas_ciudades,
            todos_barrios,
            primera_compra,
            ultima_compra,
            cantidad_ordenes,
            monto_total_historico,
            ticket_promedio,
            categoria_recencia,
            categoria_volumen,
            score_recencia,
            score_volumen,
            score_comercial,
            participacion_mercado,
            productos_comprados,
            todos_vendedores,
            etiquetas,
            canal,
            telefonos,
            emails,
            client_id
          `)
          .in('client_id', clientIds);

        if (clientesError) throw clientesError;
        clientesData = data || [];
      }

      // Obtener información de prospectos
      const prospectoIds = [...new Set(prospectoAsignaciones.map(a => a.prospecto_place_id))];
      let prospectosData: any[] = [];
      
      if (prospectoIds.length > 0) {
        const { data, error: prospectosError } = await supabase
          .from('prospectos')
          .select('*')
          .in('place_id', prospectoIds);

        if (prospectosError) throw prospectosError;
        prospectosData = data || [];
      }

      // Obtener google_maps_link de client_places para clientes
      const { data: placesData } = await supabase
        .from('client_places')
        .select('client_id, google_maps_link')
        .in('client_id', clientIds)
        .eq('is_primary', true);

      const placesMap = new Map<string, string | null>();
      (placesData || []).forEach(p => {
        if (p.google_maps_link) {
          placesMap.set(p.client_id, p.google_maps_link);
        }
      });

      // Crear mapas para acceso rápido
      const clientesMap = new Map<string, any>();
      clientesData.forEach(c => clientesMap.set(c.client_id, c));
      
      const prospectosMap = new Map<string, any>();
      prospectosData.forEach(p => prospectosMap.set(p.place_id, p));

      // Agrupar por estado
      const grouped: Record<string, ClienteAsignado[]> = {
        'Por visitar': [],
        'Visitado': [],
      };

      // Procesar clientes
      clienteAsignaciones.forEach((asig: any) => {
        const clienteData = clientesMap.get(asig.client_id);
        if (!clienteData) return;

        const estado = asig.estado === 'Asignado' ? 'Por visitar' : asig.estado;
        
        const cliente: ClienteAsignado = {
          id: asig.id,
          client_id: asig.client_id,
          estado: estado as 'Por visitar' | 'Visitado',
          razon_social: clienteData.razon_social || 'Sin nombre',
          cuit_dni: clienteData.cuit_dni || '',
          barrio_principal: clienteData.barrio_principal,
          dias_desde_ultima_compra: clienteData.dias_desde_ultima_compra,
          ciudad_principal: clienteData.ciudad_principal,
          provincia_principal: clienteData.provincia_principal,
          direccion_principal: clienteData.direccion_principal,
          todas_direcciones: clienteData.todas_direcciones,
          todas_ciudades: clienteData.todas_ciudades,
          todos_barrios: clienteData.todos_barrios,
          primera_compra: clienteData.primera_compra,
          ultima_compra: clienteData.ultima_compra,
          cantidad_ordenes: clienteData.cantidad_ordenes,
          monto_total_historico: clienteData.monto_total_historico,
          ticket_promedio: clienteData.ticket_promedio,
          categoria_recencia: clienteData.categoria_recencia,
          categoria_volumen: clienteData.categoria_volumen,
          score_recencia: clienteData.score_recencia,
          score_volumen: clienteData.score_volumen,
          score_comercial: clienteData.score_comercial,
          participacion_mercado: clienteData.participacion_mercado,
          productos_comprados: clienteData.productos_comprados,
          todos_vendedores: clienteData.todos_vendedores,
          etiquetas: clienteData.etiquetas,
          canal: clienteData.canal,
          telefonos: clienteData.telefonos,
          emails: clienteData.emails,
          google_maps_link: placesMap.get(asig.client_id) || undefined,
          origen_asignacion: asig.origen_asignacion || 'asignador',
          created_at: asig.created_at,
        };
        grouped[estado].push(cliente);
      });

      // Procesar prospectos
      prospectoAsignaciones.forEach((asig: any) => {
        const prospectoData = prospectosMap.get(asig.prospecto_place_id);
        if (!prospectoData) return;

        const estado = asig.estado === 'Asignado' ? 'Por visitar' : asig.estado;
        
        const prospecto: ClienteAsignado = {
          id: asig.id,
          client_id: `prospecto-${asig.prospecto_place_id}`, // ID único para prospectos
          estado: estado as 'Por visitar' | 'Visitado',
          razon_social: prospectoData.nombre || 'Prospecto sin nombre',
          cuit_dni: '',
          barrio_principal: prospectoData.barrio || prospectoData.comuna,
          dias_desde_ultima_compra: undefined,
          ciudad_principal: prospectoData.ciudad,
          provincia_principal: prospectoData.provincia,
          direccion_principal: prospectoData.direccion,
          todas_direcciones: [prospectoData.direccion],
          todas_ciudades: [prospectoData.ciudad],
          todos_barrios: prospectoData.barrio ? [prospectoData.barrio] : [],
          primera_compra: undefined,
          ultima_compra: undefined,
          cantidad_ordenes: 0,
          monto_total_historico: 0,
          ticket_promedio: 0,
          categoria_recencia: 'Prospecto Nuevo',
          categoria_volumen: 'Prospecto',
          score_recencia: 0,
          score_volumen: 0,
          score_comercial: 0,
          participacion_mercado: 0,
          productos_comprados: [],
          todos_vendedores: [],
          etiquetas: ['Prospecto'],
          canal: prospectoData.tipo_principal || 'Prospecto',
          telefonos: prospectoData.telefono ? [prospectoData.telefono] : [],
          emails: [],
          prospecto_place_id: prospectoData.place_id,
          website: prospectoData.website,
          rating: prospectoData.rating,
          nivel_precio: prospectoData.nivel_precio,
          origen_asignacion: asig.origen_asignacion || 'asignador',
          created_at: asig.created_at,
          // Coordenadas directas para prospectos manuales
          rubro: prospectoData.rubro,
          prospecto_latitud: prospectoData.latitud,
          prospecto_longitud: prospectoData.longitud,
        };
        grouped[estado].push(prospecto);
      });

      console.log("Assignments", grouped);

      // Mismo orden del recorrido calculado; lo manual queda después, por antigüedad.
      const ordenPorAsignacion = new Map((asignaciones || []).map((a: any) => [a.id, a.orden_ruta ?? Number.MAX_SAFE_INTEGER]));
      grouped['Por visitar'].sort((a, b) => (ordenPorAsignacion.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (ordenPorAsignacion.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        || String(a.created_at || '').localeCompare(String(b.created_at || '')));
      setAssignments(grouped);
    } catch (error) {
      console.error('Error fetching asignaciones:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al cargar las asignaciones",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) {
      setActiveId(null);
      return;
    }

    const activeId = active.id as string;
    const newEstado = over.id as 'Por visitar' | 'Visitado';

    // Encontrar de qué columna viene
    let fromColumn: string | null = null;
    let movedCliente: ClienteAsignado | null = null;

    for (const [columnId, clientes] of Object.entries(assignments)) {
      const found = clientes.find(c => c.id === activeId);
      if (found) {
        fromColumn = columnId;
        movedCliente = found;
        break;
      }
    }

    if (fromColumn && movedCliente && fromColumn !== newEstado) {
      // Si se mueve a "Visitado", abrir dialog de feedback
      if (newEstado === 'Visitado') {
        setSelectedCliente(movedCliente);
        setShowFeedbackDialog(true);
        setActiveId(null);
        return;
      }

      // Actualizar UI optimistamente
      setAssignments(prev => ({
        ...prev,
        [fromColumn]: prev[fromColumn].filter(c => c.id !== activeId),
        [newEstado]: [...prev[newEstado], { ...movedCliente!, estado: newEstado }],
      }));

      // Actualizar en la base de datos
      try {
        const { error } = await supabase
          .from('asignaciones_vendedores_clientes')
          .update({ estado: newEstado })
          .eq('id', activeId);

        if (error) throw error;

        toast({
          title: "Estado actualizado",
          description: `Cliente movido a "${newEstado}"`,
        });
      } catch (error) {
        console.error('Error updating estado:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Error al actualizar el estado",
        });
        // Revertir cambio en caso de error
        fetchAsignaciones();
      }
    }

    setActiveId(null);
  };

  // Handler for mobile "Marcar ✓" button - reuses the same flow as drag & drop
  const handleMobileMarkVisited = (cliente: ClienteAsignado) => {
    setSelectedCliente(cliente);
    setShowFeedbackDialog(true);
  };

  const handleCardClick = async (cliente: ClienteAsignado) => {
    setSelectedCliente(cliente);
    setShowInfoDialog(true);
    
    // Ya no necesitamos hacer una query adicional porque tenemos toda la info
    // Solo buscamos el último feedback
    try {
      const { data: feedbackData } = await supabase
        .from('cliente_feedbacks')
        .select('feedback')
        .eq('client_id', cliente.client_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const info: ClienteInfo = {
        razon_social: cliente.razon_social,
        cuit_dni: cliente.cuit_dni,
        ultimo_feedback: feedbackData?.feedback,
      };

      setClienteInfo(info);
    } catch (error) {
      console.error('Error fetching feedback:', error);
    }
  };

  // Exponer función para enfocar una asignación desde notificaciones
  useImperativeHandle(ref, () => ({
    focusAssignment: (assignmentId: string) => {
      // Buscar la asignación en todas las columnas
      for (const [_, clientes] of Object.entries(assignments)) {
        const found = clientes.find(c => c.id === assignmentId);
        if (found) {
          // Abrir el diálogo de información del cliente
          handleCardClick(found);
          
          // Scroll al elemento si está visible
          setTimeout(() => {
            const element = document.getElementById(`assignment-${assignmentId}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
              setTimeout(() => {
                element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
              }, 2000);
            }
          }, 100);
          return;
        }
      }
      
      toast({
        variant: "destructive",
        title: "Asignación no encontrada",
        description: "La asignación puede haber sido completada o eliminada.",
      });
    }
  }), [assignments, toast]);

  const handleSaveFeedback = async () => {
    if (!selectedCliente || !feedback.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor ingrese un comentario",
      });
      return;
    }

    if (feedback.length > 400) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "El comentario no puede exceder 400 caracteres",
      });
      return;
    }

    if (!tipoCierre) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor seleccione el tipo de cierre",
      });
      return;
    }

    if (tipoCierre === 'no_visitado' && !motivoNoVisita) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor seleccione el motivo de la no visita",
      });
      return;
    }

    if ((tipoCierre === 'visitado' || tipoCierre === 'online') && !tipoInteraccion) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor seleccione el tipo de interacción",
      });
      return;
    }

    setIsSavingFeedback(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      // Determinar si es prospecto y preparar datos para feedback
      const esProspecto = selectedCliente.etiquetas?.includes('Prospecto') || selectedCliente.client_id.startsWith('prospecto-');
      
      // Determinar si hubo contacto (visitado u online)
      const huboContacto = tipoCierre === 'visitado' || tipoCierre === 'online';
      
      // Preparar el objeto de feedback según si es cliente o prospecto
      const feedbackData: any = {
        vendedor_id: user.id,
        feedback: feedback.trim(),
        visita_realizada: huboContacto,
        motivo_no_visita: !huboContacto ? motivoNoVisita : null,
        tipo_interaccion: huboContacto ? `${tipoCierre === 'online' ? '[Online] ' : ''}${tipoInteraccion}` : null,
        estado_cliente: estadoCliente || null,
      };

      // Agregar el campo correcto según si es prospecto o cliente
      if (esProspecto) {
        // Extraer el place_id del client_id (formato: prospecto-{place_id})
        const placeId = selectedCliente.client_id.replace('prospecto-', '');
        feedbackData.prospecto_place_id = placeId;
      } else {
        feedbackData.client_id = selectedCliente.client_id;
      }

      // Guardar feedback
      const { data: feedbackInsertado, error: feedbackError } = await supabase
        .from('cliente_feedbacks')
        .insert(feedbackData)
        .select('id')
        .maybeSingle();

      if (feedbackError) throw feedbackError;

      // Interpretación estructurada del comentario (no bloqueante: si falla, el
      // motor sigue usando el parser de texto de siempre).
      if (feedbackInsertado?.id) {
        supabase.functions
          .invoke('extract-feedback', { body: { feedback_id: feedbackInsertado.id } })
          .catch((err) => console.error('extract-feedback:', err));
      }
      
      // Si es prospecto y se concretó una venta, marcarlo como cliente
      if (huboContacto && esProspecto && tipoInteraccion === "Venta Concretada") {
        const placeId = selectedCliente.client_id.replace('prospecto-', '');
        const { error: prospectoUpdateError } = await supabase
          .from('prospectos')
          .update({ es_cliente_cupra: true })
          .eq('place_id', placeId);

        if (prospectoUpdateError) {
          console.error('Error actualizando prospecto:', prospectoUpdateError);
        }
      }
      
      if (huboContacto && !esProspecto) {
        const { error: clienteUpdateError } = await supabase
          .from('clientes')
          .update({ ultima_visita: new Date().toISOString() })
          .eq('client_id', selectedCliente.client_id);

        if (clienteUpdateError) {
          console.error('Error updating cliente:', clienteUpdateError);
          // No lanzamos el error para que el feedback se guarde de todos modos
        }
      }

      // Actualizar estado a "Visitado" y registrar momento de visita
      const { error: updateError } = await supabase
        .from('asignaciones_vendedores_clientes')
        .update({ 
          estado: 'Visitado',
          visited_at: new Date().toISOString()
        })
        .eq('id', selectedCliente.id);

      if (updateError) throw updateError;

      // Actualizar UI
      setAssignments(prev => {
        const fromColumn = Object.entries(prev).find(([_, clientes]) => 
          clientes.some(c => c.id === selectedCliente.id)
        )?.[0];

        if (!fromColumn) return prev;

        return {
          ...prev,
          [fromColumn]: prev[fromColumn].filter(c => c.id !== selectedCliente.id),
          'Visitado': [...prev['Visitado'], { ...selectedCliente, estado: 'Visitado' }],
        };
      });

      toast({
        title: "Feedback guardado",
        description: huboContacto 
          ? (esProspecto && tipoInteraccion === "Venta Concretada" 
            ? "¡Venta concretada! El prospecto ha sido marcado como cliente y no volverá a aparecer en recomendaciones."
            : "El feedback ha sido guardado y la visita registrada. El cliente será recomendado en 15 días.")
          : "El feedback ha sido guardado. El cliente será recomendado nuevamente mañana.",
      });

      // Recordatorio calendarizado (opcional)
      if (recordatorioActivo && recordatorioFecha) {
        const recordatorio: any = {
          vendedor_id: user.id,
          titulo: `Seguimiento: ${selectedCliente.razon_social}`,
          nota: recordatorioNota || feedback.trim(),
          fecha_recordatorio: new Date(recordatorioFecha).toISOString(),
        };
        if (esProspecto) {
          recordatorio.prospecto_place_id = selectedCliente.client_id.replace('prospecto-', '');
        } else {
          recordatorio.client_id = selectedCliente.client_id;
        }
        const { error: recordatorioError } = await supabase.from('recordatorios').insert(recordatorio);
        if (recordatorioError) {
          console.error('Error creando recordatorio:', recordatorioError);
          toast({ variant: "destructive", title: "Recordatorio no guardado", description: "El feedback sí se guardó." });
        }
      }

      setShowFeedbackDialog(false);
      setFeedback("");
      setTipoCierre('');
      setMotivoNoVisita("");
      setTipoInteraccion("");
      setEstadoCliente("");
      setRecordatorioActivo(false);
      setRecordatorioFecha("");
      setRecordatorioNota("");
      setSelectedCliente(null);
    } catch (error) {
      console.error('Error saving feedback:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al guardar el feedback",
      });
    } finally {
      setIsSavingFeedback(false);
    }
  };

  const handleDesasignar = async (asignacion: ClienteAsignado) => {
    try {
      const { error } = await supabase
        .from('asignaciones_vendedores_clientes')
        .delete()
        .neq('estado', 'Visitado')
        .eq('id', asignacion.id);

      if (error) throw error;

      toast({
        title: "Asignación eliminada",
        description: `"${asignacion.razon_social}" fue quitado de tu lista`,
      });

      fetchAsignaciones();
    } catch (error) {
      console.error('Error al des-asignar:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la asignación",
      });
    }
  };

  const DraggableCard = ({ cliente }: { cliente: ClienteAsignado }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
      id: cliente.id,
    });

    const style = transform ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined;

    const esProspecto = cliente.etiquetas?.includes('Prospecto');
    const puedeDesasignar = cliente.origen_asignacion === 'auto' && cliente.estado !== 'Visitado';
    
    // Calcular días desde la asignación para mostrar alerta
    const diasAbierto = cliente.created_at 
      ? Math.floor((Date.now() - new Date(cliente.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const mostrarAlertaPendiente = diasAbierto >= 3 && cliente.estado !== 'Visitado';

    return (
      <div ref={setNodeRef} style={style} className="relative transition-all" id={`assignment-${cliente.id}`}>
        {/* Botón de des-asignar solo para auto-asignaciones que no están visitadas */}
        {puedeDesasignar && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute -top-1 -right-1 h-5 w-5 p-0 z-10 rounded-full bg-background border shadow-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation();
              setDesasignarTarget(cliente);
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        )}
        <Card 
          className={`p-3 cursor-move transition-all ${isDragging ? 'opacity-50' : 'hover-lift'}`}
          onClick={() => handleCardClick(cliente)}
        >
          <div className="space-y-2" {...listeners} {...attributes}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-sm flex-1">{cliente.razon_social}</h4>
                {esProspecto && (
                  <Badge variant="secondary" className="text-xs">NUEVO</Badge>
                )}
              </div>
              
              {esProspecto ? (
                // Card para prospectos - vista simple
                <>
                  {cliente.canal && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building className="w-3 h-3" />
                      {cliente.canal}
                    </p>
                  )}
                  {cliente.barrio_principal && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {cliente.barrio_principal}
                    </p>
                  )}
                </>
              ) : (
                // Card para clientes existentes
                <>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building className="w-3 h-3" />
                    {cliente.cuit_dni}
                  </p>
                  {cliente.telefonos && cliente.telefonos.length > 0 && (
                    <a 
                      href={`tel:${cliente.telefonos[0]}`}
                      className="text-xs text-primary flex items-center gap-1 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="w-3 h-3" />
                      {cliente.telefonos[0]}
                      {cliente.telefonos.length > 1 && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          +{cliente.telefonos.length - 1}
                        </Badge>
                      )}
                    </a>
                  )}
                  {cliente.emails && cliente.emails.length > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{cliente.emails[0]}</span>
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    {cliente.barrio_principal && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {cliente.barrio_principal}
                      </p>
                    )}
                    {cliente.dias_desde_ultima_compra !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        {cliente.dias_desde_ultima_compra} días sin compra
                      </Badge>
                    )}
                  </div>
                </>
              )}
              
              {/* Alerta de asignación pendiente */}
              {mostrarAlertaPendiente && (
                <div className="flex items-center gap-1.5 mt-2 p-1.5 bg-amber-50 dark:bg-amber-950/30 rounded text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="text-xs font-medium">{diasAbierto} días sin cerrar</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  };

  const ClientCard = ({ cliente }: { cliente: ClienteAsignado }) => {
    const esProspecto = cliente.etiquetas?.includes('Prospecto');

    return (
      <Card className="p-3">
        <div className="space-y-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm flex-1">{cliente.razon_social}</h4>
              {esProspecto && (
                <Badge variant="secondary" className="text-xs">NUEVO</Badge>
              )}
            </div>
            
            {esProspecto ? (
              <>
                {cliente.canal && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Building className="w-3 h-3" />
                    {cliente.canal}
                  </p>
                )}
                {cliente.barrio_principal && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {cliente.barrio_principal}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building className="w-3 h-3" />
                  {cliente.cuit_dni}
                </p>
                {cliente.telefonos && cliente.telefonos.length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {cliente.telefonos[0]}
                    {cliente.telefonos.length > 1 && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        +{cliente.telefonos.length - 1}
                      </Badge>
                    )}
                  </p>
                )}
                {cliente.emails && cliente.emails.length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{cliente.emails[0]}</span>
                  </p>
                )}
                <div className="flex items-center justify-between pt-1">
                  {cliente.barrio_principal && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {cliente.barrio_principal}
                    </p>
                  )}
                  {cliente.dias_desde_ultima_compra !== undefined && (
                    <Badge variant="outline" className="text-xs">
                      {cliente.dias_desde_ultima_compra} días sin compra
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </Card>
    );
  };

  const DroppableColumn = ({ 
    id, 
    title, 
    clientes 
  }: { 
    id: string; 
    title: string; 
    clientes: ClienteAsignado[];
  }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: id,
    });

    return (
      <Card className="flex-1 min-w-[280px]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{title}</span>
            <Badge variant="secondary">{clientes.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent 
          ref={setNodeRef}
          className={`space-y-2 md:min-h-[400px] md:max-h-[600px] md:overflow-y-auto transition-colors ${
            isOver ? 'bg-accent/10' : ''
          }`}
        >
          {clientes.map(cliente => (
            <DraggableCard key={cliente.id} cliente={cliente} />
          ))}
          {clientes.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Sin clientes
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Cargando asignaciones...</p>
      </div>
    );
  }

  const activeCliente = activeId 
    ? Object.values(assignments).flat().find(c => c.id === activeId)
    : null;

  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* Header responsive */}
      <div className="flex flex-col gap-4">
        {/* Título */}
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Mis Clientes Asignados</h2>
          <DatosAl />
          <p className="text-sm text-muted-foreground">
            {viewMode === 'kanban'
              ? 'Toca un cliente para ver detalles'
              : viewMode === 'map'
                ? 'Visualiza la ubicación de tus clientes'
                : 'Tus seguimientos agendados'}
          </p>
        </div>
        
        {/* Acciones - responsive */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Kanban/Mapa/Calendario - siempre visible (importante para operación) */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="rounded-r-none"
            >
              <Columns className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'map' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('map')}
              className="rounded-none"
            >
              <MapIcon className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('calendar')}
              className="rounded-l-none"
              title="Calendario de seguimientos"
            >
              <CalendarClock className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Botones de acción agrupados: mismo tamaño y forma */}
          <Button
            variant="default"
            onClick={() => setShowAgregarProspecto(true)}
            size="sm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Agregar Prospecto</span>
            <span className="sm:hidden">Prospecto</span>
          </Button>
          
          {/* Desktop: Auto-asignar visible */}
          <Button
            variant="outline"
            onClick={() => setShowAutoAsignar(true)}
            size="sm"
            className="gap-2 hidden md:flex"
          >
            <UserPlus className="w-4 h-4" />
            Auto-asignar
          </Button>
          
          {/* Mobile: Auto-asignar en menú overflow */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="md:hidden">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-background">
              <DropdownMenuItem onClick={() => setShowAutoAsignar(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Auto-asignar cliente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <>
          {/* DESKTOP: Kanban con drag & drop (md+) */}
          <div className="hidden md:block">
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-2 gap-4">
                <DroppableColumn id="Por visitar" title="Por visitar" clientes={assignments['Por visitar']} />
                <DroppableColumn id="Visitado" title="Visitado" clientes={assignments['Visitado']} />
              </div>
              <DragOverlay>
                {activeCliente ? <ClientCard cliente={activeCliente} /> : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* MOBILE: Tabs + Lista simple (<md) */}
          <div className="md:hidden">
            {/* Segmented control para cambiar estado */}
            <div className="flex border rounded-lg p-1 bg-muted mb-4">
              <button
                onClick={() => setMobileActiveTab('Por visitar')}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                  mobileActiveTab === 'Por visitar' 
                    ? 'bg-background shadow-sm' 
                    : 'text-muted-foreground'
                }`}
              >
                Por visitar ({assignments['Por visitar'].length})
              </button>
              <button
                onClick={() => setMobileActiveTab('Visitado')}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                  mobileActiveTab === 'Visitado' 
                    ? 'bg-background shadow-sm' 
                    : 'text-muted-foreground'
                }`}
              >
                Visitado ({assignments['Visitado'].length})
              </button>
            </div>
            
            {/* Lista - solo renderiza la activa */}
            <div className="space-y-3">
              {assignments[mobileActiveTab].length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {mobileActiveTab === 'Por visitar' 
                    ? 'Sin clientes por visitar' 
                    : 'Sin visitas completadas'}
                </p>
              ) : (
                assignments[mobileActiveTab].map(cliente => (
                  <MobileClientCard 
                    key={cliente.id} 
                    cliente={cliente}
                    onInfoClick={() => handleCardClick(cliente)}
                    onMarkVisited={mobileActiveTab === 'Por visitar' 
                      ? () => handleMobileMarkVisited(cliente) 
                      : undefined}
                  />
                ))
              )}
            </div>
          </div>
        </>
      ) : viewMode === 'map' ? (
        <VendedorAssignmentsMap assignments={assignments} />
      ) : (
        <RecordatoriosCalendario />
      )}

      {/* Dialog de información del cliente */}
      <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle className="flex-1">{selectedCliente?.razon_social}</DialogTitle>
              {selectedCliente?.etiquetas?.includes('Prospecto') && (
                <Badge variant="default" className="text-xs">NUEVO</Badge>
              )}
            </div>
            <DialogDescription>Información completa del cliente y contacto</DialogDescription>
          </DialogHeader>
          
          {selectedCliente && (
            <div className="space-y-6">
              {/* Botones de acción rápida */}
              <div className="flex flex-wrap gap-2">
                {getGoogleMapsUrl(selectedCliente.prospecto_place_id, selectedCliente.prospecto_latitud, selectedCliente.prospecto_longitud, [selectedCliente.direccion_principal, selectedCliente.ciudad_principal, "Argentina"].filter(Boolean).join(", ")) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const url = getGoogleMapsUrl(selectedCliente.prospecto_place_id, selectedCliente.prospecto_latitud, selectedCliente.prospecto_longitud, [selectedCliente.direccion_principal, selectedCliente.ciudad_principal, "Argentina"].filter(Boolean).join(", "));
                      if (url) window.open(url, '_blank');
                    }}
                  >
                    <Navigation className="w-4 h-4 mr-2" />
                    Ver en Mapa
                  </Button>
                )}
              </div>

              {/* Briefing de visita (qué ofrecer / cómo encarar) */}
              <BriefingVisita
                clientId={selectedCliente.client_id?.startsWith('prospecto-') ? null : selectedCliente.client_id}
                prospectoPlaceId={selectedCliente.prospecto_place_id || null}
              />


              {/* Información de contacto y ubicación */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Información de Contacto</h3>
                <div className="grid gap-3">
                  {selectedCliente.cuit_dni && (
                    <div className="flex items-start gap-2">
                      <Building className="w-4 h-4 mt-0.5 text-foreground/60" />
                      <div>
                        <p className="text-xs text-foreground/60">CUIT/DNI</p>
                        <p className="text-sm font-medium">{selectedCliente.cuit_dni}</p>
                      </div>
                    </div>
                  )}

                  {selectedCliente.direccion_principal && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 text-foreground/60" />
                      <div>
                        <p className="text-xs text-foreground/60">Dirección Principal</p>
                        <p className="text-sm font-medium">{selectedCliente.direccion_principal}</p>
                        {selectedCliente.barrio_principal && (
                          <p className="text-xs text-foreground/60">Barrio: {selectedCliente.barrio_principal}</p>
                        )}
                        {selectedCliente.ciudad_principal && selectedCliente.provincia_principal && (
                          <p className="text-xs text-foreground/60">
                            {selectedCliente.ciudad_principal}, {selectedCliente.provincia_principal}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedCliente.todas_direcciones && selectedCliente.todas_direcciones.length > 1 && (
                    <div className="pl-6">
                      <p className="text-xs font-medium text-foreground/60 mb-1">Otras direcciones:</p>
                      <div className="space-y-1">
                        {selectedCliente.todas_direcciones.slice(0, 3).map((dir, idx) => (
                          <p key={idx} className="text-xs">{dir}</p>
                        ))}
                      </div>
                     </div>
                   )}

                   {selectedCliente.telefonos && selectedCliente.telefonos.length > 0 && (
                     <div className="flex items-start gap-2">
                       <Phone className="w-4 h-4 mt-0.5 text-foreground/60" />
                       <div>
                         <p className="text-xs text-foreground/60">Teléfonos</p>
                         <div className="space-y-1">
                           {selectedCliente.telefonos.map((tel, idx) => (
                             <a 
                               key={idx}
                               href={`tel:${tel}`}
                               className="text-sm font-medium text-blue-400 hover:text-blue-300 hover:underline block"
                             >
                               {tel}
                             </a>
                           ))}
                         </div>
                       </div>
                     </div>
                   )}

                   {selectedCliente.website && (
                     <div className="flex items-start gap-2">
                       <span className="text-base mt-0.5">🌐</span>
                       <div>
                         <p className="text-xs text-foreground/60">Sitio Web</p>
                         <a 
                           href={selectedCliente.website.startsWith('http') ? selectedCliente.website : `https://${selectedCliente.website}`}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="text-sm font-medium text-blue-400 hover:text-blue-300 hover:underline"
                         >
                           {selectedCliente.website}
                         </a>
                       </div>
                     </div>
                   )}

                   {selectedCliente.rating && selectedCliente.rating > 0 && (
                     <div className="flex items-start gap-2">
                       <span className="text-base mt-0.5">⭐</span>
                       <div>
                         <p className="text-xs text-foreground/60">Valoración en Google</p>
                         <p className="text-sm font-medium">{selectedCliente.rating.toFixed(1)} estrellas</p>
                       </div>
                     </div>
                   )}

                   {selectedCliente.nivel_precio && (
                     <div className="flex items-start gap-2">
                       <span className="text-base mt-0.5">💰</span>
                       <div>
                         <p className="text-xs text-foreground/60">Nivel de Precio</p>
                         <p className="text-sm font-medium">{selectedCliente.nivel_precio}</p>
                       </div>
                     </div>
                   )}

                   {selectedCliente.canal && selectedCliente.etiquetas?.includes('Prospecto') && (
                     <div className="flex items-start gap-2">
                       <Building className="w-4 h-4 mt-0.5 text-foreground/60" />
                       <div>
                         <p className="text-xs text-foreground/60">Tipo de Negocio</p>
                         <p className="text-sm font-medium">{selectedCliente.canal}</p>
                       </div>
                     </div>
                   )}

                   {selectedCliente.emails && selectedCliente.emails.length > 0 && (
                     <div className="flex items-start gap-2">
                       <Mail className="w-4 h-4 mt-0.5 text-foreground/60" />
                       <div>
                         <p className="text-xs text-foreground/60">Emails</p>
                         <p className="text-sm font-medium">{selectedCliente.emails.join(', ')}</p>
                       </div>
                     </div>
                   )}
                 </div>
               </div>

               {/* Información comercial - solo mostrar si hay datos reales */}
              {(selectedCliente.cantidad_ordenes && selectedCliente.cantidad_ordenes > 0) || 
               (selectedCliente.monto_total_historico && selectedCliente.monto_total_historico > 0) ? (
              <div>
                <h3 className="text-sm font-semibold mb-3">Información Comercial</h3>
                <div className="grid grid-cols-2 gap-4">
                  {selectedCliente.cantidad_ordenes !== undefined && (
                    <div className="flex items-start gap-2">
                      <Package className="w-4 h-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-xs text-muted-foreground">Órdenes</p>
                        <p className="text-lg font-bold">{selectedCliente.cantidad_ordenes}</p>
                      </div>
                    </div>
                  )}
                  {selectedCliente.monto_total_historico !== undefined && (
                    <div className="flex items-start gap-2">
                      <TrendingUp className="w-4 h-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-xs text-muted-foreground">Total vendido</p>
                        <p className="text-lg font-bold">
                          {formatMonto(selectedCliente.monto_total_historico)}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedCliente.ticket_promedio !== undefined && (
                    <div className="flex items-start gap-2">
                      <TrendingDown className="w-4 h-4 text-muted-foreground mt-1" />
                      <div>
                        <p className="text-xs text-muted-foreground">Ticket promedio</p>
                        <p className="text-lg font-bold">
                          {formatMonto(selectedCliente.ticket_promedio)}
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedCliente.participacion_mercado !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Participación</p>
                      <p className="text-lg font-bold">{Number(selectedCliente.participacion_mercado).toFixed(2)}%</p>
                    </div>
                  )}
                  {selectedCliente.dias_desde_ultima_compra !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Última compra</p>
                      <p className="text-lg font-bold">hace {selectedCliente.dias_desde_ultima_compra} días</p>
                    </div>
                  )}
                  {selectedCliente.primera_compra && (
                    <div>
                      <p className="text-xs text-muted-foreground">Primera compra</p>
                      <p className="text-sm font-semibold">
                        {new Date(selectedCliente.primera_compra).toLocaleDateString('es-AR')}
                      </p>
                    </div>
                  )}
                 </div>
               </div>
              ) : null}

               {/* Scores */}
              {(selectedCliente.categoria_recencia || selectedCliente.categoria_volumen || selectedCliente.score_comercial) && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Scores</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {selectedCliente.score_comercial && (
                      <Badge variant="outline" className="justify-center py-2">
                        Comercial: {selectedCliente.score_comercial}
                      </Badge>
                    )}
                    {selectedCliente.categoria_recencia && (
                      <Badge variant="outline" className="justify-center py-2">
                        Recencia: {selectedCliente.categoria_recencia}
                      </Badge>
                    )}
                    {selectedCliente.categoria_volumen && (
                      <Badge variant="outline" className="justify-center py-2">
                        Volumen: {selectedCliente.categoria_volumen}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Vendedores previos */}
              {selectedCliente.todos_vendedores && selectedCliente.todos_vendedores.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Vendedores Previos</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedCliente.todos_vendedores.map((vendedor, idx) => (
                      <Badge key={idx} variant="secondary">
                        {vendedor}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Productos comprados */}
              {selectedCliente.productos_comprados && selectedCliente.productos_comprados.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Productos Comprados Habitualmente</h3>
                  <div className="max-h-32 overflow-y-auto bg-muted/50 rounded-lg p-3">
                    <div className="flex flex-wrap gap-1">
                      {selectedCliente.productos_comprados.map((producto, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {producto}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Etiquetas */}
              {selectedCliente.etiquetas && selectedCliente.etiquetas.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Etiquetas</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedCliente.etiquetas.map((etiqueta, idx) => (
                      <Badge key={idx} variant="secondary">
                        {etiqueta}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Último feedback */}
              {clienteInfo?.ultimo_feedback && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Último Feedback</h3>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm">{clienteInfo.ultimo_feedback}</p>
                  </div>
                </div>
              )}

              {/* Botón de exclusión */}
              <div className="pt-4 border-t">
                <ExcludeClientButton 
                  clientId={selectedCliente.client_id}
                  clientName={selectedCliente.razon_social}
                  onSuccess={() => {
                    setShowInfoDialog(false);
                    fetchAsignaciones();
                  }}
                  variant="destructive"
                  size="default"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de feedback */}
      <Dialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar Feedback de Visita</DialogTitle>
            <DialogDescription>
              Cliente: {selectedCliente?.razon_social}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Selector de tipo de cierre - 3 opciones visibles */}
            <div>
              <label className="text-sm font-medium mb-3 block">
                Tipo de Cierre <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'visitado', label: 'Visitado', Icon: UserCheck },
                  { value: 'online', label: 'Online', Icon: Laptop },
                  { value: 'no_visitado', label: 'No visitado', Icon: CircleSlash },
                ] as const).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTipoCierre(value)}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${
                      tipoCierre === value
                        ? 'border-accent bg-accent/10 text-accent font-medium'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mx-auto mb-1 ${tipoCierre === value ? 'text-accent' : 'text-accent/70'}`} />
                    <span className="text-sm">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Selector de motivo de no visita */}
            {tipoCierre === 'no_visitado' && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Motivo de la no visita <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['Cerrado', 'Cerrado definitivo', 'No me atendió', 'Otro motivo'].map((motivo) => (
                    <button
                      key={motivo}
                      type="button"
                      onClick={() => setMotivoNoVisita(motivo)}
                      className={`p-2 rounded-lg border text-sm text-center transition-all ${
                        motivoNoVisita === motivo 
                          ? 'border-primary bg-primary/10 text-primary font-medium' 
                          : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      {motivo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selector de tipo de interacción */}
            {(tipoCierre === 'visitado' || tipoCierre === 'online') && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Tipo de Interacción <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['Venta Concretada', 'Presupuesto enviado', 'Conversación / Seguimiento', 'No hubo interés'].map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setTipoInteraccion(tipo)}
                      className={`p-2 rounded-lg border text-sm text-center transition-all ${
                        tipoInteraccion === tipo 
                          ? 'border-primary bg-primary/10 text-primary font-medium' 
                          : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      {tipo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Estado del cliente */}
            <div>
              <label className="text-sm font-medium mb-2 flex items-center gap-2">
                <Flag className="w-4 h-4 text-accent" />
                Estado del cliente (opcional)
              </label>
              <div className="flex flex-wrap gap-2">
                {['Nuevo', 'En negociación', 'Interesado', 'Sin interés', 'Cliente activo', 'No contactable'].map((estado) => (
                  <button
                    key={estado}
                    type="button"
                    onClick={() => setEstadoCliente(estadoCliente === estado ? '' : estado)}
                    className={`px-3 py-1.5 rounded-full border text-xs transition-all ${
                      estadoCliente === estado
                        ? 'border-accent bg-accent/10 text-accent font-medium'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    {estado}
                  </button>
                ))}
              </div>
            </div>

            {/* Calendarizar seguimiento */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-accent" />
                  Calendarizar seguimiento
                </label>
                <Checkbox
                  checked={recordatorioActivo}
                  onCheckedChange={(v) => setRecordatorioActivo(v === true)}
                />
              </div>
              {recordatorioActivo && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Mañana', dias: 1 },
                      { label: 'En 3 días', dias: 3 },
                      { label: 'La semana que viene', dias: 7 },
                      { label: 'En 15 días', dias: 15 },
                    ].map(({ label, dias }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + dias);
                          d.setHours(9, 0, 0, 0);
                          const pad = (n: number) => String(n).padStart(2, '0');
                          setRecordatorioFecha(
                            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
                          );
                        }}
                        className="px-3 py-1.5 rounded-full border border-border text-xs hover:border-accent hover:text-accent transition-all"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="datetime-local"
                    value={recordatorioFecha}
                    onChange={(e) => setRecordatorioFecha(e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <Textarea
                    value={recordatorioNota}
                    onChange={(e) => setRecordatorioNota(e.target.value)}
                    placeholder="Nota del recordatorio (ej: llamar para cerrar pedido)"
                    className="min-h-[60px]"
                    maxLength={200}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                Comentario <span className="text-destructive">*</span>
              </label>
              <Textarea 
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Ingrese sus comentarios sobre la visita..."
                className="min-h-[100px]"
                maxLength={400}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {feedback.length}/400 caracteres
              </p>
            </div>
            
            <Button 
              onClick={handleSaveFeedback} 
              disabled={isSavingFeedback || !feedback.trim() || !tipoCierre || 
                (tipoCierre === 'no_visitado' && !motivoNoVisita) ||
                ((tipoCierre === 'visitado' || tipoCierre === 'online') && !tipoInteraccion)}
              className="w-full"
            >
              {isSavingFeedback ? 'Guardando...' : 'Guardar Feedback'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agregar prospecto - Drawer en mobile, Dialog en desktop */}
      <ProspectoFormModal
        open={showAgregarProspecto}
        onOpenChange={setShowAgregarProspecto}
        onSuccess={() => {
          setShowAgregarProspecto(false);
          fetchAsignaciones();
        }}
        onCancel={() => setShowAgregarProspecto(false)}
      />

      {/* Dialog de auto-asignar */}
      <AutoAsignarDialog
        open={showAutoAsignar}
        onOpenChange={setShowAutoAsignar}
        onSuccess={() => {
          fetchAsignaciones();
        }}
      />

      {/* Confirmación de des-asignación (solo auto-asignados) */}
      <AlertDialog
        open={!!desasignarTarget}
        onOpenChange={(open) => { if (!open) setDesasignarTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar de tu lista?</AlertDialogTitle>
            <AlertDialogDescription>
              {desasignarTarget?.razon_social} se va a quitar de tus asignaciones de hoy.
              Solo podés quitar visitas que te auto-asignaste vos; las del asignador quedan fijas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (desasignarTarget) handleDesasignar(desasignarTarget);
                setDesasignarTarget(null);
              }}
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

export default VendedorKanban;
