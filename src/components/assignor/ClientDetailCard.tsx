import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  MapPin, 
  Star, 
  Calendar, 
  Lightbulb, 
  ChevronDown, 
  ChevronUp,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Tag,
  Phone,
  Mail,
  Building2,
  AlertCircle
} from "lucide-react";
import { Sucursal } from "@/types/sales";
import ExcludeClientButton from "./ExcludeClientButton";
import { getGoogleMapsUrl } from "@/lib/utils";
import { formatMonto, toTitleCase } from "@/lib/format";
import { colorEstado, diasSinComprar, estadoDe, labelEstado } from "@/lib/segmentos";

/** Días sin comprar, medidos con el mismo criterio que el estado. */
const textoDias = (c: Parameters<typeof diasSinComprar>[0]) => {
  const dias = diasSinComprar(c);
  return dias === null ? "Sin compras" : `${dias} días sin comprar`;
};

interface ClientDetailCardProps {
  cliente: Sucursal;
  isSelected: boolean;
  onToggle: (id: string) => void;
  showCheckbox?: boolean;
  compact?: boolean;
}

const ClientDetailCard = ({ 
  cliente, 
  isSelected, 
  onToggle,
  showCheckbox = true,
  compact = false
}: ClientDetailCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatCurrency = (value?: number | null) => formatMonto(value, 'N/A');

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-AR');
  };


  // Versión compacta para Kanban
  if (compact) {
    return (
      <Card className="p-3 hover:shadow-md transition-shadow">
        <div className="space-y-2">
          <h3 className="font-semibold text-sm truncate">
            {cliente.fantasia || cliente.nombre || 'Sin nombre'}
          </h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            {cliente.direccion_principal || cliente.direccion || 'Sin dirección'}
            {cliente.barrio_principal && (
              <span className="text-accent font-medium">• {cliente.barrio_principal}</span>
            )}
          </p>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="text-xs whitespace-nowrap">
              <Calendar className="w-3 h-3 mr-1" />
              {textoDias(cliente)}
            </Badge>
          </div>
          {(cliente.vendedor_actual || cliente.vendedor_principal) && (
            <div className="text-xs text-muted-foreground">
              <p className="font-medium">
                Vendedor: {cliente.vendedor_actual || cliente.vendedor_principal}
              </p>
              {cliente.vendedor_actual && cliente.vendedor_principal && 
               cliente.vendedor_actual.toUpperCase() !== cliente.vendedor_principal.toUpperCase() && (
                <p className="text-orange-500 text-[10px]">
                  Anterior: {toTitleCase(cliente.vendedor_principal)}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="p-4 hover-lift transition-all"
    >
      <div className="flex items-start gap-4">
        {showCheckbox && (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggle(cliente.id)}
              className="mt-1"
            />
          </div>
        )}
        
        <div className="flex-1 space-y-3">
          {/* Header básico */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h3 className="font-sans font-semibold text-lg">{cliente.nombre}</h3>
              {cliente.fantasia && cliente.fantasia !== cliente.nombre && (
                <p className="text-sm text-muted-foreground">({cliente.fantasia})</p>
              )}
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {cliente.direccion_principal || cliente.direccion}
              </p>
              {cliente.cuit_dni && (
                <p className="text-xs text-muted-foreground">CUIT/DNI: {cliente.cuit_dni}</p>
              )}
              {/* Información de contacto */}
              <div className="mt-2 space-y-1">
                {cliente.telefonos && cliente.telefonos.length > 0 && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {cliente.telefonos.join(', ')}
                  </p>
                )}
                {cliente.emails && cliente.emails.length > 0 && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {cliente.emails.join(', ')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              {/* Estado comercial y rubro */}
              {(() => {
                const estado = (cliente as any).estado_cliente || estadoDe(cliente);
                const rubro = cliente.rubro || (cliente.factores_ia as any)?.rubro;
                const f = (cliente.factores_ia as any) || {};
                return (
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    <Badge style={{ backgroundColor: colorEstado(estado), color: "#fff" }} className="font-semibold">
                      {labelEstado(estado)}
                    </Badge>
                    {rubro && <Badge variant="outline">{rubro}</Badge>}
                    {f.fuera_de_zona && <Badge variant="outline" className="border-amber-500 text-amber-700">Fuera de la zona</Badge>}
                    {f.fuera_de_seleccion && <Badge variant="outline" className="border-amber-500 text-amber-700">Completa las 8</Badge>}
                  </div>
                );
              })()}
              {/* Badge especial para prospectos nuevos */}
              {(cliente.es_prospecto || cliente.etiquetas?.includes('NUEVO') || cliente.etiquetas?.includes('PROSPECTO')) ? (
                <Badge className="bg-blue-500 text-white hover:bg-blue-600 font-semibold">
                  🆕 PROSPECTO NUEVO
                </Badge>
              ) : (
                <>
                  <Badge variant={cliente.tipo_cliente === 'Premium' ? 'default' : 'secondary'}>
                    {cliente.tipo_cliente}
                  </Badge>
                  {cliente.canal && (
                    <Badge variant="outline">{cliente.canal}</Badge>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Métricas principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {cliente.es_prospecto ? (
              <>
                {/* Métricas para prospectos */}
                {cliente.tipo_negocio && (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-accent" />
                    <span>{cliente.tipo_negocio}</span>
                  </div>
                )}
                {cliente.rating !== undefined && cliente.rating > 0 && (
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-accent" />
                    <span>Rating: {cliente.rating.toFixed(1)}</span>
                  </div>
                )}
                {cliente.barrio_principal && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-accent" />
                    <span>{cliente.barrio_principal}</span>
                  </div>
                )}
                {cliente.website && (
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-accent" />
                    <a 
                      href={cliente.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-accent hover:text-accent/80 hover:underline transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Ver sitio web
                    </a>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Métricas para clientes existentes */}
                {cliente.score_comercial && (
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-accent" />
                    <span>Score: {cliente.score_comercial}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-accent" />
                  <span>{textoDias(cliente)}</span>
                </div>
                {cliente.cantidad_ordenes !== undefined && (
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-accent" />
                    <span>{cliente.cantidad_ordenes} órdenes</span>
                  </div>
                )}
                {cliente.ticket_promedio !== undefined && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-accent" />
                    <span>{formatCurrency(cliente.ticket_promedio)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Botón para Google Maps */}
          {getGoogleMapsUrl(cliente.place_id || cliente.prospecto_place_id, cliente.latitud, cliente.longitud) && (
            <a
              href={getGoogleMapsUrl(cliente.place_id || cliente.prospecto_place_id, cliente.latitud, cliente.longitud)!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors h-auto p-2 rounded-md hover:bg-accent/10"
            >
              <MapPin className="w-4 h-4" />
              <span className="font-medium">Ver ubicación en Google Maps</span>
            </a>
          )}

          {/* Botón de exclusión */}
          <ExcludeClientButton 
            clientId={cliente.client_id || cliente.id}
            clientName={cliente.nombre}
            variant="outline"
            size="sm"
          />

          {/* Justificación IA */}
          {cliente.ai_reasoning && (
            <div className="bg-card/50 backdrop-blur-sm p-3 rounded-md border border-primary/30">
              <div className="flex gap-2 items-start">
                <Lightbulb className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-card-foreground mb-2">Por qué visitarlo:</p>
                  <p className="text-sm text-card-foreground/80">{cliente.ai_reasoning}</p>
                </div>
              </div>
            </div>
          )}
          
          {cliente.justificacion && !cliente.ai_reasoning && (
            <div className="bg-muted/50 p-3 rounded-md flex gap-2">
              <Lightbulb className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">{cliente.justificacion}</p>
            </div>
          )}

          {/* Collapsible con información completa */}
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-between p-2"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <span className="text-sm font-medium">Ver más información</span>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="space-y-4 pt-3">
              {/* Información comercial */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Información Comercial
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs pl-6">
                  <div>
                    <span className="text-muted-foreground">Primera compra:</span>
                    <p className="font-medium">{formatDate(cliente.primera_compra)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Última compra:</span>
                    <p className="font-medium">{formatDate(cliente.ultima_compra)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Días desde última compra:</span>
                    <p className="font-medium">{diasSinComprar(cliente) ?? 'Sin compras'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Monto total histórico:</span>
                    <p className="font-medium">{formatCurrency(cliente.monto_total_historico)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Estado:</span>
                    <p className="font-medium">
                      <Badge variant="outline" className="text-xs">
                        {labelEstado(estadoDe(cliente))}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Categoría volumen:</span>
                    <p className="font-medium">
                      <Badge variant="outline" className="text-xs">
                        {cliente.categoria_volumen || 'N/A'}
                      </Badge>
                    </p>
                  </div>
                </div>
              </div>

              {/* Scores de Base de Datos */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  Scores de Evaluación (Base de Datos)
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs pl-6">
                  <div>
                    <span className="text-muted-foreground">Volumen:</span>
                    <p className="font-medium">{cliente.score_volumen_num || cliente.score_volumen || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Comercial:</span>
                    <p className="font-medium">{cliente.score_comercial || 'N/A'}</p>
                  </div>
                </div>
                {cliente.participacion_mercado !== undefined && (
                  <div className="text-xs pl-6">
                    <span className="text-muted-foreground">Participación de mercado:</span>
                    <p className="font-medium">{cliente.participacion_mercado}%</p>
                  </div>
                )}
              </div>

              {/* Feedbacks de otros vendedores */}
              {cliente.feedbacks && cliente.feedbacks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Feedbacks de Vendedores
                  </h4>
                  <div className="space-y-2 pl-6">
                    {cliente.feedbacks.map((fb: any, idx: number) => (
                      <div key={idx} className="bg-muted/50 p-2 rounded-md text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge variant={fb.visita_realizada ? "default" : "secondary"} className="text-xs">
                            {fb.visita_realizada ? "Visita realizada" : "No visitado"}
                          </Badge>
                          {fb.created_at && (
                            <span className="text-muted-foreground">{formatDate(fb.created_at)}</span>
                          )}
                        </div>
                        {fb.feedback && <p className="text-muted-foreground">{fb.feedback}</p>}
                        {fb.motivo_no_visita && (
                          <p className="text-muted-foreground italic">Motivo: {fb.motivo_no_visita}</p>
                        )}
                        {fb.tipo_interaccion && (
                          <Badge variant="outline" className="text-xs">{fb.tipo_interaccion}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ubicación */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Ubicaciones
                </h4>
                <div className="space-y-2 text-xs pl-6">
                  {cliente.provincia_principal && (
                    <div>
                      <span className="text-muted-foreground">Provincia:</span>
                      <p className="font-medium">{cliente.provincia_principal}</p>
                    </div>
                  )}
                  {cliente.ciudad_principal && (
                    <div>
                      <span className="text-muted-foreground">Ciudad:</span>
                      <p className="font-medium">{cliente.ciudad_principal}</p>
                    </div>
                  )}
                  {cliente.barrio_principal && (
                    <div>
                      <span className="text-muted-foreground">Barrio:</span>
                      <p className="font-medium">{cliente.barrio_principal}</p>
                    </div>
                  )}
                  {cliente.todas_ciudades && cliente.todas_ciudades.length > 1 && (
                    <div>
                      <span className="text-muted-foreground">Todas las ciudades:</span>
                      <p className="font-medium">{cliente.todas_ciudades.join(', ')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Vendedores */}
              {(cliente.vendedor_principal || cliente.todos_vendedores) && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Vendedores
                  </h4>
                  <div className="space-y-2 text-xs pl-6">
                    {(cliente.vendedor_actual || cliente.vendedor_principal) && (
                      <div>
                        <span className="text-muted-foreground">Vendedor actual:</span>
                        <p className="font-medium">{cliente.vendedor_actual || cliente.vendedor_principal}</p>
                        {cliente.vendedor_actual && cliente.vendedor_principal && 
                         cliente.vendedor_actual.toUpperCase() !== cliente.vendedor_principal.toUpperCase() && (
                          <div className="mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-orange-500" />
                            <span className="text-orange-500">Anterior: {toTitleCase(cliente.vendedor_principal)}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {cliente.todos_vendedores && cliente.todos_vendedores.length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Historial de vendedores:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {cliente.todos_vendedores.map((v, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">{v}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Productos */}
              {cliente.productos_comprados && cliente.productos_comprados.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Productos Comprados
                  </h4>
                  <div className="pl-6">
                    <ul className="text-xs space-y-1 list-disc list-inside">
                      {cliente.productos_comprados.map((prod, idx) => (
                        <li key={idx} className="text-muted-foreground">{prod}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Etiquetas */}
              {cliente.etiquetas && cliente.etiquetas.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Etiquetas
                  </h4>
                  <div className="flex flex-wrap gap-1 pl-6">
                    {cliente.etiquetas.map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </Card>
  );
};

export default ClientDetailCard;
