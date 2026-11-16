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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      absences: {
        Row: {
          azubi_id: string
          created_at: string
          date_from: string
          date_to: string
          id: string
          note: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["absence_status"]
          type: Database["public"]["Enums"]["absence_type"]
          updated_at: string
        }
        Insert: {
          azubi_id: string
          created_at?: string
          date_from: string
          date_to: string
          id?: string
          note?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["absence_status"]
          type: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
        }
        Update: {
          azubi_id?: string
          created_at?: string
          date_from?: string
          date_to?: string
          id?: string
          note?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["absence_status"]
          type?: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          created_at: string
          duration_ms: number
          field: string
          id: string
          input_chars: number
          ok: boolean
          output_chars: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          field: string
          id?: string
          input_chars: number
          ok?: boolean
          output_chars?: number
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          field?: string
          id?: string
          input_chars?: number
          ok?: boolean
          output_chars?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          azubi_id: string | null
          chain_key: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: number
          prev_hash: string | null
          row_hash: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          azubi_id?: string | null
          chain_key?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: never
          prev_hash?: string | null
          row_hash?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          azubi_id?: string | null
          chain_key?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: never
          prev_hash?: string | null
          row_hash?: string | null
        }
        Relationships: []
      }
      azubi_links: {
        Row: {
          access: string
          azubi_id: string
          code_id: string | null
          created_at: string
          is_primary: boolean
          member_id: string
        }
        Insert: {
          access: string
          azubi_id: string
          code_id?: string | null
          created_at?: string
          is_primary?: boolean
          member_id: string
        }
        Update: {
          access?: string
          azubi_id?: string
          code_id?: string | null
          created_at?: string
          is_primary?: boolean
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "azubi_links_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "azubi_links_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "link_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "azubi_links_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      azubi_plans: {
        Row: {
          azubi_id: string
          plan_id: string
          set_at: string
          set_by: string | null
        }
        Insert: {
          azubi_id: string
          plan_id: string
          set_at?: string
          set_by?: string | null
        }
        Update: {
          azubi_id?: string
          plan_id?: string
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "azubi_plans_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "azubi_plans_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "azubi_plans_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      azubi_viewers: {
        Row: {
          azubi_id: string
          created_at: string
          created_by: string | null
          viewer_id: string
        }
        Insert: {
          azubi_id: string
          created_at?: string
          created_by?: string | null
          viewer_id: string
        }
        Update: {
          azubi_id?: string
          created_at?: string
          created_by?: string | null
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "azubi_viewers_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "azubi_viewers_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bundeslaender: {
        Row: {
          code: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          name: string
          sort_order: number
        }
        Update: {
          code?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          bundesland: string | null
          chamber: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          id: string
          legal_form: string | null
          logo_url: string | null
          name: string
          training_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bundesland?: string | null
          chamber?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          legal_form?: string | null
          logo_url?: string | null
          name: string
          training_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bundesland?: string | null
          chamber?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          legal_form?: string | null
          logo_url?: string | null
          name?: string
          training_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_bundesland_fkey"
            columns: ["bundesland"]
            isOneToOne: false
            referencedRelation: "bundeslaender"
            referencedColumns: ["code"]
          },
        ]
      }
      company_professions: {
        Row: {
          company_id: string
          created_at: string
          profession_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          profession_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          profession_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_professions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_professions_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          granted_at: string
          id: string
          kind: Database["public"]["Enums"]["consent_kind"]
          revoked_at: string | null
          text_version: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          kind: Database["public"]["Enums"]["consent_kind"]
          revoked_at?: string | null
          text_version: string
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["consent_kind"]
          revoked_at?: string | null
          text_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          handled_note: string | null
          id: string
          note: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          handled_note?: string | null
          id?: string
          note?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          handled_note?: string | null
          id?: string
          note?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_queue: {
        Row: {
          attempts: number
          channel: string
          claimed_at: string | null
          created_at: string
          id: number
          last_error: string | null
          notification_id: string
          scheduled_at: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          claimed_at?: string | null
          created_at?: string
          id?: never
          last_error?: string | null
          notification_id: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          claimed_at?: string | null
          created_at?: string
          id?: never
          last_error?: string | null
          notification_id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_queue_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      deputies: {
        Row: {
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string
          deputy_id: string
          id: string
          note: string | null
          principal_id: string
          reason: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_from: string
          date_to: string
          deputy_id: string
          id?: string
          note?: string | null
          principal_id: string
          reason: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          deputy_id?: string
          id?: string
          note?: string | null
          principal_id?: string
          reason?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deputies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deputies_deputy_id_fkey"
            columns: ["deputy_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deputies_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_attachments: {
        Row: {
          azubi_id: string
          caption: string | null
          created_at: string
          experience_id: string
          file_name: string
          height: number | null
          id: string
          mime_type: string
          sha256: string | null
          size_bytes: number
          sort_order: number
          storage_path: string
          thumb_path: string | null
          width: number | null
        }
        Insert: {
          azubi_id: string
          caption?: string | null
          created_at?: string
          experience_id: string
          file_name: string
          height?: number | null
          id?: string
          mime_type: string
          sha256?: string | null
          size_bytes: number
          sort_order?: number
          storage_path: string
          thumb_path?: string | null
          width?: number | null
        }
        Update: {
          azubi_id?: string
          caption?: string | null
          created_at?: string
          experience_id?: string
          file_name?: string
          height?: number | null
          id?: string
          mime_type?: string
          sha256?: string | null
          size_bytes?: number
          sort_order?: number
          storage_path?: string
          thumb_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_attachments_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_attachments_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_comments: {
        Row: {
          author_id: string
          azubi_id: string
          body: string
          created_at: string
          experience_id: string
          id: string
          kind: string
          section: string
        }
        Insert: {
          author_id?: string
          azubi_id: string
          body: string
          created_at?: string
          experience_id: string
          id?: string
          kind?: string
          section?: string
        }
        Update: {
          author_id?: string
          azubi_id?: string
          body?: string
          created_at?: string
          experience_id?: string
          id?: string
          kind?: string
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_comments_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_comments_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_reports: {
        Row: {
          area: string
          azubi_id: string
          body: string
          content_hash: string | null
          created_at: string
          id: string
          kind: string
          reasoning: string
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          title: string
          updated_at: string
          version: number
          written_on: string
        }
        Insert: {
          area?: string
          azubi_id: string
          body?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          kind?: string
          reasoning?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          title?: string
          updated_at?: string
          version?: number
          written_on?: string
        }
        Update: {
          area?: string
          azubi_id?: string
          body?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          kind?: string
          reasoning?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          title?: string
          updated_at?: string
          version?: number
          written_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_reports_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_reports_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_requirements: {
        Row: {
          bundesland: string | null
          checked_on: string | null
          created_at: string
          hint_kind: string | null
          hint_per_year: number | null
          hint_total: number | null
          hint_until_interim: number | null
          id: string
          is_active: boolean
          leittext_weight: number
          min_pages: number | null
          note: string | null
          page_unit: string | null
          profession_code: string | null
          required_basis: string
          required_per_year: number
          source_issuer: string | null
          source_stand: string | null
          source_title: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          bundesland?: string | null
          checked_on?: string | null
          created_at?: string
          hint_kind?: string | null
          hint_per_year?: number | null
          hint_total?: number | null
          hint_until_interim?: number | null
          id?: string
          is_active?: boolean
          leittext_weight?: number
          min_pages?: number | null
          note?: string | null
          page_unit?: string | null
          profession_code?: string | null
          required_basis?: string
          required_per_year?: number
          source_issuer?: string | null
          source_stand?: string | null
          source_title?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          bundesland?: string | null
          checked_on?: string | null
          created_at?: string
          hint_kind?: string | null
          hint_per_year?: number | null
          hint_total?: number | null
          hint_until_interim?: number | null
          id?: string
          is_active?: boolean
          leittext_weight?: number
          min_pages?: number | null
          note?: string | null
          page_unit?: string | null
          profession_code?: string | null
          required_basis?: string
          required_per_year?: number
          source_issuer?: string | null
          source_stand?: string | null
          source_title?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_requirements_bundesland_fkey"
            columns: ["bundesland"]
            isOneToOne: false
            referencedRelation: "bundeslaender"
            referencedColumns: ["code"]
          },
        ]
      }
      experience_signatures: {
        Row: {
          client_signed_at: string | null
          content_hash: string | null
          experience_id: string
          experience_version: number
          id: string
          image_path: string | null
          method: string
          on_behalf_of: string | null
          role: string
          signed_at: string
          signer_id: string
          signer_name: string
          signer_role_label: string | null
        }
        Insert: {
          client_signed_at?: string | null
          content_hash?: string | null
          experience_id: string
          experience_version: number
          id?: string
          image_path?: string | null
          method: string
          on_behalf_of?: string | null
          role: string
          signed_at?: string
          signer_id: string
          signer_name: string
          signer_role_label?: string | null
        }
        Update: {
          client_signed_at?: string | null
          content_hash?: string | null
          experience_id?: string
          experience_version?: number
          id?: string
          image_path?: string | null
          method?: string
          on_behalf_of?: string | null
          role?: string
          signed_at?: string
          signer_id?: string
          signer_name?: string
          signer_role_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experience_signatures_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_signatures_on_behalf_of_fkey"
            columns: ["on_behalf_of"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_signatures_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_versions: {
        Row: {
          changed_by: string | null
          content_hash: string | null
          created_at: string
          experience_id: string
          id: string
          snapshot: Json
          status: string
          version: number
        }
        Insert: {
          changed_by?: string | null
          content_hash?: string | null
          created_at?: string
          experience_id: string
          id?: string
          snapshot: Json
          status: string
          version: number
        }
        Update: {
          changed_by?: string | null
          content_hash?: string | null
          created_at?: string
          experience_id?: string
          id?: string
          snapshot?: Json
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "experience_versions_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experience_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      function_calls: {
        Row: {
          created_at: string
          fn: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          fn: string
          id?: never
          user_id: string
        }
        Update: {
          created_at?: string
          fn?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      instruction_catalogs: {
        Row: {
          code: string
          created_at: string
          id: string
          profession_id: string | null
          sort_order: number
          source: string | null
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          profession_id?: string | null
          sort_order?: number
          source?: string | null
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          profession_id?: string | null
          sort_order?: number
          source?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instruction_catalogs_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
        ]
      }
      instruction_points: {
        Row: {
          catalog_id: string
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          topic_id: string
        }
        Insert: {
          catalog_id: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          topic_id: string
        }
        Update: {
          catalog_id?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instruction_points_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "instruction_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instruction_points_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "instruction_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      instruction_record_points: {
        Row: {
          point_id: string
          record_id: string
        }
        Insert: {
          point_id: string
          record_id: string
        }
        Update: {
          point_id?: string
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instruction_record_points_point_id_fkey"
            columns: ["point_id"]
            isOneToOne: false
            referencedRelation: "instruction_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instruction_record_points_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "instruction_records"
            referencedColumns: ["id"]
          },
        ]
      }
      instruction_records: {
        Row: {
          azubi_id: string
          confirmed_by_name: string | null
          confirmed_role_label: string | null
          content_hash: string | null
          created_at: string
          duration_minutes: number | null
          given_on: string | null
          id: string
          instructor_name: string | null
          notes: string | null
          on_behalf_of: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          submitted_at: string | null
          title: string
          topic_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          azubi_id: string
          confirmed_by_name?: string | null
          confirmed_role_label?: string | null
          content_hash?: string | null
          created_at?: string
          duration_minutes?: number | null
          given_on?: string | null
          id?: string
          instructor_name?: string | null
          notes?: string | null
          on_behalf_of?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          title: string
          topic_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          azubi_id?: string
          confirmed_by_name?: string | null
          confirmed_role_label?: string | null
          content_hash?: string | null
          created_at?: string
          duration_minutes?: number | null
          given_on?: string | null
          id?: string
          instructor_name?: string | null
          notes?: string | null
          on_behalf_of?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "instruction_records_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instruction_records_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instruction_records_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "instruction_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      instruction_topics: {
        Row: {
          catalog_id: string
          category: string
          hint: string | null
          id: string
          interval_months: number | null
          is_active: boolean
          is_optional: boolean
          key: string
          legal_basis: string | null
          sort_order: number
          title: string
          when_text: string | null
        }
        Insert: {
          catalog_id: string
          category: string
          hint?: string | null
          id?: string
          interval_months?: number | null
          is_active?: boolean
          is_optional?: boolean
          key: string
          legal_basis?: string | null
          sort_order?: number
          title: string
          when_text?: string | null
        }
        Update: {
          catalog_id?: string
          category?: string
          hint?: string | null
          id?: string
          interval_months?: number | null
          is_active?: boolean
          is_optional?: boolean
          key?: string
          legal_basis?: string | null
          sort_order?: number
          title?: string
          when_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instruction_topics_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "instruction_catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          note: string | null
          role: Database["public"]["Enums"]["app_role"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          note?: string | null
          role: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      link_codes: {
        Row: {
          access: string
          azubi_id: string
          code: string
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          access: string
          azubi_id: string
          code: string
          created_at?: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          access?: string
          azubi_id?: string
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_codes_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          daily_nudge_enabled: boolean
          daily_nudge_time: string
          groups: Json
          quiet_from: string
          quiet_hours_enabled: boolean
          quiet_to: string
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_nudge_enabled?: boolean
          daily_nudge_time?: string
          groups: Json
          quiet_from?: string
          quiet_hours_enabled?: boolean
          quiet_to?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_nudge_enabled?: boolean
          daily_nudge_time?: string
          groups?: Json
          quiet_from?: string
          quiet_hours_enabled?: boolean
          quiet_to?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_groups: {
        Row: {
          hint: string | null
          id: string
          key: string
          reference: string | null
          section_id: string
          sort_order: number
          title: string
          weeks_text: string | null
        }
        Insert: {
          hint?: string | null
          id?: string
          key: string
          reference?: string | null
          section_id: string
          sort_order?: number
          title: string
          weeks_text?: string | null
        }
        Update: {
          hint?: string | null
          id?: string
          key?: string
          reference?: string | null
          section_id?: string
          sort_order?: number
          title?: string
          weeks_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_groups_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "plan_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          group_id: string
          id: string
          is_active: boolean
          key: string
          label: string
          plan_id: string
          reference: string | null
          sort_order: number
        }
        Insert: {
          group_id: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          plan_id: string
          reference?: string | null
          sort_order?: number
        }
        Update: {
          group_id?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          plan_id?: string
          reference?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "plan_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_progress: {
        Row: {
          azubi_id: string
          item_id: string
          mastered: string
          planned: boolean
          updated_at: string
          year: number
        }
        Insert: {
          azubi_id: string
          item_id: string
          mastered?: string
          planned?: boolean
          updated_at?: string
          year: number
        }
        Update: {
          azubi_id?: string
          item_id?: string
          mastered?: string
          planned?: boolean
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_progress_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_progress_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_sections: {
        Row: {
          hint: string | null
          id: string
          key: string
          kind: string
          plan_id: string
          sort_order: number
          title: string
        }
        Insert: {
          hint?: string | null
          id?: string
          key: string
          kind?: string
          plan_id: string
          sort_order?: number
          title: string
        }
        Update: {
          hint?: string | null
          id?: string
          key?: string
          kind?: string
          plan_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_sections_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      professions: {
        Row: {
          ai_hints: string
          chamber: string | null
          code: string | null
          created_at: string
          description: string | null
          duration_months: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          ai_hints?: string
          chamber?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          duration_months?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          ai_hints?: string
          chamber?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          duration_months?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ausbilder_id: string | null
          ausbildungsbeginn: string | null
          ausbildungsende: string | null
          bundesland: string | null
          company_id: string | null
          created_at: string
          email: string
          full_name: string
          geburtsdatum: string | null
          id: string
          land: string
          nachname: string
          notfallkontakt_name: string | null
          notfallkontakt_telefon: string | null
          ort: string | null
          personalnummer: string | null
          plz: string | null
          profession_id: string | null
          strasse: string | null
          telefon: string | null
          updated_at: string
          vorname: string
        }
        Insert: {
          ausbilder_id?: string | null
          ausbildungsbeginn?: string | null
          ausbildungsende?: string | null
          bundesland?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          geburtsdatum?: string | null
          id: string
          land?: string
          nachname?: string
          notfallkontakt_name?: string | null
          notfallkontakt_telefon?: string | null
          ort?: string | null
          personalnummer?: string | null
          plz?: string | null
          profession_id?: string | null
          strasse?: string | null
          telefon?: string | null
          updated_at?: string
          vorname?: string
        }
        Update: {
          ausbilder_id?: string | null
          ausbildungsbeginn?: string | null
          ausbildungsende?: string | null
          bundesland?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          geburtsdatum?: string | null
          id?: string
          land?: string
          nachname?: string
          notfallkontakt_name?: string | null
          notfallkontakt_telefon?: string | null
          ort?: string | null
          personalnummer?: string | null
          plz?: string | null
          profession_id?: string | null
          strasse?: string | null
          telefon?: string | null
          updated_at?: string
          vorname?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_ausbilder_fk"
            columns: ["ausbilder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_bundesland_fkey"
            columns: ["bundesland"]
            isOneToOne: false
            referencedRelation: "bundeslaender"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "profiles_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_profession_fk"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_label: string | null
          endpoint: string
          endpoint_hash: string | null
          failure_count: number
          id: string
          last_used_at: string | null
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device_label?: string | null
          endpoint: string
          endpoint_hash?: string | null
          failure_count?: number
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device_label?: string | null
          endpoint?: string
          endpoint_hash?: string | null
          failure_count?: number
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          created_at: string
          id: string
          period_key: string
          rule: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          period_key: string
          rule: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          period_key?: string
          rule?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_attachments: {
        Row: {
          azubi_id: string
          caption: string | null
          created_at: string
          file_name: string
          height: number | null
          id: string
          mime_type: string
          report_id: string
          sha256: string | null
          size_bytes: number
          sort_order: number
          storage_path: string
          thumb_path: string | null
          width: number | null
        }
        Insert: {
          azubi_id: string
          caption?: string | null
          created_at?: string
          file_name: string
          height?: number | null
          id?: string
          mime_type: string
          report_id: string
          sha256?: string | null
          size_bytes: number
          sort_order?: number
          storage_path: string
          thumb_path?: string | null
          width?: number | null
        }
        Update: {
          azubi_id?: string
          caption?: string | null
          created_at?: string
          file_name?: string
          height?: number | null
          id?: string
          mime_type?: string
          report_id?: string
          sha256?: string | null
          size_bytes?: number
          sort_order?: number
          storage_path?: string
          thumb_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_attachments_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_comments: {
        Row: {
          author_id: string
          azubi_id: string
          body: string
          created_at: string
          id: string
          kind: string
          report_id: string
          section: string | null
        }
        Insert: {
          author_id?: string
          azubi_id: string
          body: string
          created_at?: string
          id?: string
          kind?: string
          report_id: string
          section?: string | null
        }
        Update: {
          author_id?: string
          azubi_id?: string
          body?: string
          created_at?: string
          id?: string
          kind?: string
          report_id?: string
          section?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_plan_items: {
        Row: {
          created_at: string
          item_id: string
          report_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          report_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_plan_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_plan_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_reminders: {
        Row: {
          azubi_id: string
          channel: string
          created_at: string
          id: string
          message: string
          period_label: string
          sender_id: string | null
        }
        Insert: {
          azubi_id: string
          channel?: string
          created_at?: string
          id?: string
          message: string
          period_label: string
          sender_id?: string | null
        }
        Update: {
          azubi_id?: string
          channel?: string
          created_at?: string
          id?: string
          message?: string
          period_label?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_reminders_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_reminders_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_signatures: {
        Row: {
          client_signed_at: string | null
          content_hash: string | null
          id: string
          image_path: string | null
          method: string
          on_behalf_of: string | null
          report_id: string
          report_version: number
          role: string
          signed_at: string
          signer_id: string
          signer_name: string
          signer_role_label: string | null
        }
        Insert: {
          client_signed_at?: string | null
          content_hash?: string | null
          id?: string
          image_path?: string | null
          method: string
          on_behalf_of?: string | null
          report_id: string
          report_version: number
          role: string
          signed_at?: string
          signer_id: string
          signer_name: string
          signer_role_label?: string | null
        }
        Update: {
          client_signed_at?: string | null
          content_hash?: string | null
          id?: string
          image_path?: string | null
          method?: string
          on_behalf_of?: string | null
          report_id?: string
          report_version?: number
          role?: string
          signed_at?: string
          signer_id?: string
          signer_name?: string
          signer_role_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_signatures_on_behalf_of_fkey"
            columns: ["on_behalf_of"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_signatures_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_signatures_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_topics: {
        Row: {
          created_at: string
          report_id: string
          topic_id: string
        }
        Insert: {
          created_at?: string
          report_id: string
          topic_id: string
        }
        Update: {
          created_at?: string
          report_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_topics_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "training_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      report_versions: {
        Row: {
          changed_by: string | null
          content_hash: string | null
          created_at: string
          id: string
          report_id: string
          snapshot: Json
          status: Database["public"]["Enums"]["report_status"]
          version: number
        }
        Insert: {
          changed_by?: string | null
          content_hash?: string | null
          created_at?: string
          id?: string
          report_id: string
          snapshot: Json
          status: Database["public"]["Enums"]["report_status"]
          version: number
        }
        Update: {
          changed_by?: string | null
          content_hash?: string | null
          created_at?: string
          id?: string
          report_id?: string
          snapshot?: Json
          status?: Database["public"]["Enums"]["report_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          activities: string | null
          azubi_id: string
          content_hash: string | null
          created_at: string
          id: string
          instructions: string | null
          report_date: string
          report_type: Database["public"]["Enums"]["report_type"]
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          school_content: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          summary: string | null
          updated_at: string
          version: number
          week_number: number | null
          weekly_mode: string
          year: number | null
        }
        Insert: {
          activities?: string | null
          azubi_id: string
          content_hash?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          report_date: string
          report_type: Database["public"]["Enums"]["report_type"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          school_content?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          summary?: string | null
          updated_at?: string
          version?: number
          week_number?: number | null
          weekly_mode?: string
          year?: number | null
        }
        Update: {
          activities?: string | null
          azubi_id?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          report_date?: string
          report_type?: Database["public"]["Enums"]["report_type"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          school_content?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          summary?: string | null
          updated_at?: string
          version?: number
          week_number?: number | null
          weekly_mode?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_grades: {
        Row: {
          azubi_id: string
          created_at: string
          grade: number
          grade_date: string
          id: string
          kind: Database["public"]["Enums"]["grade_kind"]
          note: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          azubi_id: string
          created_at?: string
          grade: number
          grade_date: string
          id?: string
          kind?: Database["public"]["Enums"]["grade_kind"]
          note?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          azubi_id?: string
          created_at?: string
          grade?: number
          grade_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["grade_kind"]
          note?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_grades_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          code: string
          created_at: string
          duration_years: number
          id: string
          is_template: boolean
          profession_id: string
          sort_order: number
          source: string | null
          status: string
          subtitle: string | null
          title: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          duration_years?: number
          id?: string
          is_template?: boolean
          profession_id: string
          sort_order?: number
          source?: string | null
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          duration_years?: number
          id?: string
          is_template?: boolean
          profession_id?: string
          sort_order?: number
          source?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_topics: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          profession_id: string
          sort_order: number
          target_year: number | null
          title: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          profession_id: string
          sort_order?: number
          target_year?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          profession_id?: string
          sort_order?: number
          target_year?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_topics_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_signatures: {
        Row: {
          image_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          image_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          image_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      absent_days: {
        Args: { _azubi: string; _from_date: string; _to_date: string }
        Returns: string[]
      }
      account_removal_active: { Args: never; Returns: boolean }
      account_removal_paths: { Args: { p_user: string }; Returns: string[] }
      acting_principal: {
        Args: { _azubi: string; _reviewer: string }
        Returns: string
      }
      admin_anonymize_user: {
        Args: { p_actor?: string; p_user: string }
        Returns: undefined
      }
      admin_delete_azubi_data: {
        Args: { p_actor?: string; p_user: string }
        Returns: undefined
      }
      admin_duplicate_catalog: {
        Args: { p_catalog: string; p_code: string; p_title: string }
        Returns: string
      }
      admin_duplicate_plan: {
        Args: { p_code: string; p_plan: string; p_title: string }
        Returns: string
      }
      admin_list_users: {
        Args: never
        Returns: {
          ausbilder_id: string
          company_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          profession_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      admin_plan_item_usage: {
        Args: { p_plan: string }
        Returns: {
          item_key: string
          used: boolean
        }[]
      }
      admin_save_instruction_catalog: {
        Args: { p_catalog: Json }
        Returns: string
      }
      admin_save_plan: { Args: { p_plan: Json }; Returns: string }
      admin_set_catalog_status: {
        Args: { p_catalog: string; p_status: string }
        Returns: undefined
      }
      admin_set_plan_status: {
        Args: { p_plan: string; p_status: string }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_set_viewers: {
        Args: { _azubi_id: string; _viewer_ids: string[] }
        Returns: undefined
      }
      admin_update_azubi: {
        Args: { _azubi_id: string; _patch: Json }
        Returns: undefined
      }
      approve_experience: {
        Args: {
          p_client_signed_at?: string
          p_expected_version: number
          p_id: string
          p_image_path?: string
          p_method: string
          p_note?: string
        }
        Returns: undefined
      }
      approve_report: {
        Args: {
          _client_signed_at?: string
          _expected_version: number
          _image_path?: string
          _method: string
          _note?: string
          _report_id: string
        }
        Returns: undefined
      }
      audit_azubi_options: {
        Args: never
        Returns: {
          full_name: string
          id: string
        }[]
      }
      audit_hash: {
        Args: {
          _action: string
          _actor_id: string
          _created_at: string
          _details: Json
          _entity_id: string
          _entity_type: string
          _prev_hash: string
        }
        Returns: string
      }
      audit_report_visible: { Args: { p_report: string }; Returns: boolean }
      can_comment_for: {
        Args: { _azubi: string; _user: string }
        Returns: boolean
      }
      can_review_for: {
        Args: { _azubi: string; _reviewer: string }
        Returns: boolean
      }
      can_view_azubi: {
        Args: { _azubi: string; _viewer: string }
        Returns: boolean
      }
      check_call_limit: {
        Args: { p_fn: string; p_max: number; p_user: string; p_window: string }
        Returns: boolean
      }
      claim_deliveries: {
        Args: { p_limit: number }
        Returns: {
          attempts: number
          channel: string
          id: number
          link: string
          notification_id: string
          type: string
          user_id: string
        }[]
      }
      compute_missing_weeks: {
        Args: { p_as_of: string; p_azubi: string }
        Returns: {
          azubi_id: string
          days_missing: number
          days_overdue: number
          week_end: string
          week_start: string
        }[]
      }
      confirm_instruction: {
        Args: { p_expected_version: number; p_id: string; p_note: string }
        Returns: undefined
      }
      create_invite_code: {
        Args: {
          _note?: string
          _role: Database["public"]["Enums"]["app_role"]
          _valid_days?: number
        }
        Returns: string
      }
      create_link_code: {
        Args: { p_access: string; p_hours?: number }
        Returns: {
          access: string
          code: string
          expires_at: string
          id: string
        }[]
      }
      default_notification_groups: { Args: never; Returns: Json }
      default_reminder_rules: { Args: never; Returns: Json }
      delivery_health: {
        Args: never
        Returns: {
          failed_7d: number
          last_sent_at: string
          pending: number
        }[]
      }
      display_names: {
        Args: { _ids: string[] }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      display_roles: {
        Args: { _ids: string[] }
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      effective_bundesland: { Args: { p_azubi: string }; Returns: string }
      effective_prefs: {
        Args: { _uid: string }
        Returns: {
          daily_nudge_enabled: boolean
          daily_nudge_time: string
          groups: Json
          quiet_from: string
          quiet_hours_enabled: boolean
          quiet_to: string
        }[]
      }
      experience_canonical: { Args: { p_id: string }; Returns: string }
      experience_hash: { Args: { p_id: string }; Returns: string }
      experience_requirement_for: {
        Args: { p_bundesland: string; p_profession_code: string }
        Returns: {
          bundesland: string | null
          checked_on: string | null
          created_at: string
          hint_kind: string | null
          hint_per_year: number | null
          hint_total: number | null
          hint_until_interim: number | null
          id: string
          is_active: boolean
          leittext_weight: number
          min_pages: number | null
          note: string | null
          page_unit: string | null
          profession_code: string | null
          required_basis: string
          required_per_year: number
          source_issuer: string | null
          source_stand: string | null
          source_title: string | null
          source_url: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "experience_requirements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      experience_review_queue: {
        Args: { statuses?: Database["public"]["Enums"]["report_status"][] }
        Returns: {
          azubi_id: string
          deputy_for: string
          experience_id: string
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string
        }[]
      }
      experience_title: { Args: { p_id: string }; Returns: string }
      experience_year_counts: {
        Args: { p_azubi: string }
        Returns: {
          approved: number
          azubi_id: string
          bundesland: string
          is_current: boolean
          profession_code: string
          required: number
          requirement_id: string
          submitted: number
          year_end: string
          year_no: number
          year_start: string
        }[]
      }
      export_catalog_json: { Args: { p_catalog: string }; Returns: Json }
      export_header: {
        Args: { p_azubi: string }
        Returns: {
          ausbilder_name: string
          azubi_name: string
          company_address: string
          company_name: string
          personalnummer: string
          profession_name: string
          training_end: string
          training_start: string
        }[]
      }
      export_my_data: { Args: never; Returns: Json }
      export_my_data_base: { Args: never; Returns: Json }
      export_plan_json: { Args: { p_plan: string }; Returns: Json }
      finish_delivery: {
        Args: { p_error: string; p_id: number; p_ok: boolean; p_skip: boolean }
        Returns: undefined
      }
      generate_instruction_reminders: {
        Args: { p_now: string }
        Returns: number
      }
      generate_reminders: { Args: { p_now?: string }; Returns: number }
      generate_reminders_base: { Args: { p_now?: string }; Returns: number }
      get_my_notification_prefs: {
        Args: never
        Returns: {
          daily_nudge_enabled: boolean
          daily_nudge_time: string
          groups: Json
          quiet_from: string
          quiet_hours_enabled: boolean
          quiet_to: string
        }[]
      }
      get_reminder_rules: { Args: never; Returns: Json }
      grant_consent: {
        Args: {
          _kind: Database["public"]["Enums"]["consent_kind"]
          _text_version: string
        }
        Returns: string
      }
      has_link: {
        Args: { _azubi: string; _member: string; _min: string }
        Returns: boolean
      }
      has_my_consent: {
        Args: { _kind: Database["public"]["Enums"]["consent_kind"] }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      instruction_hash: { Args: { p_id: string }; Returns: string }
      instruction_overview: {
        Args: { p_as_of?: string; p_azubi: string }
        Returns: {
          catalog_id: string
          due_on: string
          effective_months: number
          is_optional: boolean
          last_confirmed: boolean
          last_given_on: string
          last_record_id: string
          state: string
          topic_id: string
        }[]
      }
      instruction_overview_core: {
        Args: { p_as_of: string; p_azubi: string }
        Returns: {
          catalog_id: string
          due_on: string
          effective_months: number
          is_optional: boolean
          last_confirmed: boolean
          last_given_on: string
          last_record_id: string
          state: string
          topic_id: string
        }[]
      }
      instruction_pending: {
        Args: never
        Returns: {
          azubi_id: string
          azubi_name: string
          given_on: string
          record_id: string
          submitted_at: string
          title: string
        }[]
      }
      instruction_role_label: { Args: { p_user: string }; Returns: string }
      is_active_deputy: {
        Args: { _deputy: string; _on_date?: string; _principal: string }
        Returns: boolean
      }
      is_leitung: { Args: { _user_id: string }; Returns: boolean }
      is_reviewer_role: { Args: { _user_id: string }; Returns: boolean }
      kw_list: { Args: { weeks: string[] }; Returns: string }
      link_access_rank: { Args: { _access: string }; Returns: number }
      link_code_new: { Args: never; Returns: string }
      link_role_max: { Args: { _user: string }; Returns: number }
      list_company_choices: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      list_links: {
        Args: never
        Returns: {
          access: string
          azubi_id: string
          azubi_name: string
          created_at: string
          is_primary: boolean
          member_id: string
          member_name: string
          member_role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      list_possible_deputies: {
        Args: never
        Returns: {
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      list_selectable_plans: {
        Args: { p_azubi: string }
        Returns: {
          code: string
          duration_years: number
          id: string
          source: string
          subtitle: string
          title: string
          valid_from: string
          valid_until: string
        }[]
      }
      log_ai_assist: {
        Args: { _field: string; _report_id: string }
        Returns: undefined
      }
      log_data_export: { Args: never; Returns: undefined }
      log_export: {
        Args: {
          p_azubi: string
          p_count: number
          p_from: string
          p_kind: string
          p_to: string
        }
        Returns: undefined
      }
      log_instruction_export: {
        Args: { p_azubi: string; p_count: number; p_from: string; p_to: string }
        Returns: undefined
      }
      missing_weeks: {
        Args: { p_azubi?: string }
        Returns: {
          azubi_id: string
          days_missing: number
          days_overdue: number
          week_end: string
          week_start: string
        }[]
      }
      notification_group: { Args: { _type: string }; Returns: string }
      notification_recipients: {
        Args: { _azubi: string }
        Returns: {
          deputy_for: string
          user_id: string
        }[]
      }
      plan_visible: { Args: { p_plan: string }; Returns: boolean }
      preview_link_code: {
        Args: { p_code: string }
        Returns: {
          access: string
          allowed: boolean
          azubi_name: string
          expires_at: string
        }[]
      }
      push_quiet_until: {
        Args: { _at?: string; _uid: string }
        Returns: string
      }
      redeem_invite_code: {
        Args: { _code: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      redeem_link_code: {
        Args: { p_code: string }
        Returns: {
          access: string
          azubi_id: string
          azubi_name: string
        }[]
      }
      register_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_label: string
          p_p256dh: string
        }
        Returns: string
      }
      reject_account_deletion: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      reject_experience: {
        Args: { p_expected_version: number; p_id: string; p_note: string }
        Returns: undefined
      }
      reject_instruction: {
        Args: { p_expected_version: number; p_id: string; p_note: string }
        Returns: undefined
      }
      reject_report: {
        Args: { _expected_version: number; _note: string; _report_id: string }
        Returns: undefined
      }
      remove_link: {
        Args: { p_azubi: string; p_member: string }
        Returns: undefined
      }
      remove_push_device: { Args: { p_id: string }; Returns: undefined }
      remove_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      reopen_experience: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      reopen_instruction: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      reopen_report: {
        Args: { _reason: string; _report_id: string }
        Returns: undefined
      }
      report_canonical: { Args: { _report_id: string }; Returns: string }
      report_hash: { Args: { _report_id: string }; Returns: string }
      report_title: { Args: { _report_id: string }; Returns: string }
      request_account_deletion: { Args: { p_note: string }; Returns: string }
      resolve_instruction_catalogs: {
        Args: { p_azubi: string }
        Returns: {
          code: string
          id: string
          profession_id: string
          sort_order: number
          source: string
          subtitle: string
          title: string
        }[]
      }
      resolve_plan: { Args: { p_azubi: string }; Returns: string }
      review_absence: {
        Args: {
          _absence_id: string
          _decision: Database["public"]["Enums"]["absence_status"]
          _note?: string
        }
        Returns: undefined
      }
      review_queue: {
        Args: { _statuses?: Database["public"]["Enums"]["report_status"][] }
        Returns: {
          azubi_id: string
          deputy_for: string
          report_id: string
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string
        }[]
      }
      revoke_consent: {
        Args: { _kind: Database["public"]["Enums"]["consent_kind"] }
        Returns: undefined
      }
      revoke_deputy: { Args: { _id: string }; Returns: undefined }
      revoke_invite_code: { Args: { _code: string }; Returns: undefined }
      revoke_link_code: { Args: { p_id: string }; Returns: undefined }
      save_my_notification_prefs: {
        Args: {
          p_groups: Json
          p_nudge_enabled: boolean
          p_nudge_time: string
          p_quiet_enabled: boolean
          p_quiet_from: string
          p_quiet_to: string
        }
        Returns: undefined
      }
      save_reminder_rules: { Args: { p_rules: Json }; Returns: undefined }
      send_report_reminder: {
        Args: { azubi_id: string; message: string; period_label: string }
        Returns: string
      }
      set_azubi_plan: {
        Args: { p_azubi: string; p_plan: string }
        Returns: undefined
      }
      set_deputy: {
        Args: {
          _date_from: string
          _date_to: string
          _deputy: string
          _note?: string
          _principal: string
          _reason: string
        }
        Returns: string
      }
      set_deputy_self_service: {
        Args: { _enabled: boolean }
        Returns: undefined
      }
      set_my_profession: {
        Args: { _profession_id: string }
        Returns: undefined
      }
      set_my_training: {
        Args: {
          p_company: string
          p_new_company_address?: string
          p_new_company_name?: string
          p_profession: string
        }
        Returns: undefined
      }
      submit_experience: {
        Args: {
          p_client_signed_at?: string
          p_expected_version: number
          p_id: string
          p_image_path?: string
          p_method: string
        }
        Returns: undefined
      }
      submit_instruction: {
        Args: { p_expected_version: number; p_id: string }
        Returns: undefined
      }
      submit_report: {
        Args: {
          _client_signed_at?: string
          _expected_version: number
          _image_path?: string
          _method: string
          _report_id: string
        }
        Returns: undefined
      }
      team_experience_overview: {
        Args: { p_azubi?: string }
        Returns: {
          approved: number
          azubi_id: string
          bundesland: string
          is_current: boolean
          profession_code: string
          required: number
          requirement_id: string
          submitted: number
          year_end: string
          year_no: number
          year_start: string
        }[]
      }
      team_week_overview: {
        Args: { week_start: string }
        Returns: {
          approved_total: number
          azubi_id: string
          can_review: boolean
          to_review: number
          week_status: string
        }[]
      }
      training_year_bounds: {
        Args: { n: number; p_end: string; p_start: string }
        Returns: {
          year_end: string
          year_start: string
        }[]
      }
      training_year_clamped: {
        Args: { p_date: string; p_end: string; p_start: string }
        Returns: number
      }
      training_year_count: {
        Args: { p_end: string; p_start: string }
        Returns: number
      }
      verify_audit_chain: {
        Args: { p_chain?: string }
        Returns: {
          chain_key: string
          entries: number
          first_bad_id: number
          ok: boolean
        }[]
      }
      verify_experience: {
        Args: { p_id: string }
        Returns: {
          computed_hash: string
          experience_id: string
          hash_ok: boolean
          signatures_ok: boolean
          stored_hash: string
          version: number
        }[]
      }
      verify_report: {
        Args: { p_report: string }
        Returns: {
          computed_hash: string
          hash_ok: boolean
          report_id: string
          signatures_ok: boolean
          stored_hash: string
          version: number
        }[]
      }
      week_deadline_at: {
        Args: { rules: Json; week_end: string }
        Returns: string
      }
      withdraw_account_deletion: { Args: { p_id: string }; Returns: undefined }
      write_audit: {
        Args: {
          _action: string
          _azubi_id?: string
          _details?: Json
          _entity_id: string
          _entity_type: string
        }
        Returns: number
      }
    }
    Enums: {
      absence_status: "pending" | "approved" | "rejected"
      absence_type: "urlaub" | "krank" | "berufsschule" | "sonstiges"
      app_role:
        | "azubi"
        | "ausbilder"
        | "betriebsleiter"
        | "ausbildungsberater"
        | "lehrer"
        | "ausbildungsleitung"
      consent_kind: "dictation" | "ai_text"
      grade_kind: "klausur" | "muendlich" | "test" | "sonstige"
      report_status: "draft" | "submitted" | "approved" | "rejected"
      report_type: "daily" | "weekly"
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
      absence_status: ["pending", "approved", "rejected"],
      absence_type: ["urlaub", "krank", "berufsschule", "sonstiges"],
      app_role: [
        "azubi",
        "ausbilder",
        "betriebsleiter",
        "ausbildungsberater",
        "lehrer",
        "ausbildungsleitung",
      ],
      consent_kind: ["dictation", "ai_text"],
      grade_kind: ["klausur", "muendlich", "test", "sonstige"],
      report_status: ["draft", "submitted", "approved", "rejected"],
      report_type: ["daily", "weekly"],
    },
  },
} as const
