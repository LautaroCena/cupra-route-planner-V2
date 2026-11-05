-- Otros nombres con que aparece un cliente en los archivos: ayudan a encontrarlo, no lo cambian.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS nombres_alternativos text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.guardar_nombres_alternativos(p_filas jsonb)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filas AS (
    SELECT x->>'client_id' AS client_id, ARRAY(SELECT jsonb_array_elements_text(x->'nombres')) AS nombres
    FROM jsonb_array_elements(p_filas) x
  ), cambios AS (
    UPDATE public.clientes c
    SET nombres_alternativos = ARRAY(SELECT DISTINCT n FROM unnest(c.nombres_alternativos || f.nombres) n ORDER BY n)
    FROM filas f
    WHERE c.client_id = f.client_id
    RETURNING 1
  )
  SELECT count(*)::integer FROM cambios;
$$;
REVOKE ALL ON FUNCTION public.guardar_nombres_alternativos(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_nombres_alternativos(jsonb) TO service_role;

-- "S/D" y "0" no son ciudades: quedaron de cargas anteriores a la limpieza.
UPDATE public.clientes SET ciudad_principal = NULL
WHERE upper(btrim(ciudad_principal)) IN ('S/D', 'SD', '0', '-', 'N/A');
