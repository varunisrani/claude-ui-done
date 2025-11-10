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
  moveTask: (taskId: string, targetColumn: string, targetPosition: number) => void;
  updateTask: (taskId: string, updates: Partial<KanbanTask>) => void;
  deleteTask: (taskId: string) => void;
  refreshTasks: () => void;

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
    const task = tasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');

    try {
      // Call existing conversation API to start agent
      const response = await api.startConversation({
        workingDirectory: task.workingDirectory || process.cwd(),
        initialPrompt: `${task.title}\n\n${task.description}`,
      });

      console.log('[KanbanContext] Agent assigned:', response);

      // Update task in localStorage with conversation details
      const updatedTask = kanbanStorage.updateTask(taskId, {
        sessionId: response.sessionId,
        streamingId: response.streamingId,
        column: 'inprogress',
        agentStatus: 'active',
        assignedAt: new Date().toISOString(),
      });

      // Update state
      setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));

      // Return sessionId for navigation
      return response.sessionId;
    } catch (err: any) {
      setError(err.message || 'Failed to assign task to agent');
      throw err;
    }
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
    }
  }, [activeBoard]);

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
    moveTask,
    updateTask,
    deleteTask,
    refreshTasks,
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
