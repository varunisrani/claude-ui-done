/**
 * KanbanStorageService
 *
 * LocalStorage-based persistence for Kanban boards and tasks.
 * All data is stored in browser localStorage (no backend database).
 */

import type { KanbanBoard, KanbanTask, CreateTaskRequest } from '../types/kanban';

const STORAGE_KEYS = {
  BOARDS: 'kanban_boards',
  TASKS: 'kanban_tasks',
} as const;

/**
 * Generate a simple UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export class KanbanStorageService {
  /**
   * Get all boards from localStorage
   */
  getBoards(): KanbanBoard[] {
    const data = localStorage.getItem(STORAGE_KEYS.BOARDS);
    if (!data) {
      // Initialize with default board
      const defaultBoard: KanbanBoard = {
        id: 'default',
        name: 'My Board',
        columns: [
          { id: 'new', name: 'New', position: 0 },
          { id: 'inprogress', name: 'In Progress', position: 1 },
          { id: 'done', name: 'Done', position: 2 },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.saveBoards([defaultBoard]);
      return [defaultBoard];
    }
    return JSON.parse(data);
  }

  /**
   * Save boards to localStorage
   */
  saveBoards(boards: KanbanBoard[]): void {
    localStorage.setItem(STORAGE_KEYS.BOARDS, JSON.stringify(boards));
  }

  /**
   * Get board by ID
   */
  getBoard(boardId: string): KanbanBoard | null {
    const boards = this.getBoards();
    return boards.find(b => b.id === boardId) || null;
  }

  /**
   * Create new board
   */
  createBoard(name: string): KanbanBoard {
    const boards = this.getBoards();
    const newBoard: KanbanBoard = {
      id: generateUUID(),
      name,
      columns: [
        { id: 'new', name: 'New', position: 0 },
        { id: 'inprogress', name: 'In Progress', position: 1 },
        { id: 'done', name: 'Done', position: 2 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    boards.push(newBoard);
    this.saveBoards(boards);
    return newBoard;
  }

  // =========================================================================
  // TASK OPERATIONS
  // =========================================================================

  /**
   * Get all tasks from localStorage
   */
  getTasks(boardId?: string): KanbanTask[] {
    const data = localStorage.getItem(STORAGE_KEYS.TASKS);
    if (!data) return [];

    const tasks: KanbanTask[] = JSON.parse(data);
    return boardId ? tasks.filter(t => t.boardId === boardId) : tasks;
  }

  /**
   * Save tasks to localStorage
   */
  private saveTasks(tasks: KanbanTask[]): void {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(tasks));
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): KanbanTask | null {
    const tasks = this.getTasks();
    return tasks.find(t => t.id === taskId) || null;
  }

  /**
   * Create new task
   */
  createTask(request: CreateTaskRequest): KanbanTask {
    const tasks = this.getTasks();
    const boardId = request.boardId || 'default';

    // Get next position in "new" column
    const newTasks = tasks.filter(t => t.boardId === boardId && t.column === 'new');
    const position = newTasks.length > 0
      ? Math.max(...newTasks.map(t => t.position)) + 1
      : 0;

    const newTask: KanbanTask = {
      id: generateUUID(),
      title: request.title,
      description: request.description,
      boardId,
      column: 'new',
      position,
      priority: request.priority || 'medium',
      tags: request.tags || [],
      agentStatus: 'idle',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workingDirectory: request.workingDirectory,
    };

    tasks.push(newTask);
    this.saveTasks(tasks);
    return newTask;
  }

  /**
   * Update task
   */
  updateTask(taskId: string, updates: Partial<KanbanTask>): KanbanTask {
    const tasks = this.getTasks();
    const index = tasks.findIndex(t => t.id === taskId);

    if (index === -1) {
      throw new Error(`Task ${taskId} not found`);
    }

    tasks[index] = {
      ...tasks[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.saveTasks(tasks);
    return tasks[index];
  }

  /**
   * Move task to different column/position
   */
  moveTask(taskId: string, targetColumn: string, targetPosition: number): KanbanTask {
    const tasks = this.getTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId);

    if (taskIndex === -1) {
      throw new Error(`Task ${taskId} not found`);
    }

    const task = tasks[taskIndex];
    const oldColumn = task.column;

    // Update task
    task.column = targetColumn as 'new' | 'inprogress' | 'done';
    task.position = targetPosition;
    task.updatedAt = new Date().toISOString();

    // Reorder other tasks
    this.reorderColumn(tasks, task.boardId, oldColumn);
    this.reorderColumn(tasks, task.boardId, targetColumn);

    this.saveTasks(tasks);
    return task;
  }

  /**
   * Delete task
   */
  deleteTask(taskId: string): boolean {
    const tasks = this.getTasks();
    const filtered = tasks.filter(t => t.id !== taskId);

    if (filtered.length === tasks.length) {
      return false; // Task not found
    }

    this.saveTasks(filtered);
    return true;
  }

  /**
   * Bulk move tasks
   */
  bulkMoveTasks(taskIds: string[], targetColumn: string): number {
    let moved = 0;
    for (const taskId of taskIds) {
      try {
        const tasks = this.getTasks();
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          const position = tasks.filter(
            t => t.boardId === task.boardId && t.column === targetColumn
          ).length;
          this.moveTask(taskId, targetColumn, position);
          moved++;
        }
      } catch (error) {
        console.error('Failed to move task:', taskId, error);
      }
    }
    return moved;
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  /**
   * Reorder tasks in column to fill gaps and maintain order
   */
  private reorderColumn(tasks: KanbanTask[], boardId: string, column: string): void {
    const columnTasks = tasks
      .filter(t => t.boardId === boardId && t.column === column)
      .sort((a, b) => a.position - b.position);

    columnTasks.forEach((task, index) => {
      task.position = index;
    });
  }

  /**
   * Clear all Kanban data (for testing/reset)
   */
  clearAll(): void {
    localStorage.removeItem(STORAGE_KEYS.BOARDS);
    localStorage.removeItem(STORAGE_KEYS.TASKS);
  }
}

// Export singleton instance
export const kanbanStorage = new KanbanStorageService();
