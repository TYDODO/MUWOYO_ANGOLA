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
      ai_documents: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          source: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          source?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          source?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          description: string | null
          id: string
          scheduled_at: string | null
          service: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          description?: string | null
          id?: string
          scheduled_at?: string | null
          service?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          description?: string | null
          id?: string
          scheduled_at?: string | null
          service?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blocked_contacts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          phone_number: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          phone_number: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          phone_number?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
<<<<<<< HEAD
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          instance_name: string | null
          message_text: string
          name: string
          scheduled_at: string | null
          status: string
          updated_at: string
          user_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          instance_name?: string | null
          message_text: string
          name: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          instance_name?: string | null
          message_text?: string
          name?: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: []
      }
      audio_voice_models: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          model_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          model_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          model_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audio_voice_generations: {
        Row: {
          created_at: string
          duration_seconds: number | null
          generation_number: number
          id: string
          status: string
          storage_path: string | null
          text_input: string
          user_id: string
          voice_model_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          generation_number: number
          id?: string
          status?: string
          storage_path?: string | null
          text_input: string
          user_id: string
          voice_model_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          generation_number?: number
          id?: string
          status?: string
          storage_path?: string | null
          text_input?: string
          user_id?: string
          voice_model_id?: string
        }
        Relationships: []
      }
      audio_topup_requests: {
        Row: {
          amount_kz: number
          id: string
          minutes: number
          payment_id: string
          payment_method_id: string | null
          proof_path: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          amount_kz: number
          id?: string
          minutes: number
          payment_id: string
          payment_method_id?: string | null
          proof_path: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          amount_kz?: number
          id?: string
          minutes?: number
          payment_id?: string
          payment_method_id?: string | null
          proof_path?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: []
      }
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_conversations: {
        Row: {
          assigned_to: string | null
          contact_id: string
          created_at: string
          id: string
          instance_name: string
          last_message_at: string | null
          last_message_direction: string | null
          last_message_kind: string | null
          last_message_preview: string | null
          last_read_at: string | null
          last_read_message_id: string | null
          response_mode: string
          status: string
          unread_count: number
          user_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id: string
          created_at?: string
          id?: string
          instance_name: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_kind?: string | null
          last_message_preview?: string | null
          last_read_at?: string | null
          last_read_message_id?: string | null
          response_mode?: string
          status?: string
          unread_count?: number
          user_id: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          instance_name?: string
          last_message_at?: string | null
          last_message_direction?: string | null
          last_message_kind?: string | null
          last_message_preview?: string | null
          last_read_at?: string | null
          last_read_message_id?: string | null
          response_mode?: string
          status?: string
          unread_count?: number
          user_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: []
      }
<<<<<<< HEAD
      follow_up_jobs: {
        Row: {
          attempts: number
          contact_id: string
          conversation_id: string | null
          created_at: string
          due_at: string
          id: string
          instance_name: string | null
          last_message_at: string | null
          rule_id: string
          status: string
          user_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          attempts?: number
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          due_at: string
          id?: string
          instance_name?: string | null
          last_message_at?: string | null
          rule_id: string
          status?: string
          user_id: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          attempts?: number
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          due_at?: string
          id?: string
          instance_name?: string | null
          last_message_at?: string | null
          rule_id?: string
          status?: string
          user_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: []
      }
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
      instances: {
        Row: {
          automation_paused: boolean
          automation_paused_until: string | null
          connection_state: string | null
          created_at: string
          evolution_state: string | null
          id: string
          instance_name: string
          last_connected_at: string | null
          phone: string | null
          phone_number: string | null
          qr_code: string | null
          status: Database["public"]["Enums"]["instance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          automation_paused?: boolean
          automation_paused_until?: string | null
          connection_state?: string | null
          created_at?: string
          evolution_state?: string | null
          id?: string
          instance_name: string
          last_connected_at?: string | null
          phone?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: Database["public"]["Enums"]["instance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          automation_paused?: boolean
          automation_paused_until?: string | null
          connection_state?: string | null
          created_at?: string
          evolution_state?: string | null
          id?: string
          instance_name?: string
          last_connected_at?: string | null
          phone?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: Database["public"]["Enums"]["instance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      message_queue: {
        Row: {
          attempts: number
          created_at: string
          external_message_id: string | null
          id: string
          instance_name: string
          last_error: string | null
          payload: Json
          remote_jid: string
          scheduled_for: string
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          external_message_id?: string | null
          id?: string
          instance_name: string
          last_error?: string | null
          payload: Json
          remote_jid: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          external_message_id?: string | null
          id?: string
          instance_name?: string
          last_error?: string | null
          payload?: Json
          remote_jid?: string
          scheduled_for?: string
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          ai_responded: boolean
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          media_url: string | null
          message_text: string | null
          phone_number: string
          user_id: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          ai_responded?: boolean
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          media_url?: string | null
          message_text?: string | null
          phone_number: string
          user_id: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          ai_responded?: boolean
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          media_url?: string | null
          message_text?: string | null
          phone_number?: string
          user_id?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
<<<<<<< HEAD
      payment_methods: {
        Row: {
          account_holder_name: string | null
          bank_name: string | null
          entity_name: string | null
          entity_number: string | null
          iban: string | null
          id: string
          is_active: boolean
          label: string
          method_type: string
          phone_number: string | null
          updated_at: string
          updated_by: string | null
          instructions: string | null
        }
        Insert: {
          account_holder_name?: string | null
          bank_name?: string | null
          entity_name?: string | null
          entity_number?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          label: string
          method_type: string
          phone_number?: string | null
          updated_at?: string
          updated_by?: string | null
          instructions?: string | null
        }
        Update: {
          account_holder_name?: string | null
          bank_name?: string | null
          entity_name?: string | null
          entity_number?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          label?: string
          method_type?: string
          phone_number?: string | null
          updated_at?: string
          updated_by?: string | null
          instructions?: string | null
        }
        Relationships: []
      }
      product_images: {
        Row: {
          color: string | null
          created_at: string
          id: string
          media_type: string
          position: number
          product_id: string
          size: string | null
          url: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          media_type?: string
          position?: number
          product_id: string
          size?: string | null
          url: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          media_type?: string
          position?: number
          product_id?: string
          size?: string | null
=======
      product_images: {
        Row: {
          created_at: string
          id: string
          position: number
          product_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          product_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          product_id?: string
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          product_id: string
          rating: number
          reviewer_name: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id: string
          rating: number
          reviewer_name?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          reviewer_name?: string | null
        }
        Relationships: []
      }
      social_proofs: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          media_url: string | null
          product_id: string | null
          proof_type: "product" | "service"
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          media_url?: string | null
          product_id?: string | null
          proof_type: "product" | "service"
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          media_url?: string | null
          product_id?: string | null
          proof_type?: "product" | "service"
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_proofs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          category_ids: string[] | null
          created_at: string
          description: string | null
          discount_price: number | null
          id: string
          image_url: string | null
          is_active: boolean
          is_sold_out: boolean
          name: string
          price: number
          rating_avg: number
          rating_count: number
          stock: number
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          category_ids?: string[] | null
          created_at?: string
          description?: string | null
          discount_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_sold_out?: boolean
          name: string
          price?: number
          rating_avg?: number
          rating_count?: number
          stock?: number
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          category_ids?: string[] | null
          created_at?: string
          description?: string | null
          discount_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_sold_out?: boolean
          name?: string
          price?: number
          rating_avg?: number
          rating_count?: number
          stock?: number
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
<<<<<<< HEAD
          accepts_appointments: boolean
          account_status: string
          ai_personality: string | null
=======
          account_status: string
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          email_verified: boolean
          activated_at: string | null
          activated_by: string | null
          ai_name: string | null
          ai_rules: string | null
          avatar_url: string | null
          business_description: string | null
          transfer_phone: string | null
          business_hours: Json | null
          business_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          free_messages_granted: boolean
          full_name: string | null
          id: string
          is_suspended: boolean
<<<<<<< HEAD
          appointment_duration_minutes: number
          audio_enabled: boolean
          message_limit: number
          messages_received: number
          plan_audio_period_ends_at: string | null
          plan_audio_seconds_total: number
          plan_audio_seconds_used: number
          onboarding_completed: boolean
          phone: string | null
          plan_id: string | null
          province: string | null
=======
          message_limit: number
          messages_received: number
          onboarding_completed: boolean
          phone: string | null
          transfer_phone?: string | null
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          status: string
          setup_paid_at: string | null
          setup_payment_id: string | null
          trial_expires_at: string | null
          trial_started_at: string | null
<<<<<<< HEAD
          subscription_expires_at: string | null
          topup_audio_seconds_balance: number
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          updated_at: string
          user_id: string
        }
        Insert: {
<<<<<<< HEAD
          accepts_appointments?: boolean
          account_status?: string
          ai_personality?: string | null
=======
          account_status?: string
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          email_verified?: boolean
          activated_at?: string | null
          activated_by?: string | null
          ai_name?: string | null
          ai_rules?: string | null
          avatar_url?: string | null
          business_description?: string | null
          business_hours?: Json | null
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          free_messages_granted?: boolean
          full_name?: string | null
          id?: string
          is_suspended?: boolean
<<<<<<< HEAD
          appointment_duration_minutes?: number
          audio_enabled?: boolean
          message_limit?: number
          messages_received?: number
          plan_audio_period_ends_at?: string | null
          plan_audio_seconds_total?: number
          plan_audio_seconds_used?: number
          onboarding_completed?: boolean
          phone?: string | null
          plan_id?: string | null
          province?: string | null
=======
          message_limit?: number
          messages_received?: number
          onboarding_completed?: boolean
          phone?: string | null
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          transfer_phone?: string | null
          status?: string
          setup_paid_at?: string | null
          setup_payment_id?: string | null
          trial_expires_at?: string | null
          trial_started_at?: string | null
<<<<<<< HEAD
          subscription_expires_at?: string | null
          topup_audio_seconds_balance?: number
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          updated_at?: string
          user_id: string
        }
        Update: {
<<<<<<< HEAD
          accepts_appointments?: boolean
          account_status?: string
          ai_personality?: string | null
=======
          account_status?: string
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          email_verified?: boolean
          activated_at?: string | null
          activated_by?: string | null
          ai_name?: string | null
          ai_rules?: string | null
          avatar_url?: string | null
          business_description?: string | null
          business_hours?: Json | null
          business_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          free_messages_granted?: boolean
          full_name?: string | null
          id?: string
          is_suspended?: boolean
<<<<<<< HEAD
          appointment_duration_minutes?: number
          audio_enabled?: boolean
          message_limit?: number
          messages_received?: number
          plan_audio_period_ends_at?: string | null
          plan_audio_seconds_total?: number
          plan_audio_seconds_used?: number
          onboarding_completed?: boolean
          phone?: string | null
          plan_id?: string | null
          province?: string | null
=======
          message_limit?: number
          messages_received?: number
          onboarding_completed?: boolean
          phone?: string | null
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          transfer_phone?: string | null
          status?: string
          setup_paid_at?: string | null
          setup_payment_id?: string | null
          trial_expires_at?: string | null
          trial_started_at?: string | null
<<<<<<< HEAD
          subscription_expires_at?: string | null
          topup_audio_seconds_balance?: number
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
<<<<<<< HEAD
      plan_subscriptions: {
        Row: {
          amount_kz: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          payment_id: string
          payment_method_id: string | null
          payment_reference: string | null
          proof_path: string | null
          proof_url: string | null
          purchase_months: number
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          starts_at: string | null
          status: string
          submitted_at: string
          user_id: string
          plan_id: string
        }
        Insert: {
          amount_kz?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_id: string
          payment_method_id?: string | null
          payment_reference?: string | null
          proof_path?: string | null
          proof_url?: string | null
          purchase_months?: number
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          starts_at?: string | null
          status?: string
          submitted_at?: string
          user_id: string
          plan_id: string
        }
        Update: {
          amount_kz?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_id?: string
          payment_method_id?: string | null
          payment_reference?: string | null
          proof_path?: string | null
          proof_url?: string | null
          purchase_months?: number
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          starts_at?: string | null
          status?: string
          submitted_at?: string
          user_id?: string
          plan_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          audio_unlimited: boolean
          created_at: string
          features: Json
          id: string
          is_active: boolean
          max_cloned_voices: number
          monthly_messages: number
          monthly_audio_seconds: number
          name: string
          position: number
          price_kz: number
          updated_at: string
        }
        Insert: {
          audio_unlimited?: boolean
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          max_cloned_voices?: number
          monthly_messages: number
          monthly_audio_seconds?: number
          name: string
          position?: number
          price_kz: number
          updated_at?: string
        }
        Update: {
          audio_unlimited?: boolean
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          max_cloned_voices?: number
          monthly_messages?: number
          monthly_audio_seconds?: number
          name?: string
          position?: number
          price_kz?: number
          updated_at?: string
        }
        Relationships: []
      }
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
      credit_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          credit_type: string
          id: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          credit_type: string
          id?: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          credit_type?: string
          id?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      store_carousel_slides: {
        Row: {
          bg_color: string | null
          created_at: string
          id: string
          image_url: string | null
          link_url: string | null
          position: number
          store_id: string
          subtitle: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          bg_color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          link_url?: string | null
          position?: number
          store_id: string
          subtitle?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          bg_color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          link_url?: string | null
          position?: number
          store_id?: string
          subtitle?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      store_orders: {
        Row: {
          created_at: string
          customer_location: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address: string | null
          delivery_distance_km: number | null
          delivery_fee: number
          delivery_status: string
          discount: number
          id: string
          items: Json
          notes: string | null
          order_number: string
          payment_status: string | null
          subtotal: number
          status: string
          total: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_location?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_status?: string
          discount?: number
          id?: string
          items?: Json
          notes?: string | null
          order_number?: string
          payment_status?: string | null
          subtotal?: number
          status?: string
          total?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_location?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_status?: string
          discount?: number
          id?: string
          items?: Json
          notes?: string | null
          order_number?: string
          payment_status?: string | null
          subtotal?: number
          status?: string
          total?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_people: {
        Row: {
          avatar_url: string | null
          business_id: string
          created_at: string
          email: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          business_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          business_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_order_assignments: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_by: string | null
          delivery_person_id: string
          id: string
          is_primary: boolean
          order_id: string
          unassigned_at: string | null
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          delivery_person_id: string
          id?: string
          is_primary?: boolean
          order_id: string
          unassigned_at?: string | null
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_by?: string | null
          delivery_person_id?: string
          id?: string
          is_primary?: boolean
          order_id?: string
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_order_assignments_delivery_person_id_fkey"
            columns: ["delivery_person_id"]
            isOneToOne: false
            referencedRelation: "delivery_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_order_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_fee_settings: {
        Row: {
          business_id: string
          default_fee: number
          distance_rules: Json
          fee_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_id: string
          default_fee?: number
          distance_rules?: Json
          fee_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_id?: string
          default_fee?: number
          distance_rules?: Json
          fee_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      delivery_order_status_history: {
        Row: {
          actor_user_id: string | null
          business_id: string
          created_at: string
          delivery_status: string
          id: string
          notes: string | null
          order_id: string
        }
        Insert: {
          actor_user_id?: string | null
          business_id: string
          created_at?: string
          delivery_status: string
          id?: string
          notes?: string | null
          order_id: string
        }
        Update: {
          actor_user_id?: string | null
          business_id?: string
          created_at?: string
          delivery_status?: string
          id?: string
          notes?: string | null
          order_id?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          checkout_whatsapp: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          header_color: string | null
<<<<<<< HEAD
          hide_store_name: boolean
          id: string
          is_active: boolean
          logo_url: string | null
          logo_size: number
=======
          id: string
          is_active: boolean
          logo_url: string | null
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          name: string
          slug: string
          theme_color: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checkout_whatsapp?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          header_color?: string | null
<<<<<<< HEAD
          hide_store_name?: boolean
          id?: string
          is_active?: boolean
          logo_url?: string | null
          logo_size?: number
=======
          id?: string
          is_active?: boolean
          logo_url?: string | null
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          name: string
          slug: string
          theme_color?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checkout_whatsapp?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          header_color?: string | null
<<<<<<< HEAD
          hide_store_name?: boolean
          id?: string
          is_active?: boolean
          logo_url?: string | null
          logo_size?: number
=======
          id?: string
          is_active?: boolean
          logo_url?: string | null
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          name?: string
          slug?: string
          theme_color?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      top_up_packages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          messages: number
          name: string
          position: number
          price_kz: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          messages: number
          name: string
          position?: number
          price_kz: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          messages?: number
          name?: string
          position?: number
          price_kz?: number
        }
        Relationships: []
      }
      top_up_requests: {
        Row: {
          amount_kz: number
          approved_at: string | null
          approved_by: string | null
          confirmed_at: string | null
          created_at: string
          id: string
          messages: number
          package_id: string | null
          payment_reference: string | null
          request_type: string
          status: string
          user_id: string
        }
        Insert: {
          amount_kz: number
          approved_at?: string | null
          approved_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          messages: number
          package_id?: string | null
          payment_reference?: string | null
          request_type?: string
          status?: string
          user_id: string
        }
        Update: {
          amount_kz?: number
          approved_at?: string | null
          approved_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          id?: string
          messages?: number
          package_id?: string | null
          payment_reference?: string | null
          request_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "top_up_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "top_up_packages"
            referencedColumns: ["id"]
          },
        ]
      }
<<<<<<< HEAD
      welcome_message_configs: {
        Row: {
          audio_mimetype: string | null
          audio_url: string | null
          created_at: string
          enabled: boolean
          id: string
          image_mimetype: string | null
          image_url: string | null
          instance_id: string
          text_message: string | null
          send_order: string[]
          updated_at: string
          user_id: string
          video_mimetype: string | null
          video_url: string | null
        }
        Insert: {
          audio_mimetype?: string | null
          audio_url?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          image_mimetype?: string | null
          image_url?: string | null
          instance_id: string
          text_message?: string | null
          send_order?: string[]
          updated_at?: string
          user_id: string
          video_mimetype?: string | null
          video_url?: string | null
        }
        Update: {
          audio_mimetype?: string | null
          audio_url?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          image_mimetype?: string | null
          image_url?: string | null
          instance_id?: string
          text_message?: string | null
          send_order?: string[]
          updated_at?: string
          user_id?: string
          video_mimetype?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "welcome_message_configs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_message_history: {
        Row: {
          created_at: string
          delivery_result: Json
          delivery_status: string
          id: string
          instance_id: string
          remote_jid: string
          sent_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delivery_result?: Json
          delivery_status?: string
          id?: string
          instance_id: string
          remote_jid: string
          sent_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delivery_result?: Json
          delivery_status?: string
          id?: string
          instance_id?: string
          remote_jid?: string
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welcome_message_history_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
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
          role?: Database["public"]["Enums"]["app_role"]
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
      whatsapp_contacts: {
        Row: {
          created_at: string
          crm_viewed_at: string | null
          id: string
<<<<<<< HEAD
          is_group: boolean
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          instance_name: string | null
          last_message_at: string | null
          name: string | null
          phone_number: string
          should_respond: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          crm_viewed_at?: string | null
          id?: string
<<<<<<< HEAD
          is_group?: boolean
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          instance_name?: string | null
          last_message_at?: string | null
          name?: string | null
          phone_number: string
          should_respond?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          crm_viewed_at?: string | null
          id?: string
<<<<<<< HEAD
          is_group?: boolean
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
          instance_name?: string | null
          last_message_at?: string | null
          name?: string | null
          phone_number?: string
          should_respond?: boolean
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
<<<<<<< HEAD
      admin_update_audio_account: {
        Args: {
          p_audio_enabled: boolean
          p_plan_seconds_total: number
          p_plan_seconds_used: number
          p_topup_seconds_balance: number
          p_user_id: string
        }
        Returns: Json
      }
      admin_extend_user_plan: {
        Args: { p_months: number; p_user_id: string }
        Returns: Json
      }
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
      get_business_plan_name: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
<<<<<<< HEAD
      get_audio_balance: {
        Args: { p_user_id?: string }
        Returns: Json
      }
      create_audio_topup_request: {
        Args: {
          p_minutes: number
          p_payment_id: string
          p_payment_method_id: string | null
          p_proof_path: string
        }
        Returns: string
      }
      review_audio_topup_request: {
        Args: { p_approve: boolean; p_reason?: string | null; p_request_id: string }
        Returns: Json
      }
=======
>>>>>>> 5d5280f0f4276c5f70aa07cbccc56e7ed9a56b0e
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      assign_delivery_people: {
        Args: {
          p_delivery_person_ids: string[]
          p_order_id: string
          p_primary_delivery_person_id?: string | null
        }
        Returns: undefined
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      update_delivery_order_status: {
        Args: { p_notes?: string | null; p_order_id: string; p_status: string }
        Returns: undefined
      }
      match_ai_documents: {
        Args: { _limit?: number; _query: string; _user_id: string }
        Returns: {
          content: string
          id: string
          similarity: number
          title: string
        }[]
      }
      match_social_proofs: {
        Args: { _context: string; _limit?: number; _product_id?: string; _query: string; _user_id: string }
        Returns: {
          description: string
          id: string
          media_url: string | null
          product_id: string | null
          proof_type: "product" | "service"
          relevance: number
          title: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "sub_admin" | "client" | "attendant" | "delivery_person"
      instance_status: "pending" | "connecting" | "connected" | "disconnected"
      message_direction: "inbound" | "outbound"
      message_kind:
        | "text"
        | "audio"
        | "image"
        | "video"
        | "document"
        | "sticker"
        | "location"
        | "contact"
        | "other"
      queue_status: "pending" | "processing" | "sent" | "failed" | "delivered"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "sub_admin", "client", "attendant", "delivery_person"],
      instance_status: ["pending", "connecting", "connected", "disconnected"],
      message_direction: ["inbound", "outbound"],
      message_kind: [
        "text",
        "audio",
        "image",
        "video",
        "document",
        "sticker",
        "location",
        "contact",
        "other",
      ],
      queue_status: ["pending", "processing", "sent", "failed", "delivered"],
    },
  },
} as const
