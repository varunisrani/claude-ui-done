import { supabase, Task } from './supabase'
import { v4 as uuidv4 } from 'uuid'

export class KanbanTasksService {
  // Real-time subscription
  private subscription: any = null

  // Fetch all tasks
  async getTasks(): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('archived', false)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching tasks:', error)
        throw error
      }

      return data || []
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
      throw error
    }
  }

  // Get tasks by column
  async getTasksByColumn(columnName: 'todo' | 'in_progress' | 'done'): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('column_name', columnName)
        .eq('archived', false)
        .order('created_at', { ascending: false })

      if (error) {
        console.error(`Error fetching ${columnName} tasks:`, error)
        throw error
      }

      return data || []
    } catch (error) {
      console.error(`Failed to fetch ${columnName} tasks:`, error)
      throw error
    }
  }

  // Create a new task
  async createTask(taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    try {
      // Filter out any fields that don't exist in the database schema
      const allowedFields = [
        'title', 'description', 'status', 'priority', 'assigned_to', 'agent_id',
        'agent_status', 'agent_response', 'error_message', 'logs', 'priority',
        'working_directory', 'column_name', 'agent_conversation_id', 'assigned_at',
        'updated_by', 'model_permission_level', 'model_access_requirements',
        'task_type', 'complexity_level', 'estimated_hours', 'actual_hours',
        'tags', 'dependencies', 'subtask_ids', 'parent_task_id', 'milestone_id',
        'project_phase', 'task_group', 'review_status', 'quality_score',
        'retry_count', 'max_retries', 'timeout_minutes', 'requires_human_review',
        'auto_approve', 'scheduled_at', 'started_at', 'completed_at',
        'last_activity_at', 'completion_percentage', 'environment', 'version_control',
        'test_coverage', 'security_level', 'data_sensitivity', 'compliance_requirements',
        'notification_preferences', 'custom_fields', 'integration_links',
        'external_references', 'approval_chain', 'risk_level', 'business_impact',
        'cost_estimate', 'actual_cost', 'resource_allocation', 'performance_metrics',
        'user_stories', 'acceptance_criteria', 'definition_of_done', 'task_template_id',
        'recurring_task_config', 'archived', 'archived_at', 'archived_reason',
        'created_by', 'modified_by', 'assigned_by', 'reviewed_by', 'approved_by',
        'rejected_by', 'rejection_reason'
      ];

      // Filter taskData to only include allowed fields
      const filteredTaskData: any = {};
      allowedFields.forEach(field => {
        if (taskData[field as keyof Task] !== undefined) {
          filteredTaskData[field] = taskData[field as keyof Task];
        }
      });

      // Set default values for required fields
      const newTask = {
        id: uuidv4(), // Generate a UUID for the new task
        ...filteredTaskData,
        status: filteredTaskData.status || 'todo',
        agent_status: filteredTaskData.agent_status || 'idle',
        model_permission_level: filteredTaskData.model_permission_level || 'standard',
        task_type: filteredTaskData.task_type || 'general',
        complexity_level: filteredTaskData.complexity_level || 'medium',
        retry_count: filteredTaskData.retry_count || 0,
        max_retries: filteredTaskData.max_retries || 3,
        timeout_minutes: filteredTaskData.timeout_minutes || 60,
        completion_percentage: filteredTaskData.completion_percentage || 0,
        environment: filteredTaskData.environment || 'development',
        archived: filteredTaskData.archived || false,
        tags: filteredTaskData.tags || [],
        dependencies: filteredTaskData.dependencies || [],
        subtask_ids: filteredTaskData.subtask_ids || [],
        compliance_requirements: filteredTaskData.compliance_requirements || [],
        notification_preferences: filteredTaskData.notification_preferences || { email: true, slack: false },
        custom_fields: filteredTaskData.custom_fields || {},
        integration_links: filteredTaskData.integration_links || {},
        external_references: filteredTaskData.external_references || [],
        approval_chain: filteredTaskData.approval_chain || [],
        resource_allocation: filteredTaskData.resource_allocation || {},
        performance_metrics: filteredTaskData.performance_metrics || {},
        user_stories: filteredTaskData.user_stories || [],
        acceptance_criteria: filteredTaskData.acceptance_criteria || [],
        definition_of_done: filteredTaskData.definition_of_done || {},
        model_access_requirements: filteredTaskData.model_access_requirements || {},
        logs: filteredTaskData.logs || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('tasks')
        .insert([newTask])
        .select()
        .single()

      if (error) {
        console.error('Error creating task:', error)
        throw error
      }

      return data
    } catch (error) {
      console.error('Failed to create task:', error)
      throw error
    }
  }

  // Update a task
  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    try {
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating task:', error)
        throw error
      }

      return data
    } catch (error) {
      console.error('Failed to update task:', error)
      throw error
    }
  }

  // Delete a task (soft delete - mark as archived)
  async deleteTask(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          archived: true,
          archived_at: new Date().toISOString(),
          archived_reason: 'User deleted',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      if (error) {
        console.error('Error deleting task:', error)
        throw error
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
      throw error
    }
  }

  // Move task between columns
  async moveTaskColumn(id: string, newColumn: 'todo' | 'in_progress' | 'done'): Promise<Task> {
    try {
      const updates: Partial<Task> = {
        column_name: newColumn,
        updated_at: new Date().toISOString()
      }

      // Update status based on column
      if (newColumn === 'done') {
        updates.status = 'completed'
        updates.completed_at = new Date().toISOString()
        updates.completion_percentage = 100
      } else if (newColumn === 'in_progress') {
        updates.status = 'in_progress'
        updates.started_at = updates.started_at || new Date().toISOString()
      } else {
        updates.status = 'todo'
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Error moving task:', error)
        throw error
      }

      return data
    } catch (error) {
      console.error('Failed to move task:', error)
      throw error
    }
  }

  // Get task statistics
  async getTaskStats() {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('archived', false)

      if (error) {
        console.error('Error fetching task stats:', error)
        throw error
      }

      const tasks = data || []
      const stats = {
        total: tasks.length,
        todo: tasks.filter(t => t.column_name === 'todo').length,
        inProgress: tasks.filter(t => t.column_name === 'in_progress').length,
        done: tasks.filter(t => t.column_name === 'done').length,
        critical: tasks.filter(t => t.priority === 'critical').length,
        high: tasks.filter(t => t.priority === 'high').length,
        needsReview: tasks.filter(t => t.requires_human_review).length,
        avgCompletion: tasks.reduce((acc, t) => acc + t.completion_percentage, 0) / (tasks.length || 1)
      }

      return stats
    } catch (error) {
      console.error('Failed to get task stats:', error)
      throw error
    }
  }

  // Subscribe to real-time updates
  subscribeToTasks(callback: (payload: any) => void) {
    try {
      this.subscription = supabase
        .channel('tasks')
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks',
            filter: 'archived=eq.false'
          },
          callback
        )
        .subscribe()

      return this.subscription
    } catch (error) {
      console.error('Failed to subscribe to tasks:', error)
      throw error
    }
  }

  // Unsubscribe from real-time updates
  unsubscribeFromTasks() {
    if (this.subscription) {
      supabase.removeChannel(this.subscription)
      this.subscription = null
    }
  }

  // Search tasks
  async searchTasks(query: string): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('archived', false)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%,tags.cs.{${query}}`)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error searching tasks:', error)
        throw error
      }

      return data || []
    } catch (error) {
      console.error('Failed to search tasks:', error)
      throw error
    }
  }

  // Get tasks by priority
  async getTasksByPriority(priority: 'low' | 'medium' | 'high' | 'critical'): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('priority', priority)
        .eq('archived', false)
        .order('created_at', { ascending: false })

      if (error) {
        console.error(`Error fetching ${priority} priority tasks:`, error)
        throw error
      }

      return data || []
    } catch (error) {
      console.error(`Failed to fetch ${priority} priority tasks:`, error)
      throw error
    }
  }

  // Get tasks assigned to specific agent/user
  async getTasksByAssignee(assignee: string): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', assignee)
        .eq('archived', false)
        .order('created_at', { ascending: false })

      if (error) {
        console.error(`Error fetching tasks for ${assignee}:`, error)
        throw error
      }

      return data || []
    } catch (error) {
      console.error(`Failed to fetch tasks for ${assignee}:`, error)
      throw error
    }
  }
}

// Export singleton instance
export const kanbanTasksService = new KanbanTasksService()