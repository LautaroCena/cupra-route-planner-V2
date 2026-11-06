-- El motor lee solo los últimos comentarios de cada comercio. Antes leía todos y
-- cortaba en 50.000 filas sin avisar: con el tiempo se perdían comentarios.
-- Para excluir vale el más reciente (_shared/reglas.ts); el segundo se muestra como contexto.
CREATE OR REPLACE FUNCTION public.comentarios_recientes(p_por_comercio integer DEFAULT 2)
RETURNS TABLE (
  id uuid, client_id text, prospecto_place_id text, vendedor_id uuid, visita_realizada boolean,
  feedback text, motivo_no_visita text, tipo_interaccion text, estado_cliente text, created_at timestamptz,
  revisit_date date, resumen text, confianza numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.client_id, f.prospecto_place_id, f.vendedor_id, f.visita_realizada, f.feedback,
    f.motivo_no_visita, f.tipo_interaccion, f.estado_cliente, f.created_at,
    e.revisit_date, e.resumen, e.confianza
  FROM (
    SELECT cf.*, row_number() OVER (
      PARTITION BY coalesce('C:' || cf.client_id, 'P:' || cf.prospecto_place_id)
      ORDER BY cf.created_at DESC NULLS LAST, cf.id
    ) AS n
    FROM public.cliente_feedbacks cf
    WHERE cf.client_id IS NOT NULL OR cf.prospecto_place_id IS NOT NULL
  ) f
  LEFT JOIN public.feedback_extraccion e ON e.feedback_id = f.id
  WHERE f.n <= greatest(1, least(coalesce(p_por_comercio, 2), 10))
  ORDER BY f.created_at DESC NULLS LAST, f.id;
$$;
REVOKE ALL ON FUNCTION public.comentarios_recientes(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comentarios_recientes(integer) TO service_role;
