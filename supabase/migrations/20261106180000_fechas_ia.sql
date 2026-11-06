-- Fechas que mueven la venta de vino, según la IA, por semana (_shared/oportunidad.ts).
-- Una consulta por semana: el código las comprueba y las aplica a cada negocio por su rubro.
CREATE TABLE IF NOT EXISTS public.fechas_ia (
  semana text PRIMARY KEY,          -- '2026-W45'
  version integer NOT NULL,         -- versión del pedido a la IA; si cambia, se vuelve a preguntar
  fechas jsonb NOT NULL DEFAULT '[]'::jsonb,
  modelo text,
  calculado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fechas_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fechas_ia_lectura ON public.fechas_ia;
CREATE POLICY fechas_ia_lectura ON public.fechas_ia FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.fechas_ia TO authenticated;
