import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toTitleCase } from "@/lib/format";
import { crearResolvedorVendedores } from "../../../supabase/functions/_shared/reglas";

// Tablas nuevas que todavía no están en los tipos generados.
const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string) => any };

interface Fila { nombre: string; clientes: number }
interface Perfil { user_id: string; nombre: string | null }

/**
 * Vincula cada nombre de vendedor del Excel con su usuario, una sola vez.
 * Si no hay vínculo, la app intenta por el nombre; si tampoco encuentra, esos
 * clientes no entran en ninguna ruta.
 */
export default function VendedoresDelExcel({ puedeEditar }: { puedeEditar: boolean }) {
  const { toast } = useToast();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [vinculos, setVinculos] = useState<Map<string, string>>(new Map());
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setError(null);
    const [n, p, v] = await Promise.all([
      db.rpc("nombres_vendedores_excel"),
      supabase.from("profiles").select("user_id,nombre").eq("activo", true).or("rol.eq.vendedor,perfil_ventas.eq.true").order("nombre"),
      db.from("vendedores_vinculados").select("nombre,user_id"),
    ]);
    if (n.error || p.error || v.error) { setError("No se pudieron cargar los vendedores del Excel."); return; }
    setFilas((n.data || []).map((f: any) => ({ nombre: f.nombre, clientes: Number(f.clientes) })));
    setPerfiles(p.data || []);
    setVinculos(new Map((v.data || []).map((x: any) => [x.nombre, x.user_id])));
  };
  useEffect(() => { cargar(); }, []);

  // Lo que la app adivina por el nombre, sin vínculos: para mostrar qué pasa si no se vincula.
  const porNombre = useMemo(() => crearResolvedorVendedores(perfiles), [perfiles]);
  const nombreDe = (id: string | null | undefined) => toTitleCase(perfiles.find((p) => p.user_id === id)?.nombre || "");
  const sinUsuario = filas.filter((f) => !vinculos.get(f.nombre) && !porNombre.resolver(f.nombre));

  const vincular = async (nombre: string, userId: string) => {
    setGuardando(nombre);
    const r = userId === "__ninguno__"
      ? await db.from("vendedores_vinculados").delete().eq("nombre", nombre)
      : await db.from("vendedores_vinculados").upsert({ nombre, user_id: userId });
    setGuardando(null);
    if (r.error) { toast({ variant: "destructive", title: "No se pudo guardar el vínculo" }); return; }
    toast({ title: userId === "__ninguno__" ? "Vínculo quitado" : "Vendedor vinculado" });
    cargar();
  };

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h2 className="text-lg font-medium">Vendedores del Excel</h2>
        <p className="text-sm text-muted-foreground">
          Cada nombre de la columna Vendedor tiene que corresponder a un usuario. Si no, sus clientes no entran en ninguna ruta.
          {sinUsuario.length > 0 && <> Hoy hay <strong>{sinUsuario.length}</strong> sin usuario.</>}
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error} <Button size="sm" variant="link" onClick={cargar}>Reintentar</Button></p>}
      <div className="divide-y">
        {filas.map((f) => {
          const fijo = vinculos.get(f.nombre);
          const auto = porNombre.resolver(f.nombre);
          return (
            <div key={f.nombre} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{toTitleCase(f.nombre)}</p>
                <p className="text-xs text-muted-foreground">{f.clientes} cliente{f.clientes === 1 ? "" : "s"}</p>
              </div>
              <div className="flex items-center gap-2">
                {fijo ? <Badge>Vinculado</Badge>
                  : auto ? <Badge variant="secondary">Por nombre: {nombreDe(auto)}</Badge>
                  : <Badge variant="destructive">Sin usuario</Badge>}
                <Select disabled={!puedeEditar || guardando === f.nombre} value={fijo ?? ""} onValueChange={(v) => vincular(f.nombre, v)}>
                  <SelectTrigger className="w-[200px] h-8"><SelectValue placeholder="Elegir usuario" /></SelectTrigger>
                  <SelectContent>
                    {perfiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{toTitleCase(p.nombre || "")}</SelectItem>)}
                    {fijo && <SelectItem value="__ninguno__">Quitar vínculo</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
        {!filas.length && !error && <p className="py-2 text-sm text-muted-foreground">Todavía no hay clientes con vendedor.</p>}
      </div>
    </section>
  );
}
