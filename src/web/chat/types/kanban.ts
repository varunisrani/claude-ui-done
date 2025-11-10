/**
 * Kanban Board Types for Phase 1 (localStorage-based)
 *
 * This file defines the data structures for the Kanban board feature.
 * All data is persisted in browser localStorage (no backend database changes).
 */

/**
 * Kanban Board definition
 */
export interface KanbanBoard {
  id: string;
  name: string;
  columns: KanbanColumn[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Kanban column configuration
 */
export interface KanbanColumn {
  id: string;
  name: string;
  position: number;
}

/**
 * Kanban task (stored in localStorage)
 */
export interface KanbanTask {
  id: string;                    // Unique task ID (UUID)
  title: string;                 // Task title
  description: string;           // Task description
  boardId: string;               // Board ID ('default')
  column: 'new' | 'inprogress' | 'done'; // Column ID
  position: number;              // Position in column
  priority: 'low' | 'medium' | 'high';
  tags: string[];                // Task tags

  // Agent/Conversation linkage (Phase 2)
  sessionId?: string;            // Claude session ID (when assigned)
  streamingId?: string;          // Streaming ID (when active)
  agentStatus?: 'idle' | 'active' | 'paused' | 'waiting' | 'completed' | 'error';

  // Timestamps
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  assignedAt?: string;           // When assigned to agent
  completedAt?: string;          // When completed

  // Progress tracking (Phase 2)
  progress?: number;             // 0-100
  statusMessage?: string;        // Current status message

  // Working directory
  workingDirectory?: string;     // Working directory for the task
}

/**
 * Task creation request
 */
export interface CreateTaskRequest {
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  workingDirectory?: string;
  boardId?: string;
}

/**
 * Kanban column UI representation (with tasks)
 */
export interface KanbanColumnUI {
  id: string;
  name: string;
  tasks: KanbanTask[];
  taskCount: number;
}

/**
 * Kanban board state
 */
export interface KanbanBoardState {
  boards: KanbanBoard[];
  activeBoard: KanbanBoard | null;
  tasks: KanbanTask[];
  loading: boolean;
  error: string | null;
}
