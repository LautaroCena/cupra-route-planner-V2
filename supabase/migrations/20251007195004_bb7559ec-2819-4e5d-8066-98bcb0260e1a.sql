-- Crear tabla clientes_unificados
CREATE TABLE public.clientes_unificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social text NOT NULL,
  cuit_dni text,
  monto_total_vendido numeric(14,2) DEFAULT 0,
  orders_count integer DEFAULT 0,
  avg_ticket numeric(14,2) DEFAULT 0,
  first_purchase_at date,
  last_purchase_at date,
  days_since_last_purchase integer,
  participacion numeric(8,4),
  score_volumen integer,
  score_recencia integer,
  score_comercial integer,
  score_volumen_num integer,
  score_recencia_num integer,
  priority_score integer,
  etiquetas text[],
  ciudades text[],
  provincias text[],
  telefonos text[],
  vendedores text[],
  created_at timestamp with time zone DEFAULT now()
);

-- Crear tabla ventas_cupra
CREATE TABLE public.ventas_cupra (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket text,
  letra text,
  fecha_emision date,
  sucursal text,
  origen text,
  numero_externo text,
  cuit_dni text,
  razon_social text,
  fantasia text,
  codigo_producto text,
  codigo_variante text,
  codigo_oem text,
  etiqueta text,
  variante text,
  iva numeric(10,2),
  impuesto_interno numeric(10,2),
  marca text,
  kilogramos numeric(10,3),
  ancho numeric(10,2),
  alto numeric(10,2),
  largo numeric(10,2),
  cantidad numeric(10,2),
  bonificacion numeric(10,2),
  costo_unit_neto numeric(14,2),
  costo_unit_bruto numeric(14,2),
  precio_unit_neto numeric(14,2),
  precio_total_neto numeric(14,2),
  costo_financiero_unit_bruto numeric(14,2),
  precio_unit_final numeric(14,2),
  precio_total_final numeric(14,2),
  financiacion text,
  financiacion_aplicacion text,
  forma_envio text,
  envio text,
  envio_gratis_me boolean,
  pais text,
  provincia text,
  calle text,
  numero text,
  entrecalles text,
  piso text,
  departamento text,
  ciudad text,
  codigo_postal text,
  telefono text,
  latitud numeric(10,6),
  longitud numeric(10,6),
  envio_observacion text,
  condicion_pago text,
  recibo text,
  medio_pago_tienda text,
  cupon_descuento text,
  proveedor text,
  codigo_proveedor text,
  categorias_proveedor text,
  categorias_productos text,
  categorias_cliente text,
  vendedor text,
  operador text,
  created_at timestamp with time zone DEFAULT now()
);

-- Recrear tabla sucursales con nueva estructura
DROP TABLE IF EXISTS public.sucursales CASCADE;

CREATE TABLE public.sucursales (
  id_sucursal UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_cliente UUID REFERENCES public.clientes_unificados(id) ON DELETE CASCADE,
  nombre_maps TEXT NOT NULL,
  google_place_id TEXT,
  direccion TEXT NOT NULL,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  barrio TEXT,
  ciudad TEXT NOT NULL,
  provincia TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'activo',
  telefono_local TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security en las nuevas tablas
ALTER TABLE public.clientes_unificados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_cupra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para clientes_unificados (usuarios autenticados pueden leer)
CREATE POLICY "Authenticated users can view clientes_unificados"
ON public.clientes_unificados
FOR SELECT
USING (auth.role() = 'authenticated');

-- Políticas RLS para ventas_cupra (usuarios autenticados pueden leer)
CREATE POLICY "Authenticated users can view ventas_cupra"
ON public.ventas_cupra
FOR SELECT
USING (auth.role() = 'authenticated');

-- Políticas RLS para sucursales (usuarios autenticados pueden leer)
CREATE POLICY "Authenticated users can view sucursales"
ON public.sucursales
FOR SELECT
USING (auth.role() = 'authenticated');

-- Trigger para actualizar updated_at en sucursales
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sucursales_updated_at
BEFORE UPDATE ON public.sucursales
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();