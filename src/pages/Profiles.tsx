import { useEffect, useState } from "react";
import AppNav from "@/components/AppNav";
import { isAssignorLike, canManageAssignors, ROLE_LABELS, type AppRole } from "@/lib/roles";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Wine, LogOut, User, ArrowLeft, Pencil, Filter, UserX, UserPlus, Briefcase, KeyRound } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import PermisosMatriz from "@/components/admin/PermisosMatriz";
import VendedoresDelExcel from "@/components/admin/VendedoresDelExcel";
import { useToast } from "@/hooks/use-toast";
import cupraLogo from "@/assets/cupra-logo-new.png";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toTitleCase } from "@/lib/format";

const Profiles = () => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<any[]>([]);
  const [filterRole, setFilterRole] = useState<"todos" | AppRole>("todos");
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [profileToDeactivate, setProfileToDeactivate] = useState<any>(null);
  const [formData, setFormData] = useState<{
    nombre: string;
    email: string;
    rol: AppRole;
    activo: boolean;
    perfil_ventas: boolean;
  }>({
    nombre: "",
    email: "",
    rol: "vendedor",
    activo: true,
    perfil_ventas: false,
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createData, setCreateData] = useState<{
    nombre: string;
    email: string;
    password: string;
    rol: AppRole;
    activo: boolean;
    perfil_ventas: boolean;
  }>({ nombre: "", email: "", password: "", rol: "vendedor", activo: true, perfil_ventas: false });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [transferirDesde,setTransferirDesde]=useState<{user_id:string;nombre:string}|null>(null);
  const [transferirA,setTransferirA]=useState("");
  const [transfiriendo,setTransfiriendo]=useState(false);
  const transferirPendientes=async()=>{
    if(!transferirDesde||!transferirA)return;
    setTransfiriendo(true);
    try {
      const {data,error}=await supabase.rpc("reasignar_pendientes",{p_origen:transferirDesde.user_id,p_destino:transferirA});
      if(error)throw error;
      toast({title:"Pendientes reasignados",description:`${data} visitas transferidas. El historial se conserva.`});
      setTransferirDesde(null);setTransferirA("");
    }catch(e){toast({variant:"destructive",title:"No se pudo reasignar",description:e instanceof Error?e.message:"Revisá el vendedor de destino."});}
    finally{setTransfiriendo(false);}
  };
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        if (!session) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (session?.user) {
      fetchProfile();
    }
  }, [session]);

  useEffect(() => {
    if (isAssignorLike(profile?.rol)) {
      fetchProfiles();
    }
  }, [profile]);

  useEffect(() => {
    if (filterRole === "todos") {
      setFilteredProfiles(profiles);
    } else {
      setFilteredProfiles(profiles.filter(p => p.rol === filterRole));
    }
  }, [profiles, filterRole]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (error) throw error;
      setProfile(data);
      
      if (!isAssignorLike(data.rol)) {
        toast({
          variant: "destructive",
          title: "Acceso denegado",
          description: "No tienes permisos para acceder a esta página",
        });
        navigate("/");
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al cargar perfiles",
      });
    }
  };

  /** El administrador gestiona todo; el asignador, vendedores y otros asignadores. */
  const puedeGestionar = (target: any) =>
    canManageAssignors(profile?.rol) || target?.rol !== 'administrador';

  /** Cambia el doble perfil de varios usuarios a la vez. */
  const aplicarDoblePerfil = async (valor: boolean) => {
    const objetivos = profiles.filter(
      (p) => selectedIds.includes(p.id) && isAssignorLike(p.rol) && puedeGestionar(p),
    );
    if (objetivos.length === 0) {
      toast({
        variant: "destructive",
        title: "Nada para cambiar",
        description: "El doble perfil solo aplica a administradores y asignadores.",
      });
      return;
    }
    setIsBulkSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ perfil_ventas: valor })
        .in('id', objetivos.map((p) => p.id));
      if (error) throw error;
      toast({
        title: valor ? "Doble perfil activado" : "Doble perfil quitado",
        description: `${objetivos.length} perfil(es) actualizado(s).`,
      });
      setSelectedIds([]);
      fetchProfiles();
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el doble perfil" });
    } finally {
      setIsBulkSaving(false);
    }
  };

  /** Perfiles de gestión visibles que este usuario puede editar. */
  const seleccionables = filteredProfiles.filter(
    (p) => isAssignorLike(p.rol) && puedeGestionar(p),
  );

  const enviarResetPassword = async (target: any) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target.email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast({
        title: "Mail de recupero enviado",
        description: `${target.email} recibirá el enlace para reiniciar su contraseña.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo enviar",
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Sesión cerrada",
      description: "Hasta pronto",
    });
    navigate("/auth");
  };

  const handleOpenDialog = (profileData: any) => {
    setEditingProfile(profileData);
    setFormData({
      nombre: profileData.nombre,
      email: profileData.email,
      rol: profileData.rol,
      activo: profileData.activo ?? true,
      perfil_ventas: profileData.perfil_ventas ?? false,
    });
    setIsDialogOpen(true);
  };

  const toggleActivo = async (profileData: any) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ activo: !profileData.activo })
        .eq('id', profileData.id);

      if (error) throw error;

      toast({
        title: profileData.activo ? "Perfil desactivado" : "Perfil activado",
        description: `${profileData.nombre} ahora está ${!profileData.activo ? 'activo' : 'inactivo'}`,
      });

      fetchProfiles();
    } catch (error) {
      console.error('Error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al cambiar estado del perfil",
      });
    }
  };

  const handleDeactivateClick = (profileItem: any) => {
    if (profileItem.user_id === session?.user?.id) {
      toast({
        variant: "destructive",
        title: "Acción no permitida",
        description: "No podés desactivar tu propio perfil",
      });
      return;
    }
    setProfileToDeactivate(profileItem);
    setDeactivateDialogOpen(true);
  };

  const handleDeactivateConfirm = async () => {
    if (!profileToDeactivate) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({activo:false})
        .eq('id', profileToDeactivate.id);

      if (error) throw error;

      toast({
        title: "Perfil desactivado",
        description: "Se bloqueó el acceso y se conservó el historial. Podés reasignar sus pendientes.",
      });

      setDeactivateDialogOpen(false);
      setProfileToDeactivate(null);
      fetchProfiles();
    } catch (error) {
      console.error('Error deactivating profile:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al desactivar el perfil",
      });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: createData,
      });
      if (error) {
        const detalle = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(detalle?.error || error.message);
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      toast({
        title: "Perfil creado",
        description: `${createData.nombre} ya puede iniciar sesión con su email y contraseña.`,
      });
      setIsCreateOpen(false);
      setCreateData({ nombre: "", email: "", password: "", rol: "vendedor", activo: true, perfil_ventas: false });
      fetchProfiles();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo crear el perfil",
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          nombre: formData.nombre,
          rol: formData.rol,
          activo: formData.activo,
          // El doble perfil solo aplica a roles de gestión.
          perfil_ventas: isAssignorLike(formData.rol) ? formData.perfil_ventas : false,
        })
        .eq('id', editingProfile.id);

      if (error) throw error;

      toast({
        title: "Perfil actualizado",
        description: "Los cambios se guardaron correctamente",
      });

      setIsDialogOpen(false);
      fetchProfiles();
    } catch (error) {
      console.error('Error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al guardar perfil",
      });
    }
  };

  if (isLoading || !session || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center">
          <img src={cupraLogo} alt="Cupra Wines" className="w-32 h-auto mx-auto opacity-50 animate-pulse" />
          <p className="mt-4 text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <AppNav profile={{ nombre: profile.nombre, rol: profile.rol, perfil_ventas: profile.perfil_ventas }} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-sans text-foreground tracking-tight">Gestión de Perfiles</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {profiles.length} {profiles.length === 1 ? "usuario" : "usuarios"} · administración de accesos
            </p>
          </div>
          <Button disabled={profile.rol !== "administrador"} className="wine-button gap-2" onClick={() => setIsCreateOpen(true)}>
            <UserPlus className="w-4 h-4" />
            Nuevo perfil
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={filterRole} onValueChange={(value: any) => setFilterRole(value)}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="vendedor">Vendedores</SelectItem>
                <SelectItem value="asignador">Asignadores</SelectItem>
                <SelectItem value="administrador">Administradores</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedIds.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedIds.length} seleccionado(s)</span>
              <Button
                size="sm"
                className="wine-button gap-2"
                disabled={isBulkSaving}
                onClick={() => aplicarDoblePerfil(true)}
              >
                <Briefcase className="w-4 h-4" />
                Activar doble perfil
              </Button>
              <Button size="sm" variant="outline" disabled={isBulkSaving} onClick={() => aplicarDoblePerfil(false)}>
                Quitar doble perfil
              </Button>
            </div>
          )}
        </div>


        <div className="bg-card rounded-lg shadow-soft border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      seleccionables.length > 0 &&
                      seleccionables.every((p) => selectedIds.includes(p.id))
                    }
                    onCheckedChange={(checked) =>
                      setSelectedIds(checked ? seleccionables.map((p) => p.id) : [])
                    }
                    aria-label="Seleccionar todos"
                  />
                </TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead>Fecha de Registro</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProfiles.map((profileItem) => {
                const gestion = isAssignorLike(profileItem.rol);
                const editable = puedeGestionar(profileItem);
                return (
                  <TableRow key={profileItem.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(profileItem.id)}
                        disabled={!gestion || !editable}
                        onCheckedChange={(checked) =>
                          setSelectedIds((prev) =>
                            checked
                              ? [...prev, profileItem.id]
                              : prev.filter((id) => id !== profileItem.id),
                          )
                        }
                        aria-label={`Seleccionar ${profileItem.nombre}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{profileItem.nombre}</TableCell>
                    <TableCell>{profileItem.email}</TableCell>
                    <TableCell className="text-sm">
                      {ROLE_LABELS[profileItem.rol] ?? profileItem.rol}
                    </TableCell>
                    <TableCell className="text-sm">
                      {gestion
                        ? profileItem.perfil_ventas
                          ? "Gestión + Ventas"
                          : "Gestión"
                        : "Ventas"}
                    </TableCell>

                    <TableCell>
                      <Switch
                        checked={!!profileItem.activo}
                        onCheckedChange={() => toggleActivo(profileItem)}
                        disabled={!editable}
                        aria-label="Activo"
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(profileItem.created_at).toLocaleDateString('es-ES')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {(profileItem.rol === "vendedor" || profileItem.perfil_ventas) && <Button size="sm" variant="outline" onClick={()=>{setTransferirDesde(profileItem);setTransferirA("");}}>Reasignar pendientes</Button>}
                        <Button
                          size="sm"
                          variant="outline"
                          title="Reiniciar contraseña"
                          onClick={() => enviarResetPassword(profileItem)}
                        >
                          <KeyRound className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Editar"
                          onClick={() => handleOpenDialog(profileItem)}
                          disabled={!editable}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          title="Desactivar perfil"
                          onClick={() => handleDeactivateClick(profileItem)}
                          disabled={profileItem.user_id === session?.user?.id || !editable || !profileItem.activo}
                        >
                          <UserX className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {canManageAssignors(profile?.rol) && (
          <div className="pt-2">
            <PermisosMatriz />
          </div>
        )}


        <Dialog open={Boolean(transferirDesde)} onOpenChange={open=>{if(!open&&!transfiriendo)setTransferirDesde(null);}}>
          <DialogContent><DialogHeader><DialogTitle>Reasignar pendientes de {transferirDesde?.nombre}</DialogTitle></DialogHeader>
            <p className="text-sm">Se transfieren las visitas pendientes, incluidas las futuras. Las realizadas y la cartera permanente se conservan.</p>
            <Select value={transferirA} onValueChange={setTransferirA}><SelectTrigger><SelectValue placeholder="Vendedor de destino" /></SelectTrigger>
              <SelectContent>{profiles.filter(p=>p.activo&&(p.rol==="vendedor"||p.perfil_ventas)&&p.user_id!==transferirDesde?.user_id).map(p=><SelectItem key={p.user_id} value={p.user_id}>{p.nombre}</SelectItem>)}</SelectContent></Select>
            <Button onClick={transferirPendientes} disabled={!transferirA||transfiriendo}>{transfiriendo?"Reasignando...":"Confirmar reasignación"}</Button>
          </DialogContent>
        </Dialog>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo perfil</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-nombre">Nombre y apellido</Label>
                <Input
                  id="new-nombre"
                  value={createData.nombre}
                  onChange={(e) => setCreateData({ ...createData, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={createData.email}
                  onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Contraseña inicial</Label>
                <Input
                  id="new-password"
                  type="text"
                  value={createData.password}
                  onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
                  minLength={8}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo 8 caracteres. Compartila con la persona: puede cambiarla desde "¿Olvidaste tu contraseña?".
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-rol">Rol</Label>
                <Select
                  value={`${createData.rol}${isAssignorLike(createData.rol) && createData.perfil_ventas ? "+ventas" : ""}`}
                  onValueChange={(value) => {
                    const doble = value.endsWith("+ventas");
                    const rol = value.replace("+ventas", "") as AppRole;
                    setCreateData({ ...createData, rol, perfil_ventas: doble });
                  }}
                >
                  <SelectTrigger id="new-rol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="asignador">Asignador</SelectItem>
                    <SelectItem value="asignador+ventas">Asignador + Vendedor</SelectItem>
                    {canManageAssignors(profile?.rol) && (
                      <>
                        <SelectItem value="administrador">Administrador</SelectItem>
                        <SelectItem value="administrador+ventas">Administrador + Vendedor</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="new-activo">Activo</Label>
                <Switch
                  id="new-activo"
                  checked={createData.activo}
                  onCheckedChange={(checked) => setCreateData({ ...createData, activo: checked })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="wine-button" disabled={isCreating}>
                  {isCreating ? "Creando..." : "Crear perfil"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Perfil</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  disabled
                />
                <p className="text-sm text-muted-foreground">
                  El email no se puede modificar
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rol">Rol</Label>
                <Select
                  value={`${formData.rol}${isAssignorLike(formData.rol) && formData.perfil_ventas ? "+ventas" : ""}`}
                  onValueChange={(value) => {
                    const doble = value.endsWith("+ventas");
                    const rol = value.replace("+ventas", "") as AppRole;
                    setFormData({ ...formData, rol, perfil_ventas: doble });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    {canManageAssignors(profile?.rol) && (
                      <>
                        <SelectItem value="asignador">Asignador</SelectItem>
                        <SelectItem value="asignador+ventas">Asignador + Vendedor</SelectItem>
                        <SelectItem value="administrador">Administrador</SelectItem>
                        <SelectItem value="administrador+ventas">Administrador + Vendedor</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="activo">Activo</Label>
                <Switch
                  id="activo"
                  checked={formData.activo}
                  onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="wine-button">
                  Actualizar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Confirmación de baja */}
        <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                Se bloqueará el acceso y se conservará el historial de{" "}
                <span className="font-semibold">{profileToDeactivate?.nombre}</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeactivateConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Desactivar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <VendedoresDelExcel puedeEditar={profile.rol === "administrador"} />
      </main>
    </div>
  );
};

export default Profiles;
