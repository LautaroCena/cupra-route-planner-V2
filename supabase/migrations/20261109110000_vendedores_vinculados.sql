-- Vínculo fijo entre el nombre del vendedor que viene en el Excel y su usuario de la app.
-- Antes se adivinaba por el nombre en cada generación: si estaba escrito distinto en los
-- dos lugares, la cartera de ese vendedor desaparecía sin aviso claro.
-- Lo carga un administrador una sola vez; si un nombre no está vinculado, se sigue
-- intentando por el nombre como antes.

CREATE TABLE IF NOT EXISTS public.vendedores_vinculados (
  nombre text PRIMARY KEY CHECK (nombre = upper(btrim(nombre)) AND nombre <> ''),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendedores_vinculados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vinculos_leer" ON public.vendedores_vinculados;
CREATE POLICY "vinculos_leer" ON public.vendedores_vinculados FOR SELECT TO authenticated
  USING (public.is_assignor_like(auth.uid()));
DROP POLICY IF EXISTS "vinculos_admin" ON public.vendedores_vinculados;
CREATE POLICY "vinculos_admin" ON public.vendedores_vinculados FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendedores_vinculados TO authenticated;
GRANT ALL ON public.vendedores_vinculados TO service_role;

-- Nombres de vendedor que usa la cartera, con cuántos clientes tiene cada uno.
CREATE OR REPLACE FUNCTION public.nombres_vendedores_excel()
RETURNS TABLE(nombre text, clientes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT upper(btrim(vendedor_actual)), count(*)
  FROM public.clientes
  WHERE public.is_assignor_like(auth.uid()) AND nullif(btrim(vendedor_actual), '') IS NOT NULL
  GROUP BY 1 ORDER BY 2 DESC, 1;
$$;
REVOKE ALL ON FUNCTION public.nombres_vendedores_excel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nombres_vendedores_excel() TO authenticated, service_role;
