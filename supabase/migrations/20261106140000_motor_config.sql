-- Parámetros del motor de rutas, configurables sin tocar código (Etapa 3).
-- Una sola fila. Lo que falta usa el valor por defecto de _shared/seleccion.ts.
-- El radio (1,5 km) y la franja (1,6 km) no van acá: los validan también la pantalla
-- y la base (_shared/ruta.ts y guardar_ruta_mapa), y tienen que coincidir.
CREATE TABLE IF NOT EXISTS public.motor_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
COMMENT ON TABLE public.motor_config IS
  'Parámetros del motor: limite (hasta 8), topeKm, penalizacionFranja (puntos de valor), maxCambiosFranja y pesos {recorrido, recuperacion, oportunidad, potencial}.';

INSERT INTO public.motor_config (id, parametros) VALUES (true, jsonb_build_object(
  'limite', 8,
  'topeKm', 3.5,
  'penalizacionFranja', 17,
  'maxCambiosFranja', 1,
  'pesos', jsonb_build_object('recorrido', 35, 'recuperacion', 25, 'oportunidad', 25, 'potencial', 15)
)) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.motor_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS motor_config_lectura ON public.motor_config;
CREATE POLICY motor_config_lectura ON public.motor_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS motor_config_admin ON public.motor_config;
CREATE POLICY motor_config_admin ON public.motor_config FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.activo AND p.rol = 'administrador'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.activo AND p.rol = 'administrador'));
GRANT SELECT, UPDATE ON public.motor_config TO authenticated;
