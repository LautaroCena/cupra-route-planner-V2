import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { BARRIOS_CABA } from "../../../supabase/functions/_shared/osm";

/**
 * Trae de OpenStreetMap (gratis) los negocios del rubro de un barrio de CABA y los guarda
 * como prospectos. Sirve mientras no haya clave de Google; trae menos datos que Google.
 */
export function ImportarOsmDialog({ open, onOpenChange, onImported }: {
  open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void;
}) {
  const { toast } = useToast();
  const [barrio, setBarrio] = useState("");
  const [cargando, setCargando] = useState(false);

  const importar = async () => {
    setCargando(true);
    const { data, error } = await supabase.functions.invoke("prospectos-osm", { body: { barrio } });
    setCargando(false);
    if (error || data?.success === false) {
      toast({ variant: "destructive", title: "No se pudo traer el barrio", description: data?.message || "OpenStreetMap puede tardar; probá de nuevo." });
      return;
    }
    toast({ title: `${barrio}: ${data.encontrados} negocios`, description: `${data.nuevos} prospectos nuevos y ${data.actualizados} actualizados. Datos © OpenStreetMap.` });
    onImported();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !cargando && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Traer prospectos de OpenStreetMap</DialogTitle>
          <DialogDescription>
            Vinotecas, restaurantes, bares, hoteles, almacenes y tiendas gourmet de un barrio de CABA. Es gratis, pero trae menos
            datos que Google: sin reseñas y pocas veces con teléfono. Los que ya son clientes se apartan solos al armar rutas.
          </DialogDescription>
        </DialogHeader>
        <Select value={barrio} onValueChange={setBarrio} disabled={cargando}>
          <SelectTrigger><SelectValue placeholder="Elegí un barrio" /></SelectTrigger>
          <SelectContent>{BARRIOS_CABA.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Puede tardar hasta un minuto.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cargando}>Cancelar</Button>
          <Button onClick={importar} disabled={!barrio || cargando}>
            {cargando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Traer prospectos
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
