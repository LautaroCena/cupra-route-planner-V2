export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activaciones: {
        Row: {
          client_id: string | null
          created_at: string
          descripcion: string | null
          fecha: string
          id: string
          prospecto_place_id: string | null
          tipo: string
          vendedor_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          descripcion?: string | null
          fecha?: string
          id?: string
          prospecto_place_id?: string | null
          tipo: string
          vendedor_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          descripcion?: string | null
          fecha?: string
          id?: string
          prospecto_place_id?: string | null
          tipo?: string
          vendedor_id?: string
        }
        Relationships: []
      }
      areas: {
        Row: {
          color: string | null
          comentarios: string | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          comentarios?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          comentarios?: string | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "areas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      areas_places: {
        Row: {
          area_id: string
          created_at: string | null
          created_by: string | null
          id: string
          place_id: string
        }
        Insert: {
          area_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          place_id: string
        }
        Update: {
          area_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_places_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_places_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      areas_vendedores: {
        Row: {
          area_id: string
          created_at: string | null
          created_by: string | null
          id: string
          vendedor_id: string
        }
        Insert: {
          area_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          vendedor_id: string
        }
        Update: {
          area_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_vendedores_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_vendedores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_vendedores_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      asignaciones_manuales_audit: {
        Row: {
          client_id: string
          created_at: string
          id: string
          razon_social: string | null
          usuario_id: string
          vendedor_anterior: string | null
          vendedor_nuevo_id: string
          vendedor_nuevo_nombre: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          razon_social?: string | null
          usuario_id: string
          vendedor_anterior?: string | null
          vendedor_nuevo_id: string
          vendedor_nuevo_nombre: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          razon_social?: string | null
          usuario_id?: string
          vendedor_anterior?: string | null
          vendedor_nuevo_id?: string
          vendedor_nuevo_nombre?: string
        }
        Relationships: []
      }
      asignaciones_vendedores_clientes: {
        Row: {
          client_id: string | null
          created_at: string
          es_prospecto: boolean
          estado: Database["public"]["Enums"]["estado_asignacion"]
          fecha_programada: string | null
          id: string
          orden_ruta: number | null
          origen_asignacion: string
          prospecto_place_id: string | null
          vendedor_id: string
          visited_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          es_prospecto?: boolean
          estado?: Database["public"]["Enums"]["estado_asignacion"]
          fecha_programada?: string | null
          id?: string
          orden_ruta?: number | null
          origen_asignacion?: string
          prospecto_place_id?: string | null
          vendedor_id: string
          visited_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          es_prospecto?: boolean
          estado?: Database["public"]["Enums"]["estado_asignacion"]
          fecha_programada?: string | null
          id?: string
          orden_ruta?: number | null
          origen_asignacion?: string
          prospecto_place_id?: string | null
          vendedor_id?: string
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asignaciones_vendedores_clientes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "asignaciones_vendedores_clientes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_prospecto"
            columns: ["prospecto_place_id"]
            isOneToOne: false
            referencedRelation: "prospectos"
            referencedColumns: ["place_id"]
          },
        ]
      }
      client_places: {
        Row: {
          barrio_principal: string | null
          client_id: string
          codigo_postal: string | null
          comuna: string | null
          created_at: string | null
          direccion_principal: string | null
          direccion_verificada: boolean
          fuente_geocoding: string | null
          google_maps_link: string | null
          id: string
          is_primary: boolean | null
          lat: number
          long: number
          place_id: string | null
          precision_geocoding: string | null
          provincia_principal: string | null
          ubicacion_confiable: boolean
          updated_at: string | null
        }
        Insert: {
          barrio_principal?: string | null
          client_id: string
          codigo_postal?: string | null
          comuna?: string | null
          created_at?: string | null
          direccion_principal?: string | null
          direccion_verificada?: boolean
          fuente_geocoding?: string | null
          google_maps_link?: string | null
          id?: string
          is_primary?: boolean | null
          lat: number
          long: number
          place_id?: string | null
          precision_geocoding?: string | null
          provincia_principal?: string | null
          ubicacion_confiable?: boolean
          updated_at?: string | null
        }
        Update: {
          barrio_principal?: string | null
          client_id?: string
          codigo_postal?: string | null
          comuna?: string | null
          created_at?: string | null
          direccion_principal?: string | null
          direccion_verificada?: boolean
          fuente_geocoding?: string | null
          google_maps_link?: string | null
          id?: string
          is_primary?: boolean | null
          lat?: number
          long?: number
          place_id?: string | null
          precision_geocoding?: string | null
          provincia_principal?: string | null
          ubicacion_confiable?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      cliente_feedbacks: {
        Row: {
          actualizar_etiqueta_wa: string | null
          client_id: string | null
          created_at: string
          estado_cliente: string | null
          feedback: string
          id: string
          motivo_no_visita: string | null
          prospecto_place_id: string | null
          tipo_interaccion: string | null
          vendedor_id: string
          visita_realizada: boolean
        }
        Insert: {
          actualizar_etiqueta_wa?: string | null
          client_id?: string | null
          created_at?: string
          estado_cliente?: string | null
          feedback: string
          id?: string
          motivo_no_visita?: string | null
          prospecto_place_id?: string | null
          tipo_interaccion?: string | null
          vendedor_id: string
          visita_realizada?: boolean
        }
        Update: {
          actualizar_etiqueta_wa?: string | null
          client_id?: string | null
          created_at?: string
          estado_cliente?: string | null
          feedback?: string
          id?: string
          motivo_no_visita?: string | null
          prospecto_place_id?: string | null
          tipo_interaccion?: string | null
          vendedor_id?: string
          visita_realizada?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cliente_feedbacks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "cliente_feedbacks_prospecto_place_id_fkey"
            columns: ["prospecto_place_id"]
            isOneToOne: false
            referencedRelation: "prospectos"
            referencedColumns: ["place_id"]
          },
        ]
      }
      clientes: {
        Row: {
          barrio_principal: string | null
          cadencia_dias: number | null
          canal: string | null
          cantidad_ordenes: number | null
          categoria_recencia: string | null
          categoria_volumen: string | null
          ciudad_principal: string | null
          client_id: string
          codigo_postal: string | null
          created_at: string | null
          cuit_dni: string | null
          dias_desde_ultima_compra: number | null
          direccion_principal: string | null
          emails: string[] | null
          etiquetas: string[] | null
          excluir_recomendaciones: boolean | null
          fantasia: string | null
          fecha_ultima_nc: string | null
          fuente_monto: string
          id: string
          last_recommendation_at: string | null
          monto_nc_concepto: number
          monto_nc_producto: number
          monto_notas_credito: number | null
          monto_total_cupra: number | null
          monto_total_historico: number | null
          motivo_exclusion: string | null
          participacion_mercado: number | null
          precio_promedio_caja: number | null
          primera_compra: string | null
          productos_comprados: string[] | null
          provincia_principal: string | null
          razon_social: string | null
          requiere_visita: string | null
          rubro: string | null
          score_comercial: number | null
          score_recencia: number | null
          score_volumen: number | null
          share_cupra: number | null
          telefonos: string[] | null
          ticket_promedio: number | null
          todas_ciudades: string[] | null
          todas_direcciones: string[] | null
          todos_barrios: string[] | null
          todos_vendedores: string[] | null
          ultima_compra: string | null
          ultima_visita: string | null
          updated_at: string | null
          vendedor_actual: string | null
          vendedor_principal: string | null
        }
        Insert: {
          barrio_principal?: string | null
          cadencia_dias?: number | null
          canal?: string | null
          cantidad_ordenes?: number | null
          categoria_recencia?: string | null
          categoria_volumen?: string | null
          ciudad_principal?: string | null
          client_id: string
          codigo_postal?: string | null
          created_at?: string | null
          cuit_dni?: string | null
          dias_desde_ultima_compra?: number | null
          direccion_principal?: string | null
          emails?: string[] | null
          etiquetas?: string[] | null
          excluir_recomendaciones?: boolean | null
          fantasia?: string | null
          fecha_ultima_nc?: string | null
          fuente_monto?: string
          id?: string
          last_recommendation_at?: string | null
          monto_nc_concepto?: number
          monto_nc_producto?: number
          monto_notas_credito?: number | null
          monto_total_cupra?: number | null
          monto_total_historico?: number | null
          motivo_exclusion?: string | null
          participacion_mercado?: number | null
          precio_promedio_caja?: number | null
          primera_compra?: string | null
          productos_comprados?: string[] | null
          provincia_principal?: string | null
          razon_social?: string | null
          requiere_visita?: string | null
          rubro?: string | null
          score_comercial?: number | null
          score_recencia?: number | null
          score_volumen?: number | null
          share_cupra?: number | null
          telefonos?: string[] | null
          ticket_promedio?: number | null
          todas_ciudades?: string[] | null
          todas_direcciones?: string[] | null
          todos_barrios?: string[] | null
          todos_vendedores?: string[] | null
          ultima_compra?: string | null
          ultima_visita?: string | null
          updated_at?: string | null
          vendedor_actual?: string | null
          vendedor_principal?: string | null
        }
        Update: {
          barrio_principal?: string | null
          cadencia_dias?: number | null
          canal?: string | null
          cantidad_ordenes?: number | null
          categoria_recencia?: string | null
          categoria_volumen?: string | null
          ciudad_principal?: string | null
          client_id?: string
          codigo_postal?: string | null
          created_at?: string | null
          cuit_dni?: string | null
          dias_desde_ultima_compra?: number | null
          direccion_principal?: string | null
          emails?: string[] | null
          etiquetas?: string[] | null
          excluir_recomendaciones?: boolean | null
          fantasia?: string | null
          fecha_ultima_nc?: string | null
          fuente_monto?: string
          id?: string
          last_recommendation_at?: string | null
          monto_nc_concepto?: number
          monto_nc_producto?: number
          monto_notas_credito?: number | null
          monto_total_cupra?: number | null
          monto_total_historico?: number | null
          motivo_exclusion?: string | null
          participacion_mercado?: number | null
          precio_promedio_caja?: number | null
          primera_compra?: string | null
          productos_comprados?: string[] | null
          provincia_principal?: string | null
          razon_social?: string | null
          requiere_visita?: string | null
          rubro?: string | null
          score_comercial?: number | null
          score_recencia?: number | null
          score_volumen?: number | null
          share_cupra?: number | null
          telefonos?: string[] | null
          ticket_promedio?: number | null
          todas_ciudades?: string[] | null
          todas_direcciones?: string[] | null
          todos_barrios?: string[] | null
          todos_vendedores?: string[] | null
          ultima_compra?: string | null
          ultima_visita?: string | null
          updated_at?: string | null
          vendedor_actual?: string | null
          vendedor_principal?: string | null
        }
        Relationships: []
      }
      clientes_informacion_complementaria: {
        Row: {
          client_id: string
          datos: Json
          fuente: string
          prospecto_place_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          datos: Json
          fuente?: string
          prospecto_place_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          datos?: Json
          fuente?: string
          prospecto_place_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_informacion_complementaria_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "clientes_informacion_complementaria_prospecto_place_id_fkey"
            columns: ["prospecto_place_id"]
            isOneToOne: false
            referencedRelation: "prospectos"
            referencedColumns: ["place_id"]
          },
        ]
      }
      clientes_recomendaciones_temporal: {
        Row: {
          avg_ticket: number | null
          ciudades: string[] | null
          client_id: string | null
          created_at: string | null
          cuit_dni: string | null
          days_since_last_purchase: number | null
          etiquetas: string[] | null
          first_purchase_at: string | null
          id: string
          last_purchase_at: string | null
          monto_total_vendido: number | null
          orders_count: number | null
          participacion: number | null
          priority_score: number | null
          provincias: string[] | null
          razon_social: string
          score_comercial: string | null
          score_recencia: string | null
          score_recencia_num: number | null
          score_volumen: string | null
          score_volumen_num: number | null
          telefonos: string[] | null
          vendedores: string[] | null
        }
        Insert: {
          avg_ticket?: number | null
          ciudades?: string[] | null
          client_id?: string | null
          created_at?: string | null
          cuit_dni?: string | null
          days_since_last_purchase?: number | null
          etiquetas?: string[] | null
          first_purchase_at?: string | null
          id?: string
          last_purchase_at?: string | null
          monto_total_vendido?: number | null
          orders_count?: number | null
          participacion?: number | null
          priority_score?: number | null
          provincias?: string[] | null
          razon_social: string
          score_comercial?: string | null
          score_recencia?: string | null
          score_recencia_num?: number | null
          score_volumen?: string | null
          score_volumen_num?: number | null
          telefonos?: string[] | null
          vendedores?: string[] | null
        }
        Update: {
          avg_ticket?: number | null
          ciudades?: string[] | null
          client_id?: string | null
          created_at?: string | null
          cuit_dni?: string | null
          days_since_last_purchase?: number | null
          etiquetas?: string[] | null
          first_purchase_at?: string | null
          id?: string
          last_purchase_at?: string | null
          monto_total_vendido?: number | null
          orders_count?: number | null
          participacion?: number | null
          priority_score?: number | null
          provincias?: string[] | null
          razon_social?: string
          score_comercial?: string | null
          score_recencia?: string | null
          score_recencia_num?: number | null
          score_volumen?: string | null
          score_volumen_num?: number | null
          telefonos?: string[] | null
          vendedores?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_recomendaciones_temporal_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["client_id"]
          },
        ]
      }
      feedback_extraccion: {
        Row: {
          client_id: string | null
          confianza: number
          contacto_nombre: string | null
          contacto_rol: string | null
          created_at: string
          feedback_id: string
          id: string
          interes_producto: string[]
          modelo: string | null
          no_ofrecer: boolean
          objecion: string | null
          prospecto_place_id: string | null
          resumen: string | null
          revisit_date: string | null
          revisit_dias: number | null
          riesgo_cobranza: string
          sentimiento: string | null
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          client_id?: string | null
          confianza?: number
          contacto_nombre?: string | null
          contacto_rol?: string | null
          created_at?: string
          feedback_id: string
          id?: string
          interes_producto?: string[]
          modelo?: string | null
          no_ofrecer?: boolean
          objecion?: string | null
          prospecto_place_id?: string | null
          resumen?: string | null
          revisit_date?: string | null
          revisit_dias?: number | null
          riesgo_cobranza?: string
          sentimiento?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          client_id?: string | null
          confianza?: number
          contacto_nombre?: string | null
          contacto_rol?: string | null
          created_at?: string
          feedback_id?: string
          id?: string
          interes_producto?: string[]
          modelo?: string | null
          no_ofrecer?: boolean
          objecion?: string | null
          prospecto_place_id?: string | null
          resumen?: string | null
          revisit_date?: string | null
          revisit_dias?: number | null
          riesgo_cobranza?: string
          sentimiento?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_extraccion_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: true
            referencedRelation: "cliente_feedbacks"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          aplicado_at: string | null
          archivo_nombre: string
          archivo_sha256: string | null
          archivo_tamano: number | null
          archivo_ultima_modificacion: string | null
          calidad: Json | null
          clientes_archivo: number | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          estado: string
          fecha_desde: string | null
          fecha_hasta: string | null
          fila_encabezado: number | null
          filas_actualizadas: number | null
          filas_eliminadas: number | null
          filas_insertadas: number | null
          filas_notas_credito: number
          filas_origen: number
          hoja: string | null
          id: string
          modo_carga: string
          reconciliacion: Json | null
          reemplaza_existentes: boolean
          respuesta: Json | null
          resultado: Json
          revertido_at: string | null
          started_at: string
          tipo: string
          total_bruto: number | null
          usuario_email: string | null
          usuario_id: string | null
          version_etl: string
        }
        Insert: {
          aplicado_at?: string | null
          archivo_nombre: string
          archivo_sha256?: string | null
          archivo_tamano?: number | null
          archivo_ultima_modificacion?: string | null
          calidad?: Json | null
          clientes_archivo?: number | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estado?: string
          fecha_desde?: string | null
          fecha_hasta?: string | null
          fila_encabezado?: number | null
          filas_actualizadas?: number | null
          filas_eliminadas?: number | null
          filas_insertadas?: number | null
          filas_notas_credito?: number
          filas_origen?: number
          hoja?: string | null
          id?: string
          modo_carga?: string
          reconciliacion?: Json | null
          reemplaza_existentes?: boolean
          respuesta?: Json | null
          resultado?: Json
          revertido_at?: string | null
          started_at?: string
          tipo: string
          total_bruto?: number | null
          usuario_email?: string | null
          usuario_id?: string | null
          version_etl: string
        }
        Update: {
          aplicado_at?: string | null
          archivo_nombre?: string
          archivo_sha256?: string | null
          archivo_tamano?: number | null
          archivo_ultima_modificacion?: string | null
          calidad?: Json | null
          clientes_archivo?: number | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estado?: string
          fecha_desde?: string | null
          fecha_hasta?: string | null
          fila_encabezado?: number | null
          filas_actualizadas?: number | null
          filas_eliminadas?: number | null
          filas_insertadas?: number | null
          filas_notas_credito?: number
          filas_origen?: number
          hoja?: string | null
          id?: string
          modo_carga?: string
          reconciliacion?: Json | null
          reemplaza_existentes?: boolean
          respuesta?: Json | null
          resultado?: Json
          revertido_at?: string | null
          started_at?: string
          tipo?: string
          total_bruto?: number | null
          usuario_email?: string | null
          usuario_id?: string | null
          version_etl?: string
        }
        Relationships: []
      }
      import_prospectos_filas: {
        Row: {
          batch_id: string
          place_id: string
        }
        Insert: {
          batch_id: string
          place_id: string
        }
        Update: {
          batch_id?: string
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_prospectos_filas_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_prospectos_filas_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "prospectos"
            referencedColumns: ["place_id"]
          },
        ]
      }
      import_staging_rows: {
        Row: {
          batch_id: string
          created_at: string
          expires_at: string
          id: number
          numero_fila: number
          payload: Json
          tipo_fila: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          expires_at?: string
          id?: number
          numero_fila: number
          payload: Json
          tipo_fila: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          expires_at?: string
          id?: number
          numero_fila?: number
          payload?: Json
          tipo_fila?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_staging_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      mapa_zonas_prospectos: {
        Row: {
          barrio: string
          comuna: string
          created_at: string
          google_place_id: string | null
          lat: number
          lng: number
          provincia: string
          zona_key: string
        }
        Insert: {
          barrio: string
          comuna: string
          created_at?: string
          google_place_id?: string | null
          lat: number
          lng: number
          provincia: string
          zona_key: string
        }
        Update: {
          barrio?: string
          comuna?: string
          created_at?: string
          google_place_id?: string | null
          lat?: number
          lng?: number
          provincia?: string
          zona_key?: string
        }
        Relationships: []
      }
      movimientos_visitas: {
        Row: {
          asignacion_id: string
          client_id: string | null
          created_at: string
          fecha_programada: string
          id: string
          prospecto_place_id: string | null
          usuario_id: string
          vendedor_anterior: string | null
          vendedor_nuevo: string
        }
        Insert: {
          asignacion_id: string
          client_id?: string | null
          created_at?: string
          fecha_programada: string
          id?: string
          prospecto_place_id?: string | null
          usuario_id: string
          vendedor_anterior?: string | null
          vendedor_nuevo: string
        }
        Update: {
          asignacion_id?: string
          client_id?: string | null
          created_at?: string
          fecha_programada?: string
          id?: string
          prospecto_place_id?: string | null
          usuario_id?: string
          vendedor_anterior?: string | null
          vendedor_nuevo?: string
        }
        Relationships: []
      }
      notificaciones: {
        Row: {
          asignacion_id: string | null
          created_at: string | null
          id: string
          leida: boolean | null
          mensaje: string
          tipo: string
          titulo: string
          vendedor_id: string
        }
        Insert: {
          asignacion_id?: string | null
          created_at?: string | null
          id?: string
          leida?: boolean | null
          mensaje: string
          tipo: string
          titulo: string
          vendedor_id: string
        }
        Update: {
          asignacion_id?: string | null
          created_at?: string | null
          id?: string
          leida?: boolean | null
          mensaje?: string
          tipo?: string
          titulo?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_asignacion_id_fkey"
            columns: ["asignacion_id"]
            isOneToOne: false
            referencedRelation: "asignaciones_vendedores_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          barrio_principal: string | null
          comuna: string | null
          id: string
          provincia_principal: string | null
        }
        Insert: {
          barrio_principal?: string | null
          comuna?: string | null
          id?: string
          provincia_principal?: string | null
        }
        Update: {
          barrio_principal?: string | null
          comuna?: string | null
          id?: string
          provincia_principal?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activo: boolean | null
          created_at: string | null
          email: string
          id: string
          nombre: string
          perfil_ventas: boolean
          rol: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          email: string
          id?: string
          nombre: string
          perfil_ventas?: boolean
          rol: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          email?: string
          id?: string
          nombre?: string
          perfil_ventas?: boolean
          rol?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      prospect_discovery_queue: {
        Row: {
          consulta: string
          convertido_prospecto_place_id: string | null
          creado_por: string | null
          discovered_at: string
          estado: string
          fuente: string
          id: string
          notas: string | null
          place_id: string
          updated_at: string
          zona: string | null
        }
        Insert: {
          consulta: string
          convertido_prospecto_place_id?: string | null
          creado_por?: string | null
          discovered_at?: string
          estado?: string
          fuente?: string
          id?: string
          notas?: string | null
          place_id: string
          updated_at?: string
          zona?: string | null
        }
        Update: {
          consulta?: string
          convertido_prospecto_place_id?: string | null
          creado_por?: string | null
          discovered_at?: string
          estado?: string
          fuente?: string
          id?: string
          notas?: string | null
          place_id?: string
          updated_at?: string
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_discovery_queue_convertido_prospecto_place_id_fkey"
            columns: ["convertido_prospecto_place_id"]
            isOneToOne: false
            referencedRelation: "prospectos"
            referencedColumns: ["place_id"]
          },
        ]
      }
      prospecto_cliente_revisiones: {
        Row: {
          client_id: string
          cliente_huella: string
          decision: string
          prospecto_huella: string
          prospecto_place_id: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          client_id: string
          cliente_huella: string
          decision: string
          prospecto_huella: string
          prospecto_place_id: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          client_id?: string
          cliente_huella?: string
          decision?: string
          prospecto_huella?: string
          prospecto_place_id?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecto_cliente_revisiones_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "prospecto_cliente_revisiones_prospecto_place_id_fkey"
            columns: ["prospecto_place_id"]
            isOneToOne: false
            referencedRelation: "prospectos"
            referencedColumns: ["place_id"]
          },
        ]
      }
      prospecto_revision_historial: {
        Row: {
          antes: Json
          client_id: string
          created_at: string
          decision: string
          despues: Json
          id: string
          prospecto_place_id: string
          usuario_id: string | null
        }
        Insert: {
          antes: Json
          client_id: string
          created_at?: string
          decision: string
          despues: Json
          id?: string
          prospecto_place_id: string
          usuario_id?: string | null
        }
        Update: {
          antes?: Json
          client_id?: string
          created_at?: string
          decision?: string
          despues?: Json
          id?: string
          prospecto_place_id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      prospectos: {
        Row: {
          barrio: string | null
          ciudad: string
          client_id: string | null
          comuna: string | null
          created_at: string
          direccion: string
          email: string | null
          es_cliente_cupra: boolean | null
          estado_negocio: string | null
          google_place_id: string | null
          id: string
          import_key: string | null
          instagram: string | null
          last_recommendation_at: string | null
          latitud: number
          longitud: number
          nivel_precio: string | null
          nombre: string
          place_id: string
          provincia: string
          rating: number | null
          resumen_google: string | null
          rubro: string | null
          sirve_vinos: boolean | null
          telefono: string | null
          tipo_principal: string | null
          tipos: string[] | null
          total_ratings: number | null
          updated_at: string
          website: string | null
        }
        Insert: {
          barrio?: string | null
          ciudad: string
          client_id?: string | null
          comuna?: string | null
          created_at?: string
          direccion: string
          email?: string | null
          es_cliente_cupra?: boolean | null
          estado_negocio?: string | null
          google_place_id?: string | null
          id?: string
          import_key?: string | null
          instagram?: string | null
          last_recommendation_at?: string | null
          latitud: number
          longitud: number
          nivel_precio?: string | null
          nombre: string
          place_id: string
          provincia: string
          rating?: number | null
          resumen_google?: string | null
          rubro?: string | null
          sirve_vinos?: boolean | null
          telefono?: string | null
          tipo_principal?: string | null
          tipos?: string[] | null
          total_ratings?: number | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          barrio?: string | null
          ciudad?: string
          client_id?: string | null
          comuna?: string | null
          created_at?: string
          direccion?: string
          email?: string | null
          es_cliente_cupra?: boolean | null
          estado_negocio?: string | null
          google_place_id?: string | null
          id?: string
          import_key?: string | null
          instagram?: string | null
          last_recommendation_at?: string | null
          latitud?: number
          longitud?: number
          nivel_precio?: string | null
          nombre?: string
          place_id?: string
          provincia?: string
          rating?: number | null
          resumen_google?: string | null
          rubro?: string | null
          sirve_vinos?: boolean | null
          telefono?: string | null
          tipo_principal?: string | null
          tipos?: string[] | null
          total_ratings?: number | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      prospectos_informacion_encontrada: {
        Row: {
          datos: Json
          fuente: string
          prospecto_place_id: string
          updated_at: string
        }
        Insert: {
          datos: Json
          fuente?: string
          prospecto_place_id: string
          updated_at?: string
        }
        Update: {
          datos?: Json
          fuente?: string
          prospecto_place_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospectos_informacion_encontrada_prospecto_place_id_fkey"
            columns: ["prospecto_place_id"]
            isOneToOne: true
            referencedRelation: "prospectos"
            referencedColumns: ["place_id"]
          },
        ]
      }
      prospectos_informacion_historial: {
        Row: {
          created_at: string
          datos: Json
          fuente: string
          huella: string
          prospecto_place_id: string
        }
        Insert: {
          created_at?: string
          datos: Json
          fuente?: string
          huella: string
          prospecto_place_id: string
        }
        Update: {
          created_at?: string
          datos?: Json
          fuente?: string
          huella?: string
          prospecto_place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospectos_informacion_historial_prospecto_place_id_fkey"
            columns: ["prospecto_place_id"]
            isOneToOne: false
            referencedRelation: "prospectos"
            referencedColumns: ["place_id"]
          },
        ]
      }
      recomendaciones_ia: {
        Row: {
          ai_reasoning: string | null
          avg_ticket: number | null
          barrio_principal: string | null
          canal: string | null
          ciudad_principa: string | null
          ciudades: string[] | null
          client_id: string | null
          created_at: string
          cuit_dni: string | null
          days_since_last_purchase: number | null
          direccion_principal: string | null
          es_prospecto: boolean | null
          estado: string | null
          etiquetas: string[] | null
          factores_ia: Json | null
          first_purchase_at: string | null
          google_maps_link: string | null
          id: string
          justificacion: string | null
          last_purchase_at: string | null
          last_recomendation: string | null
          monto_total_vendido: number | null
          notas: string | null
          orders_count: number | null
          participacion: number | null
          priority_score: number | null
          productos_comprados: string[] | null
          prospecto_place_id: string | null
          provincia_principal: string | null
          provincias: string[] | null
          razon_social: string | null
          request_id: string | null
          requiere_visita: string | null
          score_comercial: string | null
          score_geografico: number | null
          score_recencia: string | null
          score_recencia_num: number | null
          score_volumen: string | null
          score_volumen_num: number | null
          telefonos: string[] | null
          todas_ciudades: string[] | null
          todas_direcciones: string[] | null
          todos_barrios: string[] | null
          todos_vendedores: string[] | null
          ultima_sugerencia: string | null
          ultima_visita: string | null
          vendedor_principal: string | null
          vendedor_recomendado_id: string | null
          vendedores: string[] | null
        }
        Insert: {
          ai_reasoning?: string | null
          avg_ticket?: number | null
          barrio_principal?: string | null
          canal?: string | null
          ciudad_principa?: string | null
          ciudades?: string[] | null
          client_id?: string | null
          created_at?: string
          cuit_dni?: string | null
          days_since_last_purchase?: number | null
          direccion_principal?: string | null
          es_prospecto?: boolean | null
          estado?: string | null
          etiquetas?: string[] | null
          factores_ia?: Json | null
          first_purchase_at?: string | null
          google_maps_link?: string | null
          id?: string
          justificacion?: string | null
          last_purchase_at?: string | null
          last_recomendation?: string | null
          monto_total_vendido?: number | null
          notas?: string | null
          orders_count?: number | null
          participacion?: number | null
          priority_score?: number | null
          productos_comprados?: string[] | null
          prospecto_place_id?: string | null
          provincia_principal?: string | null
          provincias?: string[] | null
          razon_social?: string | null
          request_id?: string | null
          requiere_visita?: string | null
          score_comercial?: string | null
          score_geografico?: number | null
          score_recencia?: string | null
          score_recencia_num?: number | null
          score_volumen?: string | null
          score_volumen_num?: number | null
          telefonos?: string[] | null
          todas_ciudades?: string[] | null
          todas_direcciones?: string[] | null
          todos_barrios?: string[] | null
          todos_vendedores?: string[] | null
          ultima_sugerencia?: string | null
          ultima_visita?: string | null
          vendedor_principal?: string | null
          vendedor_recomendado_id?: string | null
          vendedores?: string[] | null
        }
        Update: {
          ai_reasoning?: string | null
          avg_ticket?: number | null
          barrio_principal?: string | null
          canal?: string | null
          ciudad_principa?: string | null
          ciudades?: string[] | null
          client_id?: string | null
          created_at?: string
          cuit_dni?: string | null
          days_since_last_purchase?: number | null
          direccion_principal?: string | null
          es_prospecto?: boolean | null
          estado?: string | null
          etiquetas?: string[] | null
          factores_ia?: Json | null
          first_purchase_at?: string | null
          google_maps_link?: string | null
          id?: string
          justificacion?: string | null
          last_purchase_at?: string | null
          last_recomendation?: string | null
          monto_total_vendido?: number | null
          notas?: string | null
          orders_count?: number | null
          participacion?: number | null
          priority_score?: number | null
          productos_comprados?: string[] | null
          prospecto_place_id?: string | null
          provincia_principal?: string | null
          provincias?: string[] | null
          razon_social?: string | null
          request_id?: string | null
          requiere_visita?: string | null
          score_comercial?: string | null
          score_geografico?: number | null
          score_recencia?: string | null
          score_recencia_num?: number | null
          score_volumen?: string | null
          score_volumen_num?: number | null
          telefonos?: string[] | null
          todas_ciudades?: string[] | null
          todas_direcciones?: string[] | null
          todos_barrios?: string[] | null
          todos_vendedores?: string[] | null
          ultima_sugerencia?: string | null
          ultima_visita?: string | null
          vendedor_principal?: string | null
          vendedor_recomendado_id?: string | null
          vendedores?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "recomendaciones_ia_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["client_id"]
          },
        ]
      }
      recordatorios: {
        Row: {
          client_id: string | null
          completado: boolean
          created_at: string
          fecha_recordatorio: string
          id: string
          nota: string | null
          notificado: boolean
          prospecto_place_id: string | null
          titulo: string
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          client_id?: string | null
          completado?: boolean
          created_at?: string
          fecha_recordatorio: string
          id?: string
          nota?: string | null
          notificado?: boolean
          prospecto_place_id?: string | null
          titulo: string
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          client_id?: string | null
          completado?: boolean
          created_at?: string
          fecha_recordatorio?: string
          id?: string
          nota?: string | null
          notificado?: boolean
          prospecto_place_id?: string | null
          titulo?: string
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: []
      }
      sucursales: {
        Row: {
          barrio: string | null
          ciudad: string
          client_id: string
          created_at: string
          direccion: string
          estado: string
          google_place_id: string | null
          id_sucursal: string
          lat: number | null
          lng: number | null
          nombre_maps: string
          provincia: string
          telefono_local: string | null
          updated_at: string
        }
        Insert: {
          barrio?: string | null
          ciudad: string
          client_id: string
          created_at?: string
          direccion: string
          estado?: string
          google_place_id?: string | null
          id_sucursal?: string
          lat?: number | null
          lng?: number | null
          nombre_maps: string
          provincia: string
          telefono_local?: string | null
          updated_at?: string
        }
        Update: {
          barrio?: string | null
          ciudad?: string
          client_id?: string
          created_at?: string
          direccion?: string
          estado?: string
          google_place_id?: string | null
          id_sucursal?: string
          lat?: number | null
          lng?: number | null
          nombre_maps?: string
          provincia?: string
          telefono_local?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sucursales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["client_id"]
          },
        ]
      }
      vendedores_canonicos: {
        Row: {
          created_at: string
          nombre_display: string
          updated_at: string
          vendedor_key: string
        }
        Insert: {
          created_at?: string
          nombre_display: string
          updated_at?: string
          vendedor_key: string
        }
        Update: {
          created_at?: string
          nombre_display?: string
          updated_at?: string
          vendedor_key?: string
        }
        Relationships: []
      }
      ventas_cupra: {
        Row: {
          bonificacion: number | null
          cajas: number | null
          categorias: string | null
          celular: string | null
          ciudad: string | null
          client_id: string | null
          codigo_producto: string | null
          correo: string | null
          created_at: string | null
          cuit_dni: string | null
          direccion: string | null
          facturacion_ars: number | null
          fantasia: string | null
          fecha_emision: string | null
          id: number
          import_batch_id: string | null
          letra: string | null
          marca: string | null
          nombre: string | null
          pais: string | null
          provincia: string | null
          razon_social: string | null
          renglon: number
          telefono: string | null
          ticket: string | null
          tipo_comprobante: string
          vendedor: string | null
        }
        Insert: {
          bonificacion?: number | null
          cajas?: number | null
          categorias?: string | null
          celular?: string | null
          ciudad?: string | null
          client_id?: string | null
          codigo_producto?: string | null
          correo?: string | null
          created_at?: string | null
          cuit_dni?: string | null
          direccion?: string | null
          facturacion_ars?: number | null
          fantasia?: string | null
          fecha_emision?: string | null
          id?: number
          import_batch_id?: string | null
          letra?: string | null
          marca?: string | null
          nombre?: string | null
          pais?: string | null
          provincia?: string | null
          razon_social?: string | null
          renglon?: number
          telefono?: string | null
          ticket?: string | null
          tipo_comprobante?: string
          vendedor?: string | null
        }
        Update: {
          bonificacion?: number | null
          cajas?: number | null
          categorias?: string | null
          celular?: string | null
          ciudad?: string | null
          client_id?: string | null
          codigo_producto?: string | null
          correo?: string | null
          created_at?: string | null
          cuit_dni?: string | null
          direccion?: string | null
          facturacion_ars?: number | null
          fantasia?: string | null
          fecha_emision?: string | null
          id?: number
          import_batch_id?: string | null
          letra?: string | null
          marca?: string | null
          nombre?: string | null
          pais?: string | null
          provincia?: string | null
          razon_social?: string | null
          renglon?: number
          telefono?: string | null
          ticket?: string | null
          tipo_comprobante?: string
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_cupra_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["client_id"]
          },
        ]
      }
      ventas_cupra_eliminadas: {
        Row: {
          batch_id: string | null
          bonificacion: number | null
          cajas: number | null
          categorias: string | null
          celular: string | null
          ciudad: string | null
          client_id: string | null
          codigo_producto: string | null
          correo: string | null
          cuit_dni: string | null
          direccion: string | null
          eliminada_at: string
          facturacion_ars: number | null
          fantasia: string | null
          fecha_emision: string | null
          id: number
          import_batch_id: string | null
          letra: string | null
          marca: string | null
          motivo: string
          nombre: string | null
          pais: string | null
          provincia: string | null
          razon_social: string | null
          renglon: number | null
          telefono: string | null
          ticket: string | null
          tipo_comprobante: string | null
          vendedor: string | null
          venta_id: number | null
        }
        Insert: {
          batch_id?: string | null
          bonificacion?: number | null
          cajas?: number | null
          categorias?: string | null
          celular?: string | null
          ciudad?: string | null
          client_id?: string | null
          codigo_producto?: string | null
          correo?: string | null
          cuit_dni?: string | null
          direccion?: string | null
          eliminada_at?: string
          facturacion_ars?: number | null
          fantasia?: string | null
          fecha_emision?: string | null
          id?: number
          import_batch_id?: string | null
          letra?: string | null
          marca?: string | null
          motivo?: string
          nombre?: string | null
          pais?: string | null
          provincia?: string | null
          razon_social?: string | null
          renglon?: number | null
          telefono?: string | null
          ticket?: string | null
          tipo_comprobante?: string | null
          vendedor?: string | null
          venta_id?: number | null
        }
        Update: {
          batch_id?: string | null
          bonificacion?: number | null
          cajas?: number | null
          categorias?: string | null
          celular?: string | null
          ciudad?: string | null
          client_id?: string | null
          codigo_producto?: string | null
          correo?: string | null
          cuit_dni?: string | null
          direccion?: string | null
          eliminada_at?: string
          facturacion_ars?: number | null
          fantasia?: string | null
          fecha_emision?: string | null
          id?: number
          import_batch_id?: string | null
          letra?: string | null
          marca?: string | null
          motivo?: string
          nombre?: string | null
          pais?: string | null
          provincia?: string | null
          razon_social?: string | null
          renglon?: number | null
          telefono?: string | null
          ticket?: string | null
          tipo_comprobante?: string | null
          vendedor?: string | null
          venta_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_cupra_eliminadas_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      visita_briefings: {
        Row: {
          briefing: string
          client_id: string | null
          created_at: string
          hechos: Json
          id: string
          modelo: string | null
          prospecto_place_id: string | null
          updated_at: string
        }
        Insert: {
          briefing: string
          client_id?: string | null
          created_at?: string
          hechos?: Json
          id?: string
          modelo?: string | null
          prospecto_place_id?: string | null
          updated_at?: string
        }
        Update: {
          briefing?: string
          client_id?: string | null
          created_at?: string
          hechos?: Json
          id?: string
          modelo?: string | null
          prospecto_place_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      visitas: {
        Row: {
          created_at: string | null
          estado: string | null
          fecha: string
          geolocalizacion: Json | null
          hora_checkin: string | null
          hora_checkout: string | null
          id: string
          notas: string | null
          sucursal_id: string
          vendedor_id: string
        }
        Insert: {
          created_at?: string | null
          estado?: string | null
          fecha: string
          geolocalizacion?: Json | null
          hora_checkin?: string | null
          hora_checkout?: string | null
          id?: string
          notas?: string | null
          sucursal_id: string
          vendedor_id: string
        }
        Update: {
          created_at?: string | null
          estado?: string | null
          fecha?: string
          geolocalizacion?: Json | null
          hora_checkin?: string | null
          hora_checkout?: string | null
          id?: string
          notas?: string | null
          sucursal_id?: string
          vendedor_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_clientes_priorizacion: {
        Row: {
          barrio: string | null
          cuit_dni: string | null
          dias_desde_ultima_compra: number | null
          direccion: string | null
          entity_id: string | null
          es_prospecto: boolean | null
          estado_comercial: string | null
          excluir_recomendaciones: boolean | null
          fantasia: string | null
          google_maps_link: string | null
          last_recommendation_at: string | null
          lat: number | null
          long: number | null
          monto_total_historico: number | null
          prospecto_place_id: string | null
          provincia_principal: string | null
          rating: number | null
          razon_social: string | null
          score_comercial: number | null
          ticket_promedio: number | null
          tipo_negocio: string | null
          todos_vendedores: string[] | null
          vendedor_actual: string | null
          vendedor_afin_id: string | null
          vendedor_afin_nombre: string | null
          vendedor_principal: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      aplicar_ventas_import: {
        Args: {
          p_batch_id: string
          p_confirmar_eliminaciones: boolean
          p_reemplazar: boolean
          p_rows: Json
        }
        Returns: Json
      }
      autoasignar_visita: {
        Args: {
          p_client_id?: string
          p_fecha?: string
          p_prospecto_id?: string
        }
        Returns: Json
      }
      canonical_vendedor: { Args: { _nombre: string }; Returns: string }
      catalogo_visitas: {
        Args: {
          p_busqueda?: string
          p_limite?: number
          p_offset?: number
          p_tipo?: string
        }
        Returns: Json
      }
      clave_territorio_mapa: { Args: { valor: string }; Returns: string }
      clean_old_recommendations: { Args: never; Returns: undefined }
      cleanup_expired_import_staging: { Args: never; Returns: number }
      commit_ventas_import_rango: {
        Args: {
          p_batch_id?: string
          p_confirmar_eliminaciones?: boolean
          p_rows: Json
        }
        Returns: Json
      }
      complementar_cliente_prospecto: {
        Args: { p_actor?: string; p_id: string }
        Returns: undefined
      }
      completar_barrio_ubicacion: {
        Args: {
          p_barrio: string
          p_comuna: string
          p_id: string
          p_lat: number
          p_lng: number
        }
        Returns: undefined
      }
      contexto_revision_cupra: { Args: never; Returns: Json }
      generar_notificaciones_pendientes: { Args: never; Returns: number }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_vendedor_barrios_top: {
        Args: { top_n?: number; vendedor_user_id: string }
        Returns: string[]
      }
      guardar_asignaciones: {
        Args: { p_actualizar_cartera?: boolean; p_asignaciones: Json }
        Returns: number
      }
      guardar_clientes_import: {
        Args: { p_rows: Json; p_tipo: string }
        Returns: Json
      }
      guardar_importacion: {
        Args: {
          p_batch_id: string
          p_clientes: Json
          p_confirmar?: boolean
          p_places: Json
          p_reemplazar?: boolean
          p_ventas?: Json
        }
        Returns: Json
      }
      guardar_prospectos_import: {
        Args: { p_batch_id: string; p_resultados: Json; p_rows: Json }
        Returns: Json
      }
      guardar_ruta_mapa: {
        Args: {
          p_client_ids: string[]
          p_prospecto_ids?: string[]
          p_vendedor_id: string
          p_zona_key?: string
        }
        Returns: number
      }
      guardar_ubicacion_cliente: {
        Args: { p_client_id: string; p_datos: Json; p_manual?: boolean }
        Returns: Json
      }
      huella_cliente_cupra: { Args: { p_id: string }; Returns: string }
      huella_prospecto_cupra: { Args: { p_id: string }; Returns: string }
      import_identity: { Args: { p_text: string }; Returns: string }
      incorporar_info_prospectos: { Args: { p_filas: Json }; Returns: Json }
      is_active_admin: { Args: { _user_id: string }; Returns: boolean }
      is_active_assignor: { Args: { _user_id: string }; Returns: boolean }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_assignor_like: { Args: { _user_id: string }; Returns: boolean }
      normalizar_rubro: { Args: { p_textos: string[] }; Returns: string }
      pendientes_geocodificacion: {
        Args: {
          p_batch?: string
          p_despues?: string
          p_limite?: number
          p_tipo?: string
        }
        Returns: Json
      }
      preview_ventas_import: { Args: { p_rows: Json }; Returns: Json }
      puede_ver_cuenta: {
        Args: { p_cliente: string; p_prospecto?: string }
        Returns: boolean
      }
      rank_fuente_ubicacion: {
        Args: { _fuente: string; _verificada: boolean }
        Returns: number
      }
      reasignar_pendientes: {
        Args: { p_destino: string; p_origen: string }
        Returns: number
      }
      rebase_ventas_cupra: {
        Args: { p_batch_id?: string; p_confirmacion?: string; p_rows: Json }
        Returns: Json
      }
      recompute_client_metrics: { Args: never; Returns: number }
      reconciliar_places_primarios: { Args: never; Returns: number }
      refrescar_rubros: { Args: never; Returns: Json }
      resolver_revision_cupra: {
        Args: {
          p_actor: string
          p_cliente_huella: string
          p_cliente_id: string
          p_decision: string
          p_prospecto_huella: string
          p_prospecto_id: string
        }
        Returns: Json
      }
      resumen_ubicaciones: { Args: never; Returns: Json }
      resumen_ventas: { Args: { p_filtros?: Json }; Returns: Json }
      revertir_import_ventas: { Args: { p_batch_id: string }; Returns: Json }
      rubro_prospecto: {
        Args: { p_tipo: string; p_tipos: string[] }
        Returns: string
      }
      rubros_disponibles: {
        Args: never
        Returns: {
          clientes: number
          prospectos: number
          rubro: string
        }[]
      }
      sync_clientes_barrio_from_places: { Args: never; Returns: number }
      sync_places_catalog: { Args: never; Returns: number }
      telefono_identidad_cupra: { Args: { v: string }; Returns: string }
      titlecase_nombre: { Args: { _texto: string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
      vendedor_key: { Args: { _nombre: string }; Returns: string }
    }
    Enums: {
      app_role: "asignador" | "vendedor" | "administrador"
      estado_asignacion: "Asignado" | "Por visitar" | "Visitado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["asignador", "vendedor", "administrador"],
      estado_asignacion: ["Asignado", "Por visitar", "Visitado"],
    },
  },
} as const
