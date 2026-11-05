import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import cupraLogo from "@/assets/cupra-logo-new.png";

const googleTermsUrl = "https://maps.google.com/help/terms_maps/";
const googlePrivacyUrl = "https://policies.google.com/privacy";

export default function Legal() {
  const { pathname } = useLocation();
  const isPrivacy = pathname === "/privacidad";

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:py-12">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild className="gap-2">
            <Link to="/auth"><ArrowLeft className="h-4 w-4" /> Volver</Link>
          </Button>
          <img src={cupraLogo} alt="Cupra Wines" className="h-8 w-auto opacity-70" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-2xl">
              {isPrivacy ? "Política de Privacidad" : "Términos de Uso"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Versión piloto · Actualizada el 10 de agosto de 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none text-foreground/85">
            {isPrivacy ? <PrivacyContent /> : <TermsContent />}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function PrivacyContent() {
  return (
    <>
      <p>
        Esta plataforma de uso comercial interno es administrada por el equipo responsable del planificador de rutas de CUPRA Wines.
        Esta política describe el tratamiento de información durante la etapa piloto.
      </p>
      <h2>Información tratada</h2>
      <ul>
        <li>Datos de cuenta: nombre, correo, rol y estado de acceso.</li>
        <li>Información comercial aportada por usuarios autorizados: clientes, ventas, prospectos, visitas, asignaciones y feedback.</li>
        <li>Datos técnicos necesarios para seguridad, diagnóstico y auditoría de cargas.</li>
        <li>Ubicación cuando una función concreta la solicita para mapas, geocodificación o planificación de rutas.</li>
      </ul>
      <h2>Finalidades</h2>
      <p>
        Los datos se utilizan para administrar cartera comercial, planificar visitas, controlar calidad de información, detectar duplicados,
        generar recomendaciones y mantener la seguridad del servicio. No se venden datos personales.
      </p>
      <h2>Proveedores</h2>
      <p>
        La plataforma utiliza servicios de infraestructura y publicación de Supabase y Vercel. Algunas funciones utilizan Google Maps
        Platform. El uso de contenido y servicios de Google Maps también está sujeto a los
        {" "}<a href={googleTermsUrl} target="_blank" rel="noreferrer">Términos de Google Maps</a> y a la
        {" "}<a href={googlePrivacyUrl} target="_blank" rel="noreferrer">Política de Privacidad de Google</a>.
      </p>
      <p>
        En el buscador asistido de prospectos, los resultados de Google Maps se muestran transitoriamente. La cola interna conserva sólo
        el identificador del lugar y metadatos propios del proceso de investigación.
      </p>
      <h2>Conservación y seguridad</h2>
      <p>
        La información se conserva mientras resulte necesaria para el piloto, las operaciones comerciales o las obligaciones aplicables.
        El acceso se limita por autenticación y roles. Los lotes fallidos de importación conservan staging temporal por hasta siete días.
      </p>
      <h2>Consultas y derechos</h2>
      <p>
        Para solicitar acceso, corrección o eliminación de información, contactá al administrador de la cuenta CUPRA Wines que habilitó
        tu acceso. Antes de producción deberá incorporarse aquí el canal formal y la identificación legal del responsable.
      </p>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <p>
        Estos términos regulan el uso autorizado del planificador de rutas de CUPRA Wines durante su etapa piloto. Al ingresar, la persona
        usuaria acepta utilizar la plataforma exclusivamente para tareas comerciales habilitadas por su organización.
      </p>
      <h2>Acceso y cuentas</h2>
      <ul>
        <li>Las credenciales son personales y no deben compartirse.</li>
        <li>Los permisos dependen del rol asignado y pueden revocarse.</li>
        <li>La persona usuaria debe informar accesos indebidos o errores de datos al administrador.</li>
      </ul>
      <h2>Uso de la información</h2>
      <p>
        Los datos de clientes, ventas y prospectos deben cargarse con una finalidad comercial legítima y con autorización suficiente.
        Queda prohibido extraer, revender o utilizar la información para fines ajenos al piloto.
      </p>
      <h2>Google Maps</h2>
      <p>
        Algunas funciones incorporan Google Maps Platform. Su uso está sujeto a los
        {" "}<a href={googleTermsUrl} target="_blank" rel="noreferrer">Términos de Google Maps</a> y a la
        {" "}<a href={googlePrivacyUrl} target="_blank" rel="noreferrer">Política de Privacidad de Google</a>.
        No está permitido copiar, almacenar masivamente ni crear una base paralela con contenido de Google Maps. El buscador guarda sólo
        identificadores de lugar y datos internos de seguimiento permitidos por el flujo.
      </p>
      <h2>Exactitud y disponibilidad</h2>
      <p>
        Las recomendaciones son apoyo para la decisión comercial y deben ser revisadas por una persona. Durante el piloto pueden existir
        interrupciones, cambios o datos incompletos. Los usuarios deben verificar direcciones, contactos y prioridades antes de una visita.
      </p>
      <h2>Versión piloto</h2>
      <p>
        Este texto es operativo y provisorio. Antes del paso a producción debe ser revisado por el responsable legal, completar datos de
        contacto y adecuarse a las políticas internas y normativa aplicable.
      </p>
    </>
  );
}
