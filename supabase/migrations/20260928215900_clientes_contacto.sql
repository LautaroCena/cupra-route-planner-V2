-- Columnas de contacto existentes en la base original que no estaban en el historial.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS telefonos text[],
  ADD COLUMN IF NOT EXISTS emails text[];
