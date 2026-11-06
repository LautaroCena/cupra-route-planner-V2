import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Fragment, lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cargarFechaCorte } from "@/lib/fechaCorte";
import Auth from "./pages/Auth";

/**
 * Cada pantalla se descarga cuando se abre: el celular de un vendedor no baja el código
 * del asignador. Si una pestaña vieja pide una parte que ya no existe (hubo una
 * publicación nueva), se recarga una vez para tomar la versión actual.
 */
function pantalla(cargar: () => Promise<{ default: ComponentType }>) {
  return lazy(() => cargar().catch((error) => {
    const clave = "recarga-por-version";
    if (!sessionStorage.getItem(clave)) {
      sessionStorage.setItem(clave, "1");
      window.location.reload();
      return new Promise<never>(() => {});
    }
    throw error;
  }).then((m) => { sessionStorage.removeItem("recarga-por-version"); return m; }));
}
const Index = pantalla(() => import("./pages/Index"));
const Profiles = pantalla(() => import("./pages/Profiles"));
const ClientesDashboard = pantalla(() => import("./pages/ClientesDashboard"));
const ClientesEdicion = pantalla(() => import("./pages/ClientesEdicion"));
const ProspectosDashboard = pantalla(() => import("./pages/ProspectosDashboard"));
const AreasManager = pantalla(() => import("./pages/AreasManager"));
const VendedorDashboard = pantalla(() => import("./pages/VendedorDashboard"));
const SupervisionVendedores = pantalla(() => import("./pages/SupervisionVendedores"));
const CargaDatos = pantalla(() => import("./pages/CargaDatos"));
const Legal = pantalla(() => import("./pages/Legal"));

const Cargando = () => (
  <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Cargando…</div>
);
import NotFound from "./pages/NotFound";
import { AppUpdateWatcher } from "./components/AppUpdateWatcher";

const queryClient = new QueryClient();

/** Carga la fecha de los datos al iniciar sesión. Solo remonta las pantallas si cambió, para no perder lo que se está editando. */
const FechaDeDatos = ({ children }: { children: ReactNode }) => {
  const [version, setVersion] = useState(0);
  const ultima = useRef<string | null>(null);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      if (!sesion) return;
      setTimeout(async () => {
        const fecha = await cargarFechaCorte();
        if (fecha !== ultima.current) {
          ultima.current = fecha;
          setVersion((v) => v + 1);
        }
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, []);
  return <Fragment key={version}>{children}</Fragment>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppUpdateWatcher />
      <BrowserRouter>
        <FechaDeDatos>
        <Suspense fallback={<Cargando />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/clientes-dashboard" element={<ClientesDashboard />} />
          <Route path="/clientes-edicion" element={<ClientesEdicion />} />
          <Route path="/prospectos-dashboard" element={<ProspectosDashboard />} />
          <Route path="/areas" element={<AreasManager />} />
          <Route path="/vendedor-dashboard" element={<VendedorDashboard />} />
          <Route path="/supervision-vendedores" element={<SupervisionVendedores />} />
          <Route path="/carga-datos" element={<CargaDatos />} />
          <Route path="/privacidad" element={<Legal />} />
          <Route path="/terminos" element={<Legal />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </FechaDeDatos>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
