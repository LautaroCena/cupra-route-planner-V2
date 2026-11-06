-- El motor guarda cada recomendación con el local en el que entró a la ruta
-- (clientes con varios locales). Faltaba la columna y la generación fallaba.
ALTER TABLE public.recomendaciones_ia
  ADD COLUMN IF NOT EXISTS client_place_id uuid REFERENCES public.client_places(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
