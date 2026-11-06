-- Puntajes de Oportunidad que dio la IA, ya comprobados por código (_shared/oportunidad.ts).
-- Se repuntúa solo si cambia algo del negocio (rubro, canal, último comentario) o la semana:
-- las fechas cercanas cambian con el calendario. Así no se le pregunta a la IA en cada ruta.
CREATE TABLE IF NOT EXISTS public.oportunidad_ia (
  clave text PRIMARY KEY,               -- 'C:<client_id>' o 'P:<place_id>'
  huella text NOT NULL,                 -- lo que se le mostró a la IA; si cambia, se repuntúa
  nivel integer CHECK (nivel BETWEEN 0 AND 3),
  motivo text CHECK (motivo IN ('fecha', 'comentario')),
  fecha date,
  evento text,
  cita text,
  rechazo text,                         -- por qué el código no aceptó lo que dijo la IA
  modelo text,
  calculado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oportunidad_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oportunidad_ia_lectura ON public.oportunidad_ia;
CREATE POLICY oportunidad_ia_lectura ON public.oportunidad_ia FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.activo AND p.rol IN ('administrador', 'asignador')));
GRANT SELECT ON public.oportunidad_ia TO authenticated;
