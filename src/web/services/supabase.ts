import { createClient } from '@supabase/supabase-js'

// Try environment variables first, fallback to hardcoded values for now
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://reizphewyhtrezuxzwuf.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlaXpwaGV3eWh0cmV6dXh6d3VmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MDk4NzEsImV4cCI6MjA1NjI4NTg3MX0.Ncl5y5N9Z_IDAnoa1H2ORMyPI5XdP7IZ3Qbrj_9XHVg'

console.log('Supabase environment check:', {
  urlFromEnv: !!import.meta.env.VITE_SUPABASE_URL,
  keyFromEnv: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
  finalUrl: supabaseUrl
})

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database table types
export interface Task {
  id: string
  title: string
  description?: string
  status: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  column_name: 'todo' | 'in_progress' | 'done'
  assigned_to?: string
  agent_id?: string
  agent_status: string
  agent_response?: string
  error_message?: string
  logs?: any[]
  created_at: string
  updated_at: string
  assigned_at?: string
  updated_by?: string

  // Enhanced fields
  model_permission_level: 'standard' | 'elevated' | 'restricted'
  model_access_requirements: object
  task_type: string
  complexity_level: 'low' | 'medium' | 'high' | 'critical'
  estimated_hours?: number
  actual_hours?: number
  tags: string[]
  dependencies: string[]
  subtask_ids: string[]
  parent_task_id?: string
  milestone_id?: string
  project_phase?: string
  task_group?: string
  review_status: string
  quality_score?: number
  retry_count: number
  max_retries: number
  timeout_minutes: number
  requires_human_review: boolean
  auto_approve: boolean
  scheduled_at?: string
  started_at?: string
  completed_at?: string
  last_activity_at?: string
  completion_percentage: number
  environment: string
  version_control?: string
  test_coverage?: number
  security_level: 'standard' | 'high' | 'critical'
  data_sensitivity: 'public' | 'internal' | 'confidential' | 'restricted'
  compliance_requirements: string[]
  notification_preferences: object
  custom_fields: object
  integration_links: object
  external_references: string[]
  approval_chain: string[]
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  business_impact: 'low' | 'medium' | 'high' | 'critical'
  cost_estimate?: number
  actual_cost?: number
  resource_allocation: object
  performance_metrics: object
  user_stories: string[]
  acceptance_criteria: string[]
  definition_of_done: object
  task_template_id?: string
  recurring_task_config?: object
  archived: boolean
  archived_at?: string
  archived_reason?: string
  created_by?: string
  modified_by?: string
  assigned_by?: string
  reviewed_by?: string
  approved_by?: string
  rejected_by?: string
  rejection_reason?: string

  // Additional fields
  working_directory?: string
  agent_conversation_id?: string
  system_prompt?: string
}

export type Database = {
  public: {
    Tables: {
      tasks: {
        Row: Task
        Insert: Omit<Task, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Task>
      }
    }
  }
}