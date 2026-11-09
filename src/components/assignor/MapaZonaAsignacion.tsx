import { EnfoqueRegalos } from "@/components/prospectos/EnfoqueRegalos";
import { candidatoRegalos } from "../../../supabase/functions/_shared/prospect-categories";
import { RecorridoAPie } from "@/components/shared/RecorridoAPie";
import { ProspectReviewDialog } from "@/components/prospectos/ProspectReviewDialog";
import { walkingRouteUrl } from "@/lib/walkingRoute";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Search, UserCheck, X } from "lucide-react";
import { distanciaKm, RADIO_RUTA_KM, VISITAS_POR_DIA } from "../../../supabase/functions/_shared/ruta";
import {
  carteraDelVendedor, centroClientes, coordenadaMapaValida, distanciaAlCliente, opcionesZona, perteneceZona, puntosDeCartera, validarSeleccionMapa,
  type ClienteMapa, type PuntoMapa, type UbicacionMapa,
} from "../../../supabase/functions/_shared/map-selection";
import { ZONAS_PROSPECCION, zonaDelCatalogo, prospectoEnZona, type ZonaProspeccionResuelta } from "../../../supabase/functions/_shared/map-zones";
import { rubroKey } from "../../../supabase/functions/_shared/reglas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SegmentFilters } from "@/components/shared/SegmentFilters";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useGoogleMap } from "@/hooks/useGoogleMap";
import { useRubros } from "@/hooks/useRubros";
import { useDraftState } from "@/hooks/useAssignmentDraft";
import { createStateMarkerIcon } from "@/lib/vendorColors";
import { mapPopup } from "@/lib/mapLocations";
import { colorEstado, ESTADOS, FILTROS_VACIOS, filtrarPorSegmentos, type FiltrosSegmento, labelEstado } from "@/lib/segmentos";
import { fetchAllRows, fetchInPages } from "@/lib/supabaseQuery";
import { toTitleCase } from "@/lib/format";

interface VendedorOpcion { id: string; nombre: string }
interface Complemento {
  success: boolean; error?: string; clientes: PuntoMapa[]; prospectos: PuntoMapa[]; elegidos: string[];
  faltantes: number; radio_busqueda_m: number; avisos: string[];
  zona?: ZonaProspeccionResuelta | null; revision_ids?: string[];
}
const zonasParaProspectos = ZONAS_PROSPECCION.map(z => ({ value: z.key, label: z.label }));

/** Cartera → zona → clientes → prospectos cercanos → confirmar ocho visitas. */
export default function MapaZonaAsignacion({ vendedores, onIrAManual }: { vendedores: VendedorOpcion[]; onIrAManual?: (vendedorId: string) => void }) {
  const { toast } = useToast();
  const { mapRef, map, error: errorMapa, retry: reintentarMapa } = useGoogleMap();
  const { rubros } = useRubros();
  const markersRef = useRef(new Map<string, google.maps.Marker>());
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [vendedorId, setVendedorId] = useDraftState("mapa", "vendedorId", "");
  const draftScope = `mapa:${vendedorId}`;
  const [zona, setZona] = useDraftState(draftScope, "zona", "todas");
  const [zonaProspectosKey, setZonaProspectosKey] = useDraftState(draftScope, "zonaProspectosKey", "");
  const [centroZona, setCentroZona] = useDraftState<ZonaProspeccionResuelta | null>(draftScope, "centroZona", null);
  const [segmentos, setSegmentos] = useDraftState<FiltrosSegmento>(draftScope, "segmentos", FILTROS_VACIOS);
  const [cartera, setCartera] = useState<PuntoMapa[]>([]);
  const [sinUbicacion, setSinUbicacion] = useState<ClienteMapa[]>([]);
  const [carteraCargada, setCarteraCargada] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useDraftState<PuntoMapa[]>(draftScope, "seleccion", []);
  const seleccionRef = useRef<PuntoMapa[]>(seleccion); seleccionRef.current = seleccion;
  const [prospectos, setProspectos] = useDraftState<PuntoMapa[]>(draftScope, "prospectos", []);
  const [regalos, setRegalos] = useDraftState(draftScope, "regalosEmpresariales", false);
  const [rubrosProspectos, setRubrosProspectos] = useDraftState<string[]>(draftScope, "rubrosProspectos", []);
  const [omitidos, setOmitidos] = useDraftState<Set<string>>(draftScope, "omitidos", () => new Set());
  const omitidosRef = useRef(omitidos); omitidosRef.current = omitidos;
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useDraftState<Complemento | null>(draftScope, "resultado", null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = buscando || asignando || cargando;
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const cambiarSeleccion = (puntos: PuntoMapa[]) => { seleccionRef.current = puntos; setSeleccion(puntos); };
  const cancelarBusqueda = () => {
    requestRef.current++;
    controllerRef.current?.abort(); controllerRef.current = null;
    setBuscando(false); busyRef.current = false;
  };
  const limpiarProspectos = () => {
    cancelarBusqueda(); setProspectos([]); setResultado(null); setErrorBusqueda(null); omitidosRef.current = new Set(); setOmitidos(omitidosRef.current);
  };
  const limpiarRuta = () => { limpiarProspectos(); cambiarSeleccion([]); infoRef.current?.close(); };
  const cambiarVendedor = (id: string) => {
    cancelarBusqueda(); infoRef.current?.close(); setCartera([]); setSinUbicacion([]); setCarteraCargada(null); setVendedorId(id);
  };
  const cambiarZonaProspectos = (key: string) => {
    if (key === zonaProspectosKey) return;
    if (seleccionRef.current.length && !window.confirm("Cambiar de barrio descarta los prospectos de esta ruta. ¿Continuar?")) return;
    limpiarRuta(); setCentroZona(null); setZonaProspectosKey(key);
  };

  useEffect(() => {
    let vigente = true;
    setErrorCarga(null);
    if (!vendedorId) return;
    cancelarBusqueda(); setCargando(true);
    (async () => {
      try {
        const [clientes, perfiles] = await Promise.all([
          fetchAllRows((from, to) => supabase.from("clientes")
            .select("client_id,razon_social,fantasia,rubro,ultima_compra,dias_desde_ultima_compra,vendedor_actual,vendedor_principal,todos_vendedores,monto_total_historico,telefonos,excluir_recomendaciones,direccion_principal,barrio_principal,ciudad_principal")
            .order("client_id").range(from, to)),
          fetchAllRows((from, to) => supabase.from("profiles").select("user_id,nombre")
            .or("rol.eq.vendedor,perfil_ventas.eq.true").order("user_id").range(from, to)),
        ]);
        const { data: vinculos } = await (supabase as unknown as { from: (t: string) => any }).from("vendedores_vinculados").select("nombre,user_id");
        const clientesCartera = carteraDelVendedor(clientes, perfiles, vendedorId, vinculos || []);
        const places = await fetchInPages<UbicacionMapa>(clientesCartera.map(c => c.client_id), (chunk, from, to) =>
          supabase.from("client_places")
            .select("id,client_id,lat,long,is_primary,direccion_verificada,direccion_principal,barrio_principal,comuna")
            .in("client_id", chunk).order("id").range(from, to));
        const guardados = [...new Map([...prospectos, ...seleccionRef.current.filter(p => p.tipo === "prospecto")].map(p => [p.id, p])).values()];
        const actuales = await fetchInPages(guardados.map(p => p.id), (chunk, from, to) => supabase.from("prospectos")
          .select("place_id,nombre,direccion,barrio,ciudad,provincia,comuna,rubro,latitud,longitud,telefono,rating,total_ratings,es_cliente_cupra,client_id,estado_negocio")
          .in("place_id", chunk).order("place_id").range(from, to));
        if (!vigente) return;
        const datos = puntosDeCartera(clientesCartera, places);
        setCartera(datos.puntos); setSinUbicacion(datos.sinUbicacion); setCarteraCargada(vendedorId);
        // Recupera el borrador sin borrar destinos: actualiza datos o marca los que requieren revisión.
        const vigentes = new Map(datos.puntos.map(p => [p.key, p]));
        const seleccionClientes = seleccionRef.current.filter(p => p.tipo === "cliente").map(p => vigentes.get(p.key) || { ...p, excluido: true });
        const centroActual = seleccionClientes.length ? centroClientes(seleccionClientes) : centroZona?.key === zonaProspectosKey ? centroZona : null;
        const prospectsById = new Map(actuales.map(p => [p.place_id, p]));
        const actualizados = guardados.map(old => {
          const p = prospectsById.get(old.id);
          if (!p || p.es_cliente_cupra || p.client_id || ["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"].includes(p.estado_negocio)
            || !coordenadaMapaValida({ lat: p.latitud, lng: p.longitud })
            || !seleccionClientes.length && centroZona && !prospectoEnZona(p, centroZona)) return { ...old, excluido: true };
          const punto = { lat: p.latitud, lng: p.longitud };
          return { ...old, ...punto, nombre: p.nombre, direccion: p.direccion, barrio: p.barrio, ciudad: p.ciudad, comuna: p.comuna,
            rubro: p.rubro, telefono: p.telefono, rating: p.rating, resenas: p.total_ratings, excluido: false,
            distancia_centro_m: centroActual ? Math.round(distanciaKm(centroActual, punto) * 1000) : undefined,
            distancia_cliente_m: seleccionClientes.length ? Math.round(distanciaAlCliente(punto, seleccionClientes) * 1000) : undefined };
        });
        actualizados.forEach(p => vigentes.set(p.key, p));
        setProspectos(actualizados);
        cambiarSeleccion(seleccionRef.current.map(p => vigentes.get(p.key) || { ...p, excluido: true }));
      } catch {
        if (vigente) setErrorCarga("No se pudo cargar la cartera completa. Reintentá.");
      } finally { if (vigente) setCargando(false); }
    })();
    return () => { vigente = false; };
  }, [vendedorId, recarga]);

  useEffect(() => () => { requestRef.current++; controllerRef.current?.abort(); }, []);
  useEffect(() => {
    if (!map) return;
    const info = new google.maps.InfoWindow(); infoRef.current = info;
    const markers = markersRef.current;
    return () => {
      info.close();
      markers.forEach(m => { google.maps.event.clearInstanceListeners(m); m.setMap(null); });
      markers.clear();
    };
  }, [map]);

  const clientesElegidos = useMemo(() => seleccion.filter(p => p.tipo === "cliente"), [seleccion]);
  const sinCartera = carteraCargada === vendedorId && !cartera.length && !sinUbicacion.length;
  const soloProspectos = sinCartera || Boolean(zonaProspectosKey && seleccion.length && !clientesElegidos.length);
  const zonaElegida = zonaDelCatalogo(zonaProspectosKey);
  const centroBarrio = zonaElegida && centroZona?.key === zonaElegida.key ? centroZona : null;
  const rubrosBusqueda = useMemo(() => {
    const opciones = rubros.map(r => ({ value: r.value, label: r.value }));
    for (const nombre of ["Vinoteca", "Wine bar", "Restaurante", "Bar", "Hotel", "Almacén / Supermercado", "Tienda gourmet"]) {
      if (!opciones.some(r => rubroKey(r.value) === rubroKey(nombre))) opciones.push({ value: nombre, label: nombre });
    }
    return opciones.sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [rubros]);
  const zonas = useMemo(() => [{ value: "todas", label: "Toda la cartera" }, ...opcionesZona(cartera)], [cartera]);
  const clientesVisibles = useMemo(() => filtrarPorSegmentos(cartera.filter(p => perteneceZona(p, zona)), segmentos,
    p => ({ estado: p.estado, rubro: p.rubro })), [cartera, zona, segmentos]);
  // Los elegidos permanecen visibles aunque se ajuste un filtro de clientes.
  const visibles = useMemo(() => [...new Map([...(soloProspectos ? [] : clientesVisibles), ...prospectos, ...seleccion].map(p => [p.key, p])).values()], [clientesVisibles, prospectos, seleccion, soloProspectos]);
  const centro = useMemo(() => clientesElegidos.length ? centroClientes(clientesElegidos) : centroBarrio, [clientesElegidos, centroBarrio]);
  const errorSeleccion = seleccion.length ? validarSeleccionMapa(seleccion, false, soloProspectos ? centroBarrio : null) : null;
  const puntosRef = useRef(visibles); puntosRef.current = visibles;
  const conteo = useMemo(() => {
    const counts = new Map<string, number>();
    visibles.forEach(p => counts.set(p.estado, (counts.get(p.estado) || 0) + 1)); return counts;
  }, [visibles]);

  const toggle = (p: PuntoMapa) => {
    if (busyRef.current) return;
    const prev = seleccionRef.current, elegido = prev.some(v => v.key === p.key);
    let next = elegido ? prev.filter(v => v.key !== p.key) : [...prev, p];
    if (p.tipo === "cliente") next = next.filter(v => v.tipo === "cliente");
    if (!elegido) {
      const error = validarSeleccionMapa(next, false, soloProspectos ? centroBarrio : null);
      if (error) { toast({ variant: "destructive", title: "No se puede agregar", description: error }); return; }
    }
    if (p.tipo === "cliente") limpiarProspectos();
    else {
      const ids = new Set(omitidosRef.current);
      if (elegido) ids.add(p.id); else ids.delete(p.id);
      omitidosRef.current = ids; setOmitidos(ids);
    }
    cambiarSeleccion(next);
  };
  const toggleRef = useRef(toggle); toggleRef.current = toggle;
  const abrirFicha = (p: PuntoMapa, marker: google.maps.Marker) => {
    const details = [
      `${labelEstado(p.estado)} · ${p.tipo === "prospecto" ? "Prospecto" : "Cliente"}`,
      `Rubro: ${p.rubro || "Sin dato"}`, [p.direccion, p.barrio || p.ciudad].filter(Boolean).join(" · "),
      p.vendedor ? `Cartera de ${toTitleCase(p.vendedor)}` : "",
      p.dias != null ? `${p.dias} días sin comprar` : "",
      p.telefono ? `Tel: ${p.telefono}` : "",
      p.rating ? `Google: ${p.rating} / 5 · ${p.resenas || 0} reseñas` : "",
      p.distancia_centro_m != null ? `A ${p.distancia_centro_m} m del centro${p.distancia_cliente_m != null ? ` y ${p.distancia_cliente_m} m del cliente más cercano` : " del barrio"} (en línea recta)` : "",
      p.excluido ? "Este destino ya no está disponible. Revisá la selección." : "",
    ];
    const div = mapPopup(p.nombre, details, p);
    const button = document.createElement("button");
    const actualizar = () => {
      button.textContent = seleccionRef.current.some(v => v.key === p.key) ? "Quitar de la ruta" : "Agregar a la ruta";
      button.disabled = Boolean(p.excluido) || busyRef.current;
      button.style.cssText = "display:block;margin-top:10px;padding:8px 12px;border-radius:4px;border:0;background:#111827;color:#fff;cursor:pointer;font:600 12px system-ui";
    };
    button.addEventListener("click", () => { toggleRef.current(p); actualizar(); });
    actualizar(); div.append(button);
    infoRef.current?.setContent(div); infoRef.current?.open({ map: map!, anchor: marker });
  };
  const abrirRef = useRef(abrirFicha); abrirRef.current = abrirFicha;

  useEffect(() => {
    if (!map) return;
    const markers = markersRef.current, keys = new Set(visibles.map(p => p.key));
    markers.forEach((marker, key) => {
      if (!keys.has(key)) { google.maps.event.clearInstanceListeners(marker); marker.setMap(null); markers.delete(key); }
    });
    for (const p of visibles) {
      const elegido = seleccion.some(s => s.key === p.key);
      let marker = markers.get(p.key);
      if (!marker) {
        marker = new google.maps.Marker({ position: p, map, title: p.nombre });
        const current = marker;
        marker.addListener("click", () => {
          const point = puntosRef.current.find(v => v.key === p.key);
          if (point) abrirRef.current(point, current);
        });
        markers.set(p.key, marker);
      }
      marker.setPosition(p);
      marker.setIcon(createStateMarkerIcon(p.estado, elegido ? "#111827" : undefined, elegido ? 1.25 : 0.85));
      marker.setZIndex(elegido ? 3 : 1);
      marker.setOpacity(p.excluido ? 0.45 : 1);
    }
  }, [map, visibles, seleccion]);

  useEffect(() => {
    if (!map || !clientesVisibles.length) return;
    const bounds = new google.maps.LatLngBounds(); clientesVisibles.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
  }, [map, clientesVisibles]);
  useEffect(() => {
    if (!map || !centro) return;
    const circle = new google.maps.Circle({ map, center: centro, radius: RADIO_RUTA_KM * 1000,
      strokeColor: "#2563eb", strokeOpacity: 0.8, strokeWeight: 2, fillColor: "#2563eb", fillOpacity: 0.06, clickable: false });
    return () => circle.setMap(null);
  }, [map, centro]);
  useEffect(() => {
    if (map && soloProspectos && centroBarrio && !seleccion.length) { map.setCenter(centroBarrio); map.setZoom(15); }
  }, [map, soloProspectos, centroBarrio, seleccion.length]);
  useEffect(() => {
    if (!map || !resultado || !seleccionRef.current.length) return;
    const bounds = new google.maps.LatLngBounds(); seleccionRef.current.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
  }, [map, resultado]);

  const completar = async () => {
    if (busyRef.current) return;
    const actuales = seleccionRef.current;
    if (soloProspectos && !zonaElegida) return;
    const error = soloProspectos && !actuales.length ? null : validarSeleccionMapa(actuales, false, soloProspectos ? centroBarrio : null);
    if (error || actuales.length >= VISITAS_POR_DIA) return;
    const request = ++requestRef.current;
    const controller = new AbortController(); controllerRef.current = controller;
    setBuscando(true); busyRef.current = true; setResultado(null); setErrorBusqueda(null); infoRef.current?.close();
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<Complemento>("complete-map-route", {
        body: { vendedor_id: vendedorId, client_ids: actuales.filter(p => p.tipo === "cliente").map(p => p.id),
          prospect_ids: actuales.filter(p => p.tipo === "prospecto").map(p => p.id), omitir_ids: [...omitidosRef.current], rubros: rubrosProspectos, regalos_empresariales: regalos,
          ...(soloProspectos ? { zona_key: zonaProspectosKey } : {}) },
        signal: controller.signal,
      });
      if (request !== requestRef.current) return;
      if (invokeError || !data?.success) {
        const context = invokeError && "context" in invokeError ? invokeError.context as Response : null;
        const detail = context?.json ? await context.json().catch(() => null) : null;
        throw new Error(detail?.error || data?.error || "No se pudo completar la búsqueda. Reintentá.");
      }
      const seleccionados = data.prospectos.filter(p => data.elegidos.includes(p.id));
      const next = [...data.clientes, ...actuales.filter(p => p.tipo === "prospecto"), ...seleccionados];
      if (soloProspectos && (!data.zona || data.zona.key !== zonaProspectosKey || !coordenadaMapaValida(data.zona))) throw new Error("No se pudo verificar el centro del barrio.");
      const validation = validarSeleccionMapa(next, false, soloProspectos ? data.zona! : null);
      if (validation) throw new Error(validation);
      if (request !== requestRef.current) return;
      setCartera(prev => prev.map(p => data.clientes.find(c => c.id === p.id) || p));
      setProspectos(prev => [...new Map([...prev, ...data.prospectos].map(p => [p.key, p])).values()]);
      if (soloProspectos) setCentroZona(data.zona!);
      cambiarSeleccion(next); setResultado(data);
    } catch (e) {
      if (request === requestRef.current) setErrorBusqueda(e instanceof Error ? e.message : "No se pudo completar la búsqueda.");
    } finally {
      if (request === requestRef.current) { setBuscando(false); busyRef.current = false; controllerRef.current = null; }
    }
  };

  const asignar = async () => {
    if (busyRef.current) return;
    const error = validarSeleccionMapa(seleccionRef.current, true, soloProspectos ? centroBarrio : null);
    const vendedor = vendedores.find(v => v.id === vendedorId);
    if (error || !vendedor) return;
    setAsignando(true); busyRef.current = true; infoRef.current?.close();
    try {
      const { error: saveError } = await supabase.rpc("guardar_ruta_mapa", {
        p_vendedor_id: vendedorId,
        p_client_ids: seleccionRef.current.filter(p => p.tipo === "cliente").map(p => p.id),
        p_prospecto_ids: seleccionRef.current.filter(p => p.tipo === "prospecto").map(p => p.id),
        ...(soloProspectos ? { p_zona_key: zonaProspectosKey } : {}),
      });
      if (saveError) throw new Error(saveError.message);
      toast({ title: "Visitas asignadas", description: `8 visitas para ${vendedor.nombre}.` }); limpiarRuta();
    } catch (e) {
      toast({ variant: "destructive", title: "No se pudo asignar", description: e instanceof Error ? e.message : "Reintentá el guardado." });
    } finally { setAsignando(false); busyRef.current = false; }
  };

  return (
    <div className="space-y-4">
      <ProspectReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} prospectIds={resultado?.revision_ids}
        onResolved={(id, decision) => {
          if (decision === "unificado") {
            cambiarSeleccion(seleccionRef.current.filter(p => p.tipo !== "prospecto" || p.id !== id));
            setProspectos(prev => prev.filter(p => p.id !== id));
          }
          setRecarga(n => n + 1);
        }} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">1. Vendedor</Label>
          <SearchableSelect options={vendedores.map(v => ({ value: v.id, label: v.nombre }))} value={vendedorId}
            onValueChange={cambiarVendedor} placeholder="Elegí el vendedor" searchPlaceholder="Buscar vendedor..." disabled={asignando} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{soloProspectos ? "2. Barrio o localidad para buscar prospectos" : "2. Barrio o zona de su cartera"}</Label>
          {soloProspectos
            ? <SearchableSelect options={zonasParaProspectos} value={zonaProspectosKey} onValueChange={cambiarZonaProspectos}
                placeholder="Elegí un barrio o localidad" searchPlaceholder="Buscar barrio o localidad..." className="h-auto min-h-10 whitespace-normal text-left"
                disabled={!vendedorId || cargando || asignando} />
            : <SearchableSelect options={zonas} value={zona} onValueChange={v => { cancelarBusqueda(); infoRef.current?.close(); setZona(v); }}
                placeholder="Toda la cartera" searchPlaceholder="Buscar barrio o localidad..." disabled={!vendedorId || cargando || asignando} />}
        </div>
      </div>
      {!vendedorId && <p className="text-sm text-muted-foreground">Elegí un vendedor para ver todos sus clientes y después acotá el mapa por barrio o localidad.</p>}
      {cargando && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Cargando la cartera completa...</p>}
      {errorCarga && <div role="alert" className="text-sm text-destructive">{errorCarga} <Button variant="outline" size="sm" onClick={() => setRecarga(n => n + 1)}>Reintentar carga</Button></div>}
      {vendedorId && !cargando && !errorCarga && <p role="status" className="text-sm text-muted-foreground">
        {cartera.length + sinUbicacion.length} clientes en la cartera · {cartera.length} con ubicación · {clientesVisibles.length} coinciden con los filtros.
      </p>}
      {soloProspectos && !cargando && !errorCarga && <div className="border-l-2 border-primary/50 pl-3 space-y-2 text-sm">
        <p>{sinCartera ? "Este vendedor todavía no tiene clientes. " : "Estás armando una ruta sólo de prospectos. "}Elegí un barrio y las categorías para completar 8 visitas con prospectos.</p>
        <p className="text-muted-foreground">Para asignarle clientes de otro vendedor, usá la opción Asignación manual.</p>
        {onIrAManual && <Button type="button" variant="outline" size="sm" disabled={asignando} onClick={() => onIrAManual(vendedorId)}>Ir a asignación manual</Button>}
      </div>}
      {!!sinUbicacion.length && <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer">{sinUbicacion.length} cliente{sinUbicacion.length === 1 ? "" : "s"} sin ubicación en el mapa</summary>
        <p className="mt-2 text-xs text-muted-foreground">Faltan coordenadas válidas. Completá sus ubicaciones en Carga de datos para poder seleccionarlos.</p>
        <ul className="mt-2 space-y-1 max-h-40 overflow-auto">{sinUbicacion.map(c => <li key={c.client_id}>{c.fantasia || c.razon_social} <span className="text-muted-foreground">· {c.direccion_principal || c.ciudad_principal || "Sin dirección"}</span></li>)}</ul>
      </details>}
      {vendedorId && !soloProspectos && <fieldset disabled={asignando}><SegmentFilters value={segmentos} onChange={setSegmentos} campos={["estados", "rubros"]} titulo="Filtrar clientes de la cartera" /></fieldset>}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="relative rounded-lg border overflow-hidden h-[420px] sm:h-[560px] min-w-0">
          <div ref={mapRef} className="w-full h-full" />
          {errorMapa && <div role="alert" className="absolute inset-0 p-6 bg-background text-sm space-y-3"><p className="text-destructive">{errorMapa}</p><p className="text-muted-foreground">Podés seguir eligiendo destinos desde la lista de la derecha.</p><Button variant="outline" size="sm" onClick={reintentarMapa}>Reintentar mapa</Button></div>}
          <div className="absolute bottom-3 left-3 bg-background/95 p-3 rounded-md shadow border text-xs space-y-1">
            {ESTADOS.map(e => <div key={e.value} className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: e.color }} /><span>{e.plural}</span><span className="text-muted-foreground ml-auto pl-3">{conteo.get(e.value) || 0}</span></div>)}
          </div>
        </div>
        <div className="rounded-lg border p-4 space-y-3 h-fit min-w-0">
          <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-medium">3. Ruta en armado</span><Badge variant="secondary" className="ml-auto">{seleccion.length}/{VISITAS_POR_DIA}</Badge></div>
          <p className="text-xs text-muted-foreground">{soloProspectos
            ? "La búsqueda parte del centro del barrio elegido. Los prospectos deben estar en esa zona y a no más de 1,5 km del centro; podés revisar y cambiar la selección en el mapa."
            : "Tocá los clientes en el mapa para agregarlos. El centro se calcula entre los clientes elegidos; el círculo marca el límite de 1,5 km."}</p>
          {!!seleccion.length && <p className="text-sm">{clientesElegidos.length} clientes + {seleccion.length - clientesElegidos.length} prospectos</p>}
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {seleccion.map(p => <div key={p.key} className="flex items-start gap-2 text-sm">
              <span className="w-2.5 h-2.5 mt-1 rounded-full shrink-0" style={{ backgroundColor: colorEstado(p.estado) }} />
              <div className="flex-1 min-w-0"><p className="truncate" title={p.nombre}>{p.nombre}</p><p className="text-xs text-muted-foreground">{p.rubro || (p.tipo === "cliente" ? "Cliente" : "Prospecto")}{p.distancia_cliente_m != null ? ` · a ${p.distancia_cliente_m} m de un cliente` : p.distancia_centro_m != null ? ` · a ${p.distancia_centro_m} m del centro` : ""}</p></div>
              <button type="button" className="p-1" onClick={() => toggle(p)} disabled={buscando || asignando} aria-label={`Quitar ${p.nombre}`}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>)}
          </div>
          {errorSeleccion && <p role="alert" className="text-xs text-destructive">{errorSeleccion}</p>}
          {(soloProspectos || !!clientesElegidos.length && seleccion.length < VISITAS_POR_DIA) && <div className="space-y-2 border-t pt-3">
            <EnfoqueRegalos checked={regalos} disabled={buscando || asignando} onChange={value => {
              if (seleccionRef.current.some(p => p.tipo === "prospecto") && !window.confirm("Cambiar el enfoque descarta los prospectos seleccionados para buscar otros. ¿Continuar?")) return;
              limpiarProspectos(); cambiarSeleccion(seleccionRef.current.filter(p => p.tipo === "cliente"));
              setRegalos(value); setRubrosProspectos([]);
            }} />
            <Label className="text-xs">{soloProspectos ? "Categorías de los prospectos" : "Rubros para completar con prospectos"}</Label>
            <fieldset disabled={buscando || asignando}><MultiSelect ariaLabel="Rubros de los prospectos" options={regalos ? rubrosBusqueda.filter(r => candidatoRegalos({ rubro: r.value })) : rubrosBusqueda} selected={rubrosProspectos} onChange={values => {
              if (soloProspectos && seleccionRef.current.length) {
                if (!window.confirm("Cambiar las categorías descarta los prospectos de esta ruta para buscar otros. ¿Continuar?")) return;
                limpiarRuta();
              }
              setRubrosProspectos(values);
            }} placeholder="Todos los rubros" /></fieldset>
            <Button className="w-full gap-2" onClick={completar} disabled={cargando || Boolean(errorCarga) || buscando || asignando || Boolean(errorSeleccion) || seleccion.length >= VISITAS_POR_DIA || soloProspectos && !zonaElegida}>{buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}{soloProspectos && !seleccion.length ? "Buscar 8 prospectos" : "Completar con prospectos"}</Button>
            {soloProspectos && !zonaElegida && <p className="text-xs text-muted-foreground">Elegí primero el barrio o localidad.</p>}
            <p className="text-xs text-muted-foreground">Busca primero a 150 m del centro y amplía sólo si hace falta, hasta 1,5 km. Los más cercanos completan las 8 visitas; podés cambiarlos desde el mapa.</p>
          </div>}
          {buscando && <p role="status" className="text-xs text-muted-foreground">Buscando prospectos cercanos en la base y en Google Maps...</p>}
          {errorBusqueda && <p role="alert" className="text-xs text-destructive">{errorBusqueda}</p>}
          {resultado && <div role="status" className="space-y-1 text-xs text-muted-foreground">
            <p>Búsqueda hasta {resultado.radio_busqueda_m} m del centro {soloProspectos ? `de ${zonaElegida?.barrio || "la zona"}` : "de los clientes"}.</p>
            {seleccion.length < VISITAS_POR_DIA && <p className="text-amber-600">Faltan {VISITAS_POR_DIA - seleccion.length} visitas para completar la ruta. Podés volver a buscar o ajustar {soloProspectos ? "las categorías o el barrio" : "los rubros y los clientes"}. Se mantiene el límite de 1,5 km.</p>}
            {resultado.avisos.map((a, i) => <p key={i} className="text-amber-600">{a}</p>)}
          </div>}
          {!!resultado?.revision_ids?.length && <div className="border p-3 space-y-2 text-sm">
            <p>{resultado.revision_ids.length} prospectos tienen coincidencias con clientes. Podés revisarlos y después volver a completar la ruta.</p>
            <Button variant="outline" size="sm" disabled={buscando || asignando} onClick={()=>setReviewOpen(true)}>Revisar y unificar</Button>
          </div>}
          {walkingRouteUrl(seleccion) && <a className="block text-sm underline" target="_blank" rel="noopener noreferrer" href={walkingRouteUrl(seleccion)!}>Ver recorrido a pie en Google Maps</a>}
          <RecorridoAPie puntos={seleccion} onOrden={ids=>cambiarSeleccion(ids.map(id=>seleccionRef.current.find(p=>p.key===id)!))} />
          <p className="text-xs text-muted-foreground">El radio de 1,5 km se mide en línea recta desde el centro. Revisá el recorrido a pie para comprobar calles, accesos y distancia total.</p>
          {!!seleccion.length && <Button variant="ghost" size="sm" disabled={asignando} onClick={() => { if (window.confirm("¿Descartar el borrador de esta ruta y vaciar la selección?")) limpiarRuta(); }}>Descartar borrador</Button>}
          <Button className="w-full gap-2" onClick={asignar} disabled={cargando || Boolean(errorCarga) || seleccion.length !== VISITAS_POR_DIA || Boolean(errorSeleccion) || !vendedorId || buscando || asignando}>
            {asignando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}Asignar 8 visitas
          </Button>
          <p className="text-xs text-muted-foreground">Las visitas se guardan al pulsar Asignar 8 visitas.</p>
        </div>
      </div>
    </div>
  );
}
