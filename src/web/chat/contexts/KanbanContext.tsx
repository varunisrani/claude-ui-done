/**
 * KanbanContext
 *
 * React Context for global Kanban state management.
 * Loads boards/tasks from localStorage on mount and syncs all changes.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { kanbanStorage } from '../services/kanban-storage';
import { api } from '../services/api';
import type { KanbanTask, KanbanBoard, CreateTaskRequest } from '../types/kanban';

interface KanbanContextValue {
  boards: KanbanBoard[];
  activeBoard: KanbanBoard | null;
  tasks: KanbanTask[];
  loading: boolean;
  error: string | null;

  // Board operations
  selectBoard: (boardId: string) => void;
  createBoard: (name: string) => KanbanBoard;

  // Task operations
  createTask: (request: CreateTaskRequest) => KanbanTask;
  assignTaskToAgent: (taskId: string) => Promise<string>; // Returns sessionId
  markTaskAsDone: (taskId: string) => void;
  moveTask: (taskId: string, targetColumn: string, targetPosition: number) => void;
  updateTask: (taskId: string, updates: Partial<KanbanTask>) => void;
  deleteTask: (taskId: string) => void;
  refreshTasks: () => void;
  syncTask: (taskId: string) => void;
  validateAndSyncTasks: () => void;

  // Get tasks by column
  getTasksByColumn: (columnId: string) => KanbanTask[];
}

const KanbanContext = createContext<KanbanContextValue | null>(null);

export function KanbanProvider({ children }: { children: ReactNode }) {
  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState<KanbanBoard | null>(null);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load boards and tasks from localStorage on mount
  useEffect(() => {
    try {
      setLoading(true);
      const loadedBoards = kanbanStorage.getBoards();
      setBoards(loadedBoards);

      // Select first board by default
      if (loadedBoards.length > 0) {
        setActiveBoard(loadedBoards[0]);
        const loadedTasks = kanbanStorage.getTasks(loadedBoards[0].id);
        setTasks(loadedTasks);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Kanban data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Select board
  const selectBoard = useCallback((boardId: string) => {
    const board = kanbanStorage.getBoard(boardId);
    if (board) {
      setActiveBoard(board);
      const boardTasks = kanbanStorage.getTasks(boardId);
      setTasks(boardTasks);
    }
  }, []);

  // Create board
  const createBoard = useCallback((name: string): KanbanBoard => {
    const newBoard = kanbanStorage.createBoard(name);
    setBoards(prev => [...prev, newBoard]);
    return newBoard;
  }, []);

  // Create task
  const createTask = useCallback((request: CreateTaskRequest): KanbanTask => {
    if (!activeBoard) {
      throw new Error('No active board selected');
    }

    const newTask = kanbanStorage.createTask({
      ...request,
      boardId: activeBoard.id,
    });

    setTasks(prev => [...prev, newTask]);
    return newTask;
  }, [activeBoard]);

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
      workingDirectory: task.workingDirectory,
      priority: task.priority,
      tags: task.tags
    });

    const conversationPayload = {
      workingDirectory: task.workingDirectory || process.cwd(),
      initialPrompt: `${task.title}\n\n${task.description}`,
    };

    console.log('📤 [KanbanContext] Preparing to call API.startConversation with payload:', {
      workingDirectory: conversationPayload.workingDirectory,
      initialPromptLength: conversationPayload.initialPrompt.length,
      initialPrompt: conversationPayload.initialPrompt.substring(0, 200) + '...'
    });

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

      console.log('💾 [KanbanContext] Updating task in localStorage...');
      // Update task in localStorage with conversation details
      const updatedTask = kanbanStorage.updateTask(taskId, {
        sessionId: response.sessionId,
        streamingId: response.streamingId,
        column: 'inprogress',
        agentStatus: 'active',
        assignedAt: new Date().toISOString(),
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
  const markTaskAsDone = useCallback((taskId: string) => {
    console.log('🎯 [KanbanContext] markTaskAsDone called with task ID:', taskId);

    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      console.error('❌ [KanbanContext] Task not found for markTaskAsDone:', taskId);
      return;
    }

    console.log('📋 [KanbanContext] Marking task as done:', {
      id: task.id,
      title: task.title,
      currentColumn: task.column,
      currentAgentStatus: task.agentStatus
    });

    // Update task in localStorage with done status
    const updatedTask = kanbanStorage.updateTask(taskId, {
      column: 'done',
      agentStatus: 'completed',
      completedAt: new Date().toISOString(),
      statusMessage: 'Task completed manually'
    });

    // Update state
    setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));

    console.log('✅ [KanbanContext] Task marked as done successfully');
  }, [tasks]);

  // Move task
  const moveTask = useCallback((
    taskId: string,
    targetColumn: string,
    targetPosition: number
  ) => {
    const updatedTask = kanbanStorage.moveTask(taskId, targetColumn, targetPosition);
    setTasks(kanbanStorage.getTasks(activeBoard?.id));
  }, [activeBoard]);

  // Update task
  const updateTask = useCallback((taskId: string, updates: Partial<KanbanTask>) => {
    const updatedTask = kanbanStorage.updateTask(taskId, updates);
    setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
  }, []);

  // Delete task
  const deleteTask = useCallback((taskId: string) => {
    kanbanStorage.deleteTask(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  // Refresh tasks (reload from localStorage)
  const refreshTasks = useCallback(() => {
    if (activeBoard) {
      const loadedTasks = kanbanStorage.getTasks(activeBoard.id);
      setTasks(loadedTasks);
      console.log('🔄 [KanbanContext] Refreshed tasks from localStorage:', loadedTasks.length);
    }
  }, [activeBoard]);

  // Synchronize specific task from localStorage to state
  const syncTask = useCallback((taskId: string) => {
    const task = kanbanStorage.getTask(taskId);
    if (task) {
      setTasks(prev => {
        const existingIndex = prev.findIndex(t => t.id === taskId);
        if (existingIndex >= 0) {
          const newTasks = [...prev];
          newTasks[existingIndex] = task;
          console.log('🔄 [KanbanContext] Synced task from localStorage:', taskId);
          return newTasks;
        }
        return [...prev, task];
      });
    }
  }, []);

  // Validate and sync all tasks with localStorage
  const validateAndSyncTasks = useCallback(() => {
    if (!activeBoard) return;

    const storageTasks = kanbanStorage.getTasks(activeBoard.id);
    const stateTaskIds = new Set(tasks.map(t => t.id));
    const storageTaskIds = new Set(storageTasks.map(t => t.id));

    // Find tasks in state but not in storage (orphaned)
    const orphanedTasks = tasks.filter(t => !storageTaskIds.has(t.id));
    if (orphanedTasks.length > 0) {
      console.warn('⚠️ [KanbanContext] Found orphaned tasks in state:', orphanedTasks.map(t => t.id));
      // Remove orphaned tasks from state
      setTasks(prev => prev.filter(t => storageTaskIds.has(t.id)));
    }

    // Find tasks in storage but not in state (missing)
    const missingTasks = storageTasks.filter(t => !stateTaskIds.has(t.id));
    if (missingTasks.length > 0) {
      console.warn('⚠️ [KanbanContext] Found missing tasks in state:', missingTasks.map(t => t.id));
      // Add missing tasks to state
      setTasks(prev => [...prev, ...missingTasks]);
    }

    console.log('✅ [KanbanContext] Task validation complete. State:', tasks.length, 'Storage:', storageTasks.length);
  }, [activeBoard]);

  // Periodic validation and sync (every 30 seconds)
  useEffect(() => {
    if (!activeBoard) return;

    const validationInterval = setInterval(() => {
      validateAndSyncTasks();
    }, 30000); // 30 seconds

    return () => clearInterval(validationInterval);
  }, [activeBoard, validateAndSyncTasks]);

  // Validate on window focus (when user returns to the app)
  useEffect(() => {
    const handleFocus = () => {
      if (activeBoard) {
        validateAndSyncTasks();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [activeBoard, validateAndSyncTasks]);

  // Get tasks by column
  const getTasksByColumn = useCallback((columnId: string): KanbanTask[] => {
    return tasks
      .filter(t => t.column === columnId)
      .sort((a, b) => a.position - b.position);
  }, [tasks]);

  const value: KanbanContextValue = {
    boards,
    activeBoard,
    tasks,
    loading,
    error,
    selectBoard,
    createBoard,
    createTask,
    assignTaskToAgent,
    markTaskAsDone,
    moveTask,
    updateTask,
    deleteTask,
    refreshTasks,
    syncTask,
    validateAndSyncTasks,
    getTasksByColumn,
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
