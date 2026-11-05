-- Cola interna para descubrir prospectos sin persistir contenido de Google Places.

CREATE TABLE IF NOT EXISTS public.prospect_discovery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL UNIQUE,
  fuente text NOT NULL DEFAULT 'google_places'
    CHECK (fuente IN ('google_places', 'referido', 'campo', 'otra')),
  estado text NOT NULL DEFAULT 'NUEVO'
    CHECK (estado IN ('NUEVO', 'EN_REVISION', 'CONVERTIDO', 'DESCARTADO')),
  consulta text NOT NULL,
  zona text,
  notas text,
  creado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  convertido_prospecto_place_id text REFERENCES public.prospectos(place_id) ON DELETE SET NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_discovery_queue_estado
  ON public.prospect_discovery_queue (estado, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_discovery_queue_creado_por
  ON public.prospect_discovery_queue (creado_por, discovered_at DESC);

GRANT SELECT ON public.prospect_discovery_queue TO authenticated;
GRANT ALL ON public.prospect_discovery_queue TO service_role;

ALTER TABLE public.prospect_discovery_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Asignadores pueden ver cola de prospectos" ON public.prospect_discovery_queue;
DROP POLICY IF EXISTS "Asignadores pueden ver cola de prospectos" ON public.prospect_discovery_queue;
CREATE POLICY "Asignadores pueden ver cola de prospectos"
  ON public.prospect_discovery_queue
  FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'asignador'::public.app_role);

DROP TRIGGER IF EXISTS update_prospect_discovery_queue_updated_at ON public.prospect_discovery_queue;
CREATE TRIGGER update_prospect_discovery_queue_updated_at
  BEFORE UPDATE ON public.prospect_discovery_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Service role acceso completo prospectos" ON public.prospectos;
DROP POLICY IF EXISTS "Usuarios autenticados pueden ver prospectos" ON public.prospectos;
DROP POLICY IF EXISTS "Usuarios autenticados reales pueden ver prospectos" ON public.prospectos;

DROP POLICY IF EXISTS "Usuarios autenticados reales pueden ver prospectos" ON public.prospectos;
CREATE POLICY "Usuarios autenticados reales pueden ver prospectos"
  ON public.prospectos
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuarios autenticados pueden crear prospectos manuales" ON public.prospectos;
CREATE POLICY "Usuarios autenticados pueden crear prospectos manuales"
  ON public.prospectos
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Service role real acceso completo prospectos" ON public.prospectos;
CREATE POLICY "Service role real acceso completo prospectos"
  ON public.prospectos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.prospect_discovery_queue IS
  'Cola de lugares a investigar. Para Google Places conserva solo place_id y metadatos internos.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nombre, email, rol, activo)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'nombre', 'Usuario'),
    new.email,
    'vendedor'::public.app_role,
    false
  );
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_assignor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND rol = 'asignador'::public.app_role
      AND activo IS TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND activo IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_assignor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_assignor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated, service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Asignadores can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Asignadores can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Usuarios ven su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Asignadores activos gestionan perfiles" ON public.profiles;

DROP POLICY IF EXISTS "Usuarios ven su propio perfil" ON public.profiles;
CREATE POLICY "Usuarios ven su propio perfil"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Asignadores activos gestionan perfiles" ON public.profiles;
CREATE POLICY "Asignadores activos gestionan perfiles"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_active_assignor(auth.uid()))
  WITH CHECK (public.is_active_assignor(auth.uid()));

DROP POLICY IF EXISTS "Solo usuarios activos acceden a prospectos" ON public.prospectos;
DROP POLICY IF EXISTS "Solo usuarios activos acceden a prospectos" ON public.prospectos;
CREATE POLICY "Solo usuarios activos acceden a prospectos"
  ON public.prospectos
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_active_user(auth.uid()))
  WITH CHECK (public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Solo asignadores activos acceden a cola de prospectos" ON public.prospect_discovery_queue;
DROP POLICY IF EXISTS "Solo asignadores activos acceden a cola de prospectos" ON public.prospect_discovery_queue;
CREATE POLICY "Solo asignadores activos acceden a cola de prospectos"
  ON public.prospect_discovery_queue
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.is_active_assignor(auth.uid()))
  WITH CHECK (public.is_active_assignor(auth.uid()));
