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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          site_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          site_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          site_id?: string | null
        }
        Relationships: []
      }
      axes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          site_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "axes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      axis_pharmacies: {
        Row: {
          axis_id: string
          created_at: string
          id: string
          pharmacy_id: string
          position: number
        }
        Insert: {
          axis_id: string
          created_at?: string
          id?: string
          pharmacy_id: string
          position?: number
        }
        Update: {
          axis_id?: string
          created_at?: string
          id?: string
          pharmacy_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "axis_pharmacies_axis_id_fkey"
            columns: ["axis_id"]
            isOneToOne: false
            referencedRelation: "axes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "axis_pharmacies_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          bacs_recovered: number
          bacs_to_recover: number
          created_at: string
          delivered_at: string | null
          driver_id: string | null
          driver_latitude: number | null
          driver_longitude: number | null
          has_verification_code: boolean | null
          id: string
          nb_barques: number
          nb_barques_received: number | null
          nb_cartons: number
          nb_cartons_received: number | null
          nb_sachets: number
          nb_sachets_received: number | null
          packages: Json
          parcours_id: string | null
          pharmacy_id: string
          receipt_pdf_url: string | null
          recipient_name: string | null
          recipient_signature: string | null
          reference: string
          site_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
          verification_code: string | null
        }
        Insert: {
          bacs_recovered?: number
          bacs_to_recover?: number
          created_at?: string
          delivered_at?: string | null
          driver_id?: string | null
          driver_latitude?: number | null
          driver_longitude?: number | null
          has_verification_code?: boolean | null
          id?: string
          nb_barques?: number
          nb_barques_received?: number | null
          nb_cartons?: number
          nb_cartons_received?: number | null
          nb_sachets?: number
          nb_sachets_received?: number | null
          packages?: Json
          parcours_id?: string | null
          pharmacy_id: string
          receipt_pdf_url?: string | null
          recipient_name?: string | null
          recipient_signature?: string | null
          reference: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          verification_code?: string | null
        }
        Update: {
          bacs_recovered?: number
          bacs_to_recover?: number
          created_at?: string
          delivered_at?: string | null
          driver_id?: string | null
          driver_latitude?: number | null
          driver_longitude?: number | null
          has_verification_code?: boolean | null
          id?: string
          nb_barques?: number
          nb_barques_received?: number | null
          nb_cartons?: number
          nb_cartons_received?: number | null
          nb_sachets?: number
          nb_sachets_received?: number | null
          packages?: Json
          parcours_id?: string | null
          pharmacy_id?: string
          receipt_pdf_url?: string | null
          recipient_name?: string | null
          recipient_signature?: string | null
          reference?: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          verification_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_parcours_id_fkey"
            columns: ["parcours_id"]
            isOneToOne: false
            referencedRelation: "parcours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      parcours: {
        Row: {
          axis_id: string | null
          created_at: string
          driver_id: string
          force_confirmed: boolean
          force_confirmed_at: string | null
          force_confirmed_by: string | null
          force_confirmed_reason: string | null
          id: string
          name: string
          site_id: string | null
          status: Database["public"]["Enums"]["parcours_status"]
          updated_at: string
        }
        Insert: {
          axis_id?: string | null
          created_at?: string
          driver_id: string
          force_confirmed?: boolean
          force_confirmed_at?: string | null
          force_confirmed_by?: string | null
          force_confirmed_reason?: string | null
          id?: string
          name: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["parcours_status"]
          updated_at?: string
        }
        Update: {
          axis_id?: string | null
          created_at?: string
          driver_id?: string
          force_confirmed?: boolean
          force_confirmed_at?: string | null
          force_confirmed_by?: string | null
          force_confirmed_reason?: string | null
          id?: string
          name?: string
          site_id?: string | null
          status?: Database["public"]["Enums"]["parcours_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcours_axis_id_fkey"
            columns: ["axis_id"]
            isOneToOne: false
            referencedRelation: "axes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcours_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      parcours_colis: {
        Row: {
          barcode: string
          created_at: string
          id: string
          parcours_id: string
          parcours_pharmacy_id: string
          type: string
        }
        Insert: {
          barcode: string
          created_at?: string
          id?: string
          parcours_id: string
          parcours_pharmacy_id: string
          type: string
        }
        Update: {
          barcode?: string
          created_at?: string
          id?: string
          parcours_id?: string
          parcours_pharmacy_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcours_colis_parcours_id_fkey"
            columns: ["parcours_id"]
            isOneToOne: false
            referencedRelation: "parcours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcours_colis_parcours_pharmacy_id_fkey"
            columns: ["parcours_pharmacy_id"]
            isOneToOne: false
            referencedRelation: "parcours_pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      parcours_inventaire: {
        Row: {
          completed_at: string | null
          created_at: string
          driver_id: string
          id: string
          notes: string | null
          parcours_id: string
          status: string
          total_expected: number
          total_extra: number
          total_missing: number
          total_scanned: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          driver_id: string
          id?: string
          notes?: string | null
          parcours_id: string
          status?: string
          total_expected?: number
          total_extra?: number
          total_missing?: number
          total_scanned?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          notes?: string | null
          parcours_id?: string
          status?: string
          total_expected?: number
          total_extra?: number
          total_missing?: number
          total_scanned?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parcours_inventaire_parcours_id_fkey"
            columns: ["parcours_id"]
            isOneToOne: false
            referencedRelation: "parcours"
            referencedColumns: ["id"]
          },
        ]
      }
      parcours_inventaire_scans: {
        Row: {
          barcode: string
          created_at: string
          id: string
          inventaire_id: string
          pharmacy_name: string | null
          status: string
          type: string | null
        }
        Insert: {
          barcode: string
          created_at?: string
          id?: string
          inventaire_id: string
          pharmacy_name?: string | null
          status?: string
          type?: string | null
        }
        Update: {
          barcode?: string
          created_at?: string
          id?: string
          inventaire_id?: string
          pharmacy_name?: string | null
          status?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcours_inventaire_scans_inventaire_id_fkey"
            columns: ["inventaire_id"]
            isOneToOne: false
            referencedRelation: "parcours_inventaire"
            referencedColumns: ["id"]
          },
        ]
      }
      parcours_pharmacies: {
        Row: {
          created_at: string
          id: string
          parcours_id: string
          pharmacy_id: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          parcours_id: string
          pharmacy_id: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          parcours_id?: string
          pharmacy_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "parcours_pharmacies_parcours_id_fkey"
            columns: ["parcours_id"]
            isOneToOne: false
            referencedRelation: "parcours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcours_pharmacies_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacies: {
        Row: {
          address: string | null
          client_code: string
          created_at: string
          email: string | null
          id: string
          latitude: number | null
          location_source: string | null
          longitude: number | null
          name: string
          phone: string | null
          site_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          client_code: string
          created_at?: string
          email?: string | null
          id?: string
          latitude?: number | null
          location_source?: string | null
          longitude?: number | null
          name: string
          phone?: string | null
          site_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          client_code?: string
          created_at?: string
          email?: string | null
          id?: string
          latitude?: number | null
          location_source?: string | null
          longitude?: number | null
          name?: string
          phone?: string | null
          site_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacies_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacy_bacs_balance: {
        Row: {
          id: string
          pending_bacs: number
          pharmacy_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          pending_bacs?: number
          pharmacy_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          pending_bacs?: number
          pharmacy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_bacs_balance_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: true
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          site_id: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          site_id?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          site_id?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_credentials: {
        Row: {
          created_at: string
          full_name: string
          id: string
          identifier: string
          password_encrypted: string
          role: Database["public"]["Enums"]["app_role"]
          site_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          identifier: string
          password_encrypted: string
          role: Database["public"]["Enums"]["app_role"]
          site_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          identifier?: string
          password_encrypted?: string
          role?: Database["public"]["Enums"]["app_role"]
          site_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_credentials_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
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
      admin_can_access_axis: {
        Args: { _axis: string; _uid: string }
        Returns: boolean
      }
      admin_can_access_parcours: {
        Args: { _parcours: string; _uid: string }
        Returns: boolean
      }
      admin_can_access_pharmacy: {
        Args: { _pharmacy: string; _uid: string }
        Returns: boolean
      }
      admin_can_access_site: {
        Args: { _site: string; _uid: string }
        Returns: boolean
      }
      generate_client_code: { Args: never; Returns: string }
      generate_verification_code: { Args: never; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_site: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      resolve_identifier_to_email: {
        Args: { identifier: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "livreur" | "pharmacie" | "super_admin"
      delivery_status: "en_attente" | "livre"
      parcours_status: "en_attente_inventaire" | "en_cours" | "termine"
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
      app_role: ["admin", "livreur", "pharmacie", "super_admin"],
      delivery_status: ["en_attente", "livre"],
      parcours_status: ["en_attente_inventaire", "en_cours", "termine"],
    },
  },
} as const
