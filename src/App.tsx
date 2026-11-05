import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cargarFechaCorte } from "@/lib/fechaCorte";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Profiles from "./pages/Profiles";
import ClientesDashboard from "./pages/ClientesDashboard";
import ClientesEdicion from "./pages/ClientesEdicion";
import ProspectosDashboard from "./pages/ProspectosDashboard";
import AreasManager from "./pages/AreasManager";
import VendedorDashboard from "./pages/VendedorDashboard";
import SupervisionVendedores from "./pages/SupervisionVendedores";
import NotFound from "./pages/NotFound";
import CargaDatos from "./pages/CargaDatos";
import Legal from "./pages/Legal";
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
        </FechaDeDatos>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
