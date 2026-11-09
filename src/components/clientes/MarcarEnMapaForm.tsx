import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMap } from "@/hooks/useGoogleMap";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin } from "lucide-react";

const CENTRO_CABA = { lat: -34.6037, lng: -58.4316 };

/**
 * Ubicar un cliente tocando el mapa. Sirve cuando la dirección no se puede ubicar sola
 * (sin altura, o fuera de CABA sin clave de Google). Funciona también con el mapa de respaldo.
 */
export function MarcarEnMapaForm({ clientId, direccionActual, onSuccess, onCancel }: {
  clientId: string;
  direccionActual?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const { mapRef, map, error, retry } = useGoogleMap();
  const marcador = useRef<google.maps.Marker | null>(null);
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!map) return;
    map.setCenter(CENTRO_CABA);
    map.setZoom(13);
    const escucha = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e?.latLng) return;
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      setPunto(p);
      if (marcador.current) marcador.current.setPosition(p);
      else marcador.current = new google.maps.Marker({ map, position: p, title: "Ubicación del cliente" });
    });
    return () => { escucha.remove(); marcador.current?.setMap(null); marcador.current = null; };
  }, [map]);

  const guardar = async () => {
    if (!punto) return;
    setGuardando(true);
    const { data, error: err } = await supabase.functions.invoke("resolve-client-location", {
      body: { client_id: clientId, manual: true, lat: punto.lat, lng: punto.lng, direccion: direccionActual || "" },
    });
    setGuardando(false);
    if (err || data?.success === false) {
      toast({ variant: "destructive", title: "No se pudo guardar la ubicación", description: data?.message || "Probá de nuevo." });
      return;
    }
    toast({ title: "Ubicación guardada", description: data?.barrio_principal || data?.barrio ? `Barrio: ${data.barrio_principal || data.barrio}` : "Sin barrio identificado" });
    onSuccess();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Buscá el local en el mapa y tocá el punto exacto. {direccionActual && <>Dirección cargada: <strong>{direccionActual}</strong>.</>}
      </p>
      {error ? (
        <div className="rounded-md border p-3 text-sm">No se pudo cargar el mapa. <Button size="sm" variant="link" onClick={retry}>Reintentar</Button></div>
      ) : (
        <div ref={mapRef} className="h-72 w-full rounded-md border" />
      )}
      <p className="text-xs text-muted-foreground">
        {punto ? <><MapPin className="inline h-3 w-3" /> {punto.lat.toFixed(5)}, {punto.lng.toFixed(5)}</> : "Todavía no marcaste ningún punto."}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} disabled={guardando}>Cancelar</Button>
        <Button onClick={guardar} disabled={!punto || guardando} className="flex-1">
          {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar esta ubicación
        </Button>
      </div>
    </div>
  );
}
