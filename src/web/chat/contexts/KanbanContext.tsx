/**
 * KanbanContext
 *
 * React Context for global Kanban state management.
 * Loads boards/tasks from localStorage on mount and syncs all changes.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { kanbanTasksService } from '../../services/kanbanTasks';
import { api } from '../services/api';
import type { Task } from '../../services/supabase';

/**
 * Deduplicate tasks array by ID, keeping the first occurrence of each task
 */
function deduplicateTasks(tasks: KanbanTask[]): KanbanTask[] {
  const seen = new Set<string>();
  return tasks.filter(task => {
    if (seen.has(task.id)) {
      console.warn('⚠️ [KanbanContext] Removing duplicate task:', task.id);
      return false;
    }
    seen.add(task.id);
    return true;
  });
}

interface KanbanContextValue {
  tasks: Task[];
  loading: boolean;
  error: string | null;

  // Task operations
  createTask: (request: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => Promise<Task>;
  assignTaskToAgent: (taskId: string) => Promise<string>; // Returns sessionId
  markTaskAsDone: (taskId: string) => Promise<void>;
  moveTask: (taskId: string, targetColumn: 'todo' | 'in_progress' | 'done') => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  refreshTasks: () => Promise<void>;
  getTaskStats: () => Promise<any>;

  // Background task operations
  getBackgroundTasks: () => Task[];
  monitorBackgroundTask: (sessionId: string) => Promise<void>;
  stopBackgroundMonitoring: (sessionId: string) => void;

  // Get tasks by column
  getTasksByColumn: (columnName: 'todo' | 'in_progress' | 'done') => Task[];

  // Search and filter
  searchTasks: (query: string) => Promise<Task[]>;
  getTasksByPriority: (priority: 'low' | 'medium' | 'high' | 'critical') => Promise<Task[]>;
}

const KanbanContext = createContext<KanbanContextValue | null>(null);

export function KanbanProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load tasks from Supabase on mount
  useEffect(() => {
    loadTasks();
    subscribeToRealtime();

    return () => {
      kanbanTasksService.unsubscribeFromTasks();
    };
  }, []);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const loadedTasks = await kanbanTasksService.getTasks();
      setTasks(loadedTasks);
    } catch (err: any) {
      setError(err.message || 'Failed to load tasks from Supabase');
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToRealtime = () => {
    kanbanTasksService.subscribeToTasks((payload) => {
      console.log('🔄 Real-time task update:', payload);
      loadTasks(); // Reload all tasks on any change
    });
  };

  // Create task
  const createTask = useCallback(async (request: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> => {
    try {
      const newTask = await kanbanTasksService.createTask(request);
      setTasks(prev => {
        // Ensure no duplicates by checking IDs
        const existingIds = new Set(prev.map(t => t.id));
        if (existingIds.has(newTask.id)) {
          console.warn('⚠️ [KanbanContext] Task ID already exists, skipping add:', newTask.id);
          return prev;
        }
        return [...prev, newTask];
      });
      return newTask;
    } catch (err: any) {
      console.error('Failed to create task:', err);
      throw err;
    }
  }, []);

  
  // Assign task to agent (uses existing conversation API)
  const assignTaskToAgent = useCallback(async (taskId: string): Promise<string> => {
    console.log('🎯 [KanbanContext] assignTaskToAgent called with task ID:', taskId);

    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      console.error('❌ [KanbanContext] Task not found for ID:', taskId);
      console.log('📋 [KanbanContext] Available tasks:', tasks.map(t => ({ id: t.id, title: t.title })));
      throw new Error('Task not found');
    }

    console.log('📋 [KanbanContext] Found task:', {
      id: task.id,
      title: task.title,
      description: task.description?.substring(0, 100) + '...',
      workingDirectory: task.working_directory,
      priority: task.priority,
      tags: task.tags
    });

    const conversationPayload = {
      workingDirectory: task.working_directory || process.cwd(),
      initialPrompt: `${task.title}\n\n${task.description}`,
    };

    try {
      console.log('🔄 [KanbanContext] Calling api.startConversation...');
      const startTime = Date.now();

      // Call existing conversation API to start agent
      const response = await api.startConversation(conversationPayload);

      const duration = Date.now() - startTime;
      console.log('⏱️ [KanbanContext] API call completed in', duration, 'ms');
      console.log('✅ [KanbanContext] API response received:', {
        sessionId: response.sessionId,
        streamingId: response.streamingId,
        status: response.status,
        hasSystemInit: !!response.systemInit
      });

      console.log('💾 [KanbanContext] Updating task in Supabase...');
      // Update task in Supabase with conversation details
      const updatedTask = await kanbanTasksService.updateTask(taskId, {
        agent_id: response.streamingId,
        agent_conversation_id: response.sessionId,
        agent_status: 'working',
        assigned_to: 'agent',
        assigned_at: new Date().toISOString(),
        column_name: 'in_progress',
        started_at: new Date().toISOString(),
        completion_percentage: 10,
      });

      console.log('🔄 [KanbanContext] Updating local state...');
      // Update state
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));

      console.log('🎉 [KanbanContext] Task assignment completed successfully!');
      console.log('🔑 [KanbanContext] Returning session ID:', response.sessionId);

      // Return sessionId for navigation
      return response.sessionId;
    } catch (err: any) {
      console.error('❌ [KanbanContext] Failed to assign task to agent:', err);
      console.error('🔍 [KanbanContext] Error details:', {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        stack: err?.stack
      });
      setError(err.message || 'Failed to assign task to agent');
      throw err;
    }
  }, [tasks]);

  // Mark task as done
  const markTaskAsDone = useCallback(async (taskId: string) => {
    console.log('🎯 [KanbanContext] markTaskAsDone called with task ID:', taskId);

    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      console.error('❌ [KanbanContext] Task not found for markTaskAsDone:', taskId);
      return;
    }

    console.log('📋 [KanbanContext] Marking task as done:', {
      id: task.id,
      title: task.title,
      currentColumn: task.column_name,
      currentAgentStatus: task.agent_status
    });

    try {
      // Update task in Supabase with done status
      const updatedTask = await kanbanTasksService.moveTaskColumn(taskId, 'done');

      // Update state
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));

      console.log('✅ [KanbanContext] Task marked as done successfully');
    } catch (err: any) {
      console.error('❌ [KanbanContext] Failed to mark task as done:', err);
      throw err;
    }
  }, [tasks]);

  // Move task
  const moveTask = useCallback(async (taskId: string, targetColumn: 'todo' | 'in_progress' | 'done') => {
    try {
      const updatedTask = await kanbanTasksService.moveTaskColumn(taskId, targetColumn);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err: any) {
      console.error('❌ [KanbanContext] Failed to move task:', err);
      throw err;
    }
  }, []);

  // Update task
  const updateTask = useCallback(async (taskId: string, updates: Partial<Task>) => {
    try {
      const updatedTask = await kanbanTasksService.updateTask(taskId, updates);
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
    } catch (err: any) {
      console.error('❌ [KanbanContext] Failed to update task:', err);
      throw err;
    }
  }, []);

  // Delete task
  const deleteTask = useCallback(async (taskId: string) => {
    try {
      await kanbanTasksService.deleteTask(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err: any) {
      console.error('❌ [KanbanContext] Failed to delete task:', err);
      throw err;
    }
  }, []);

  // Refresh tasks (reload from Supabase)
  const refreshTasks = useCallback(async () => {
    await loadTasks();
  }, []);

  // Get task statistics
  const getTaskStats = useCallback(async () => {
    try {
      return await kanbanTasksService.getTaskStats();
    } catch (err: any) {
      console.error('❌ [KanbanContext] Failed to get task stats:', err);
      throw err;
    }
  }, []);

  // Get tasks by column
  const getTasksByColumn = useCallback((columnName: 'todo' | 'in_progress' | 'done'): Task[] => {
    return tasks.filter(t => t.column_name === columnName);
  }, [tasks]);

  // Get background tasks (tasks with active agents that user isn't watching)
  const getBackgroundTasks = useCallback((): Task[] => {
    return tasks.filter(t =>
      t.agent_status === 'working' &&
      t.agent_id &&
      // Don't include tasks that are currently being viewed in chat
      !window.location.pathname.includes(`/c/${t.agent_id}`)
    );
  }, [tasks]);

  // Monitor a background task by checking its status periodically
  const monitorBackgroundTask = useCallback(async (sessionId: string): Promise<void> => {
    try {
      console.log('🔍 [KanbanContext] Starting background task monitoring for session:', sessionId);

      // Check conversation status via API
      const status = await api.getConversationStatus(sessionId);

      // Find the corresponding task
      const task = tasks.find(t => t.agent_id === sessionId);
      if (!task) {
        console.warn('⚠️ [KanbanContext] Task not found for session:', sessionId);
        return;
      }

      // Update task based on conversation status
      let updates: Partial<Task> = {};

      if (status.completed) {
        updates = {
          agent_status: 'success',
          column_name: 'done',
          completed_at: new Date().toISOString(),
          agent_response: 'Task completed successfully',
          completion_percentage: 100
        };
        console.log('✅ [KanbanContext] Background task completed:', task.title);
      } else if (status.error) {
        updates = {
          agent_status: 'error',
          error_message: `Error: ${status.error}`,
        };
        console.error('❌ [KanbanContext] Background task failed:', task.title, status.error);
      } else if (status.statusMessage) {
        updates = {
          agent_response: status.statusMessage,
          completion_percentage: status.progress || 0,
        };
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        await updateTask(task.id, updates);
      }
    } catch (error) {
      console.error('❌ [KanbanContext] Failed to monitor background task:', error);
    }
  }, [tasks, updateTask]);

  // Stop background monitoring for a session
  const stopBackgroundMonitoring = useCallback((sessionId: string) => {
    console.log('🛑 [KanbanContext] Stopping background monitoring for session:', sessionId);
    // In a real implementation, this might clear intervals or close SSE connections
    // For now, this is mainly for logging and cleanup
  }, []);

  // Search tasks
  const searchTasks = useCallback(async (query: string): Promise<Task[]> => {
    try {
      return await kanbanTasksService.searchTasks(query);
    } catch (err: any) {
      console.error('❌ [KanbanContext] Failed to search tasks:', err);
      throw err;
    }
  }, []);

  // Get tasks by priority
  const getTasksByPriority = useCallback(async (priority: 'low' | 'medium' | 'high' | 'critical'): Promise<Task[]> => {
    try {
      return await kanbanTasksService.getTasksByPriority(priority);
    } catch (err: any) {
      console.error('❌ [KanbanContext] Failed to get tasks by priority:', err);
      throw err;
    }
  }, []);

  const value: KanbanContextValue = {
    tasks,
    loading,
    error,
    createTask,
    assignTaskToAgent,
    markTaskAsDone,
    moveTask,
    updateTask,
    deleteTask,
    refreshTasks,
    getTaskStats,
    getBackgroundTasks,
    monitorBackgroundTask,
    stopBackgroundMonitoring,
    getTasksByColumn,
    searchTasks,
    getTasksByPriority,
  };

  return <KanbanContext.Provider value={value}>{children}</KanbanContext.Provider>;
}

export function useKanban() {
  const context = useContext(KanbanContext);
  if (!context) {
    throw new Error('useKanban must be used within KanbanProvider');
  }
  return context;
}
