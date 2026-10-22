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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      acta_items: {
        Row: {
          accesorios: string | null
          acta_id: string
          created_at: string
          direccion: string | null
          equipo_id: string
          estado_destino: string
          estado_fisico: string | null
          id: string
          nota: string | null
        }
        Insert: {
          accesorios?: string | null
          acta_id: string
          created_at?: string
          direccion?: string | null
          equipo_id: string
          estado_destino?: string
          estado_fisico?: string | null
          id?: string
          nota?: string | null
        }
        Update: {
          accesorios?: string | null
          acta_id?: string
          created_at?: string
          direccion?: string | null
          equipo_id?: string
          estado_destino?: string
          estado_fisico?: string | null
          id?: string
          nota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acta_items_acta_id_fkey"
            columns: ["acta_id"]
            isOneToOne: false
            referencedRelation: "actas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acta_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
        ]
      }
      actas: {
        Row: {
          anulada_at: string | null
          anulada_motivo: string | null
          anulada_por: string | null
          created_at: string
          empleado_id: string
          es_prestamo: boolean
          estado: Database["public"]["Enums"]["acta_estado"]
          firma_ip: string | null
          firma_medio: string | null
          firma_path: string | null
          firma_user_agent: string | null
          firmado_at: string | null
          id: string
          numero: number
          observaciones: string | null
          owner_id: string | null
          pdf_hash: string | null
          pdf_path: string | null
          prestamo_hasta: string | null
          prestamo_reparacion_equipo_id: string | null
          tecnico_firma_path: string | null
          tecnico_id: string
          tecnico_nombre: string | null
          tipo: Database["public"]["Enums"]["acta_tipo"]
          updated_at: string
        }
        Insert: {
          anulada_at?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          created_at?: string
          empleado_id: string
          es_prestamo?: boolean
          estado?: Database["public"]["Enums"]["acta_estado"]
          firma_ip?: string | null
          firma_medio?: string | null
          firma_path?: string | null
          firma_user_agent?: string | null
          firmado_at?: string | null
          id?: string
          numero?: never
          observaciones?: string | null
          owner_id?: string | null
          pdf_hash?: string | null
          pdf_path?: string | null
          prestamo_hasta?: string | null
          prestamo_reparacion_equipo_id?: string | null
          tecnico_firma_path?: string | null
          tecnico_id?: string
          tecnico_nombre?: string | null
          tipo: Database["public"]["Enums"]["acta_tipo"]
          updated_at?: string
        }
        Update: {
          anulada_at?: string | null
          anulada_motivo?: string | null
          anulada_por?: string | null
          created_at?: string
          empleado_id?: string
          es_prestamo?: boolean
          estado?: Database["public"]["Enums"]["acta_estado"]
          firma_ip?: string | null
          firma_medio?: string | null
          firma_path?: string | null
          firma_user_agent?: string | null
          firmado_at?: string | null
          id?: string
          numero?: never
          observaciones?: string | null
          owner_id?: string | null
          pdf_hash?: string | null
          pdf_path?: string | null
          prestamo_hasta?: string | null
          prestamo_reparacion_equipo_id?: string | null
          tecnico_firma_path?: string | null
          tecnico_id?: string
          tecnico_nombre?: string | null
          tipo?: Database["public"]["Enums"]["acta_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "actas_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actas_prestamo_reparacion_equipo_id_fkey"
            columns: ["prestamo_reparacion_equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_stock_config: {
        Row: {
          activa: boolean
          created_at: string
          id: string
          owner_id: string | null
          stock_minimo: number
          tipo_id: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          id?: string
          owner_id?: string | null
          stock_minimo?: number
          tipo_id: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          id?: string
          owner_id?: string | null
          stock_minimo?: number
          tipo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_stock_config_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "catalogo_items"
            referencedColumns: ["id"]
          },
        ]
      }
      articulo_proveedores: {
        Row: {
          created_at: string
          es_principal: boolean
          id: string
          owner_id: string | null
          precio_referencia: number | null
          proveedor_id: string
          tiempo_entrega_dias: number | null
          tipo_id: string
          ultima_compra: string | null
          ultimo_precio: number | null
        }
        Insert: {
          created_at?: string
          es_principal?: boolean
          id?: string
          owner_id?: string | null
          precio_referencia?: number | null
          proveedor_id: string
          tiempo_entrega_dias?: number | null
          tipo_id: string
          ultima_compra?: string | null
          ultimo_precio?: number | null
        }
        Update: {
          created_at?: string
          es_principal?: boolean
          id?: string
          owner_id?: string | null
          precio_referencia?: number | null
          proveedor_id?: string
          tiempo_entrega_dias?: number | null
          tipo_id?: string
          ultima_compra?: string | null
          ultimo_precio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articulo_proveedores_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articulo_proveedores_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "catalogo_items"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          accion: string
          antes: Json | null
          created_at: string
          despues: Json | null
          detalle: string | null
          id: number
          registro_id: string | null
          tabla: string
          user_id: string | null
        }
        Insert: {
          accion: string
          antes?: Json | null
          created_at?: string
          despues?: Json | null
          detalle?: string | null
          id?: never
          registro_id?: string | null
          tabla: string
          user_id?: string | null
        }
        Update: {
          accion?: string
          antes?: Json | null
          created_at?: string
          despues?: Json | null
          detalle?: string | null
          id?: never
          registro_id?: string | null
          tabla?: string
          user_id?: string | null
        }
        Relationships: []
      }
      catalogo_items: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          owner_id: string | null
          tipo: Database["public"]["Enums"]["catalogo_tipo"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          owner_id?: string | null
          tipo: Database["public"]["Enums"]["catalogo_tipo"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          owner_id?: string | null
          tipo?: Database["public"]["Enums"]["catalogo_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      certificacion_respuestas: {
        Row: {
          certificacion_id: string
          comentario: string | null
          created_at: string
          empleado_id: string
          equipos_faltantes: string[]
          equipos_ok: string[]
          id: string
          owner_id: string | null
        }
        Insert: {
          certificacion_id: string
          comentario?: string | null
          created_at?: string
          empleado_id: string
          equipos_faltantes?: string[]
          equipos_ok?: string[]
          id?: string
          owner_id?: string | null
        }
        Update: {
          certificacion_id?: string
          comentario?: string | null
          created_at?: string
          empleado_id?: string
          equipos_faltantes?: string[]
          equipos_ok?: string[]
          id?: string
          owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificacion_respuestas_certificacion_id_fkey"
            columns: ["certificacion_id"]
            isOneToOne: false
            referencedRelation: "certificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificacion_respuestas_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
        ]
      }
      certificaciones: {
        Row: {
          activa: boolean
          creado_por: string | null
          created_at: string
          fecha_limite: string
          id: string
          nombre: string
          owner_id: string
        }
        Insert: {
          activa?: boolean
          creado_por?: string | null
          created_at?: string
          fecha_limite: string
          id?: string
          nombre: string
          owner_id: string
        }
        Update: {
          activa?: boolean
          creado_por?: string | null
          created_at?: string
          fecha_limite?: string
          id?: string
          nombre?: string
          owner_id?: string
        }
        Relationships: []
      }
      empleados: {
        Row: {
          activo: boolean
          area_id: string | null
          cargo: string | null
          created_at: string
          created_by: string | null
          email: string | null
          empresa_id: string | null
          id: string
          identificacion: string
          nombre: string
          owner_id: string | null
          pin_bloqueo_hasta: string | null
          pin_intentos: number
          sede_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activo?: boolean
          area_id?: string | null
          cargo?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          empresa_id?: string | null
          id?: string
          identificacion: string
          nombre: string
          owner_id?: string | null
          pin_bloqueo_hasta?: string | null
          pin_intentos?: number
          sede_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activo?: boolean
          area_id?: string | null
          cargo?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          empresa_id?: string | null
          id?: string
          identificacion?: string
          nombre?: string
          owner_id?: string | null
          pin_bloqueo_hasta?: string | null
          pin_intentos?: number
          sede_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empleados_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "catalogo_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "catalogo_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "empleados_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "catalogo_items"
            referencedColumns: ["id"]
          },
        ]
      }
      equipo_historial: {
        Row: {
          acta_id: string | null
          created_at: string
          detalle: string | null
          equipo_id: string
          evento: string
          id: string
          user_id: string | null
        }
        Insert: {
          acta_id?: string | null
          created_at?: string
          detalle?: string | null
          equipo_id: string
          evento: string
          id?: string
          user_id?: string | null
        }
        Update: {
          acta_id?: string | null
          created_at?: string
          detalle?: string | null
          equipo_id?: string
          evento?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipo_historial_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipos: {
        Row: {
          activo_fijo: string | null
          anio_compra: number | null
          baja_documento_path: string | null
          codigo_interno: boolean
          created_at: string
          created_by: string | null
          empleado_id: string | null
          estado: Database["public"]["Enums"]["equipo_estado"]
          factura_numero: string | null
          factura_path: string | null
          fecha_ingreso: string
          garantia_fin: string | null
          id: string
          marca_id: string | null
          modelo: string | null
          nombre_equipo: string | null
          novedad: string | null
          observaciones: string | null
          owner_id: string | null
          prestamo_hasta: string | null
          proveedor: string | null
          proveedor_id: string | null
          reparacion_inicio: string | null
          reparacion_proveedor_id: string | null
          sede_id: string | null
          serie: string
          sistema_operativo: string | null
          tipo_id: string
          updated_at: string
          valor_compra: number | null
        }
        Insert: {
          activo_fijo?: string | null
          anio_compra?: number | null
          baja_documento_path?: string | null
          codigo_interno?: boolean
          created_at?: string
          created_by?: string | null
          empleado_id?: string | null
          estado?: Database["public"]["Enums"]["equipo_estado"]
          factura_numero?: string | null
          factura_path?: string | null
          fecha_ingreso?: string
          garantia_fin?: string | null
          id?: string
          marca_id?: string | null
          modelo?: string | null
          nombre_equipo?: string | null
          novedad?: string | null
          observaciones?: string | null
          owner_id?: string | null
          prestamo_hasta?: string | null
          proveedor?: string | null
          proveedor_id?: string | null
          reparacion_inicio?: string | null
          reparacion_proveedor_id?: string | null
          sede_id?: string | null
          serie: string
          sistema_operativo?: string | null
          tipo_id: string
          updated_at?: string
          valor_compra?: number | null
        }
        Update: {
          activo_fijo?: string | null
          anio_compra?: number | null
          baja_documento_path?: string | null
          codigo_interno?: boolean
          created_at?: string
          created_by?: string | null
          empleado_id?: string | null
          estado?: Database["public"]["Enums"]["equipo_estado"]
          factura_numero?: string | null
          factura_path?: string | null
          fecha_ingreso?: string
          garantia_fin?: string | null
          id?: string
          marca_id?: string | null
          modelo?: string | null
          nombre_equipo?: string | null
          novedad?: string | null
          observaciones?: string | null
          owner_id?: string | null
          prestamo_hasta?: string | null
          proveedor?: string | null
          proveedor_id?: string | null
          reparacion_inicio?: string | null
          reparacion_proveedor_id?: string | null
          sede_id?: string | null
          serie?: string
          sistema_operativo?: string | null
          tipo_id?: string
          updated_at?: string
          valor_compra?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipos_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "catalogo_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipos_reparacion_proveedor_id_fkey"
            columns: ["reparacion_proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "catalogo_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipos_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "catalogo_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_lineas: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          owner_id: string | null
          pedido_id: string
          precio_estimado: number | null
          recibida: number
          tipo_id: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          id?: string
          owner_id?: string | null
          pedido_id: string
          precio_estimado?: number | null
          recibida?: number
          tipo_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          owner_id?: string | null
          pedido_id?: string
          precio_estimado?: number | null
          recibida?: number
          tipo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_lineas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_lineas_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "catalogo_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_compra: {
        Row: {
          cancelado_motivo: string | null
          cerrado_at: string | null
          creado_nombre: string | null
          creado_por: string | null
          created_at: string
          estado: string
          fecha_esperada: string | null
          fecha_pedido: string | null
          id: string
          notas: string | null
          numero: number
          owner_id: string | null
          proveedor_id: string
          updated_at: string
        }
        Insert: {
          cancelado_motivo?: string | null
          cerrado_at?: string | null
          creado_nombre?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          fecha_esperada?: string | null
          fecha_pedido?: string | null
          id?: string
          notas?: string | null
          numero?: number
          owner_id?: string | null
          proveedor_id: string
          updated_at?: string
        }
        Update: {
          cancelado_motivo?: string | null
          cerrado_at?: string | null
          creado_nombre?: string | null
          creado_por?: string | null
          created_at?: string
          estado?: string
          fecha_esperada?: string | null
          fecha_pedido?: string | null
          id?: string
          notas?: string | null
          numero?: number
          owner_id?: string | null
          proveedor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          created_at: string
          email: string
          firma_path: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string
          firma_path?: string | null
          id: string
          nombre?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string
          firma_path?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          activo: boolean
          asesor_telefono: string | null
          ciudad: string | null
          contacto_nombre: string | null
          created_at: string
          dias_entrega: number | null
          direccion: string | null
          email: string | null
          etiquetas: string[]
          forma_pago: string | null
          id: string
          nit: string | null
          nombre: string
          notas: string | null
          owner_id: string | null
          sitio_web: string | null
          telefono: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          activo?: boolean
          asesor_telefono?: string | null
          ciudad?: string | null
          contacto_nombre?: string | null
          created_at?: string
          dias_entrega?: number | null
          direccion?: string | null
          email?: string | null
          etiquetas?: string[]
          forma_pago?: string | null
          id?: string
          nit?: string | null
          nombre: string
          notas?: string | null
          owner_id?: string | null
          sitio_web?: string | null
          telefono?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          activo?: boolean
          asesor_telefono?: string | null
          ciudad?: string | null
          contacto_nombre?: string | null
          created_at?: string
          dias_entrega?: number | null
          direccion?: string | null
          email?: string | null
          etiquetas?: string[]
          forma_pago?: string | null
          id?: string
          nit?: string | null
          nombre?: string
          notas?: string | null
          owner_id?: string | null
          sitio_web?: string | null
          telefono?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      reparaciones: {
        Row: {
          created_at: string
          equipo_id: string
          fin: string | null
          id: string
          inicio: string
          owner_id: string | null
          proveedor_id: string | null
        }
        Insert: {
          created_at?: string
          equipo_id: string
          fin?: string | null
          id?: string
          inicio?: string
          owner_id?: string | null
          proveedor_id?: string | null
        }
        Update: {
          created_at?: string
          equipo_id?: string
          fin?: string | null
          id?: string
          inicio?: string
          owner_id?: string | null
          proveedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reparaciones_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparaciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes_falla: {
        Row: {
          atendido_at: string | null
          atendido_por: string | null
          created_at: string
          descripcion: string
          empleado_id: string
          equipo_id: string
          estado: string
          id: string
          owner_id: string | null
          respuesta: string | null
        }
        Insert: {
          atendido_at?: string | null
          atendido_por?: string | null
          created_at?: string
          descripcion: string
          empleado_id: string
          equipo_id: string
          estado?: string
          id?: string
          owner_id?: string | null
          respuesta?: string | null
        }
        Update: {
          atendido_at?: string | null
          atendido_por?: string | null
          created_at?: string
          descripcion?: string
          empleado_id?: string
          equipo_id?: string
          estado?: string
          id?: string
          owner_id?: string | null
          respuesta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reportes_falla_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_falla_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_reabastecimiento: {
        Row: {
          cantidad: number
          cerrado_at: string | null
          created_at: string
          estado: string
          id: string
          owner_id: string | null
          proveedor_id: string | null
          solicitado_nombre: string | null
          solicitado_por: string | null
          tipo_id: string
          updated_at: string
        }
        Insert: {
          cantidad?: number
          cerrado_at?: string | null
          created_at?: string
          estado?: string
          id?: string
          owner_id?: string | null
          proveedor_id?: string | null
          solicitado_nombre?: string | null
          solicitado_por?: string | null
          tipo_id: string
          updated_at?: string
        }
        Update: {
          cantidad?: number
          cerrado_at?: string | null
          created_at?: string
          estado?: string
          id?: string
          owner_id?: string | null
          proveedor_id?: string | null
          solicitado_nombre?: string | null
          solicitado_por?: string | null
          tipo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_reabastecimiento_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitudes_reabastecimiento_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "catalogo_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens_firma: {
        Row: {
          acta_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          acta_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          acta_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tokens_firma_acta_id_fkey"
            columns: ["acta_id"]
            isOneToOne: false
            referencedRelation: "actas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permisos: {
        Row: {
          created_at: string
          id: string
          permiso: Database["public"]["Enums"]["app_permiso"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permiso: Database["public"]["Enums"]["app_permiso"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permiso?: Database["public"]["Enums"]["app_permiso"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          owner_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          owner_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          owner_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      anular_acta: {
        Args: { p_acta: string; p_motivo: string }
        Returns: undefined
      }
      asignar_carga_inicial: { Args: { p_items: Json }; Returns: number }
      atender_falla: {
        Args: { p_estado: string; p_reporte: string; p_respuesta: string }
        Returns: undefined
      }
      cambiar_estado_equipo: {
        Args: {
          p_equipo: string
          p_estado: Database["public"]["Enums"]["equipo_estado"]
          p_motivo: string
          p_proveedor?: string
          p_documento_baja?: string
        }
        Returns: undefined
      }
      certificar_equipos: {
        Args: { p_cert: string; p_comentario: string; p_faltantes: string[] }
        Returns: undefined
      }
      corregir_serie: {
        Args: { p_equipo: string; p_motivo: string; p_serie: string }
        Returns: undefined
      }
      estadisticas_avanzadas: {
        Args: { p_sede?: string; p_tipo?: string }
        Returns: Json
      }
      estadisticas_inventario: {
        Args: { p_sede?: string; p_tipo?: string }
        Returns: Json
      }
      finalizar_reparacion: {
        Args: { p_devolver: boolean; p_equipo: string; p_motivo: string }
        Returns: undefined
      }
      has_permiso: {
        Args: {
          _p: Database["public"]["Enums"]["app_permiso"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      log_evento: {
        Args: { p_accion: string; p_detalle?: string }
        Returns: undefined
      }
      marcar_alistado: {
        Args: { p_equipo: string; p_nota: string }
        Returns: undefined
      }
      my_empleado_id: { Args: never; Returns: string }
      my_owner_id: { Args: never; Returns: string }
      panel_conteos: {
        Args: never
        Returns: {
          estado: Database["public"]["Enums"]["equipo_estado"]
          total: number
        }[]
      }
      panel_conteos_actas: {
        Args: never
        Returns: {
          estado: Database["public"]["Enums"]["acta_estado"]
          total: number
        }[]
      }
      recibir_pedido_linea: {
        Args: {
          p_activos?: string[]
          p_factura: string
          p_garantia: string
          p_linea: string
          p_marca: string
          p_modelo: string
          p_nombres?: string[]
          p_sede: string
          p_seriales: string[]
          p_sin_serial: number
          p_valor: number
        }
        Returns: number
      }
      reportar_falla: {
        Args: { p_descripcion: string; p_equipo: string }
        Returns: undefined
      }
      resumen_proveedores: {
        Args: never
        Returns: {
          dias_promedio: number
          en_garantia: number
          en_reparacion: number
          equipos: number
          nombre: string
          proveedor_id: string
          reparaciones: number
          valor: number
        }[]
      }
      stock_bajo: {
        Args: never
        Returns: {
          disponibles: number
          stock_minimo: number
          tipo: string
          tipo_id: string
        }[]
      }
    }
    Enums: {
      acta_estado: "pendiente" | "firmada" | "anulada"
      acta_tipo: "entrega" | "devolucion" | "cambio"
      app_permiso:
        | "equipos_editar"
        | "empleados_editar"
        | "cargas_masivas"
        | "actas_entrega"
        | "actas_devolucion"
        | "firmas_capturar"
        | "repositorio_ver"
        | "reportes_exportar"
      app_role: "admin" | "auxiliar" | "empleado"
      catalogo_tipo: "marca" | "tipo_equipo" | "sede" | "area" | "empresa"
      equipo_estado:
        | "disponible"
        | "asignado"
        | "en_reparacion"
        | "de_baja"
        | "en_alistamiento"
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
      acta_estado: ["pendiente", "firmada", "anulada"],
      acta_tipo: ["entrega", "devolucion", "cambio"],
      app_permiso: [
        "equipos_editar",
        "empleados_editar",
        "cargas_masivas",
        "actas_entrega",
        "actas_devolucion",
        "firmas_capturar",
        "repositorio_ver",
        "reportes_exportar",
      ],
      app_role: ["admin", "auxiliar", "empleado"],
      catalogo_tipo: ["marca", "tipo_equipo", "sede", "area", "empresa"],
      equipo_estado: [
        "disponible",
        "asignado",
        "en_reparacion",
        "de_baja",
        "en_alistamiento",
      ],
    },
  },
} as const
