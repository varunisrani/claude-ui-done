# Kanban Board with Agent Task Management - Implementation Plan (localStorage-Based)

> **Vision**: Add a Kanban board interface to CUI Server where users can create tasks, assign them to Claude agents, and monitor progress in real-time - all using browser localStorage for persistence (no backend database changes needed).

---

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [User Workflows](#user-workflows)
3. [System Architecture](#system-architecture)
4. [Data Models](#data-models)
5. [Backend Implementation](#backend-implementation)
6. [Frontend Implementation](#frontend-implementation)
7. [Real-time Agent Integration](#real-time-agent-integration)
8. [Implementation Phases](#implementation-phases)

---

## Feature Overview

### What We're Building

**Kanban Board for Agent Task Management** - A visual project management interface where:

1. **Tasks as Agents**: Each task can be assigned to a Claude agent conversation
2. **Three Columns**:
   - **New** - Tasks waiting to be assigned
   - **In Progress** - Tasks actively being worked on by agents
   - **Done** - Completed tasks

3. **Data Storage**:
   - **localStorage** - All tasks stored in browser localStorage (no backend database)
   - Persists across browser sessions
   - Tasks linked to existing conversation sessionIds

4. **Task Assignment Flow**:
   - Create task on Kanban board → Assign to agent → Agent starts working
   - Uses existing `/api/conversations/start` endpoint
   - Task status tracked in localStorage

5. **Background Execution**:
   - User can close chat, agent continues working (existing feature)
   - Real-time progress updates via existing SSE
   - Status syncs between localStorage and UI

---

## User Workflows

### Workflow 1: Create Task on Kanban Board

```
┌─────────────────────────────────────────────────────────────────┐
│ USER JOURNEY: Create Task on Kanban → Assign to Agent          │
└─────────────────────────────────────────────────────────────────┘

1. USER: Opens Kanban board view
   ↓
2. USER: Clicks "Create Task" button
   ↓
3. SYSTEM: Shows task creation modal
   ├── Task Title (required)
   ├── Task Description (required)
   ├── Priority (low/medium/high)
   ├── Tags (optional)
   └── Working Directory (optional)
   ↓
4. USER: Fills form and clicks "Create"
   ↓
5. SYSTEM: Creates task in "New" column
   ├── POST /api/kanban/tasks
   ├── Stores in SQLite (sessions table with kanban_column='new')
   └── Returns task card on Kanban board
   ↓
6. USER: Clicks "Assign to Agent" button on task card
   ↓
7. SYSTEM: Shows confirmation dialog
   ┌──────────────────────────────────────────────────────────┐
   │  Assign Task to Claude Agent?                            │
   │                                                           │
   │  Task: "Refactor authentication system"                  │
   │  Description: "Update JWT implementation to use RS256"   │
   │  Priority: High                                           │
   │  Working Dir: /project/src                               │
   │                                                           │
   │  Agent will start working immediately.                   │
   │  You can monitor progress in real-time.                  │
   │                                                           │
   │      [Cancel]              [Assign Agent]                │
   └──────────────────────────────────────────────────────────┘
   ↓
8. USER: Clicks "Assign Agent"
   ↓
9. SYSTEM: Starts agent conversation
   ├── POST /api/conversations/start
   ├── Passes task description as initialPrompt
   ├── Links conversation to task (sessionId = taskId)
   ├── Moves task to "In Progress" column
   ├── Updates task status to 'active'
   └── Opens chat view (optional - can run in background)
   ↓
10. AGENT: Starts working
    ├── Streams responses via SSE
    ├── Updates task status in real-time
    └── Broadcasts progress to all connected clients
    ↓
11. USER: Can close chat and check progress later
    ├── Task stays in "In Progress" column
    ├── Status indicator shows "active"
    └── Can click task to view chat history
    ↓
12. AGENT: Completes task
    ├── Sends completion event
    ├── Task moves to "Done" column
    └── Status changes to 'completed'
```

### Workflow 2: Quick Chat (Auto-Create Task)

```
┌─────────────────────────────────────────────────────────────────┐
│ USER JOURNEY: Type in Chat → Auto-Create Task → Agent Works    │
└─────────────────────────────────────────────────────────────────┘

1. USER: Opens home/chat page
   ↓
2. USER: Types message in chat input
   Example: "Create a REST API for user authentication"
   ↓
3. USER: Clicks "Send" or "Assign to Agent"
   ↓
4. SYSTEM: Auto-creates task
   ├── Creates task in Kanban board (background)
   ├── Sets title from first line of message
   ├── Sets description from full message
   ├── Places in "In Progress" column (already assigned)
   └── Generates unique taskId (sessionId)
   ↓
5. SYSTEM: Starts conversation
   ├── POST /api/conversations/start
   ├── Links conversation to task
   └── Opens chat interface with streaming
   ↓
6. AGENT: Responds in real-time
   ├── Streams text, tool uses, results
   ├── Updates visible in chat
   └── Progress synced to Kanban board
   ↓
7. USER: Closes chat tab
   ├── Agent continues working in background
   ├── Task status remains "In Progress" on Kanban
   └── Can return anytime to check progress
   ↓
8. USER: Opens Kanban board later
   ├── Sees task in "In Progress" with progress indicator
   ├── Clicks task card to view conversation
   └── Chat opens with full history
```

### Workflow 3: Background Task Management

```
┌─────────────────────────────────────────────────────────────────┐
│ USER JOURNEY: Monitor Multiple Background Tasks                 │
└─────────────────────────────────────────────────────────────────┘

1. USER: Has 5 tasks in "In Progress" column
   ├── Task A: Writing documentation (agent working)
   ├── Task B: Fixing bugs (agent working)
   ├── Task C: Refactoring code (agent working)
   ├── Task D: Writing tests (agent paused - waiting for approval)
   └── Task E: Deploying app (agent working)
   ↓
2. SYSTEM: Real-time status updates via SSE
   ├── StreamManager broadcasts to all clients
   ├── Each task shows live status indicator
   │   ├── 🟢 Active (agent working)
   │   ├── 🟡 Waiting (permission needed)
   │   └── 🔴 Error (agent encountered issue)
   └── Progress percentage (based on tool executions)
   ↓
3. USER: Clicks on Task D (waiting for approval)
   ↓
4. SYSTEM: Opens chat with permission dialog
   ├── Shows what agent wants to do
   ├── USER: Approves or denies
   └── Agent continues based on decision
   ↓
5. TASK A: Completes
   ├── Agent sends completion event
   ├── Card moves from "In Progress" to "Done"
   ├── Status changes to 'completed'
   └── Desktop notification (optional)
   ↓
6. USER: Can drag task from "Done" back to "In Progress" to continue
   ├── POST /api/kanban/tasks/:taskId/move
   ├── Reopens conversation
   └── Agent can continue work
```

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  KanbanBoard     │  │   ChatView       │  │   TaskDetails    │  │
│  │  Component       │  │   Component      │  │   Component      │  │
│  │                  │  │                  │  │                  │  │
│  │  - Drag & Drop   │  │  - Message List  │  │  - Metadata      │  │
│  │  - Task Cards    │  │  - Composer      │  │  - Status        │  │
│  │  - Status Icons  │  │  - Tool Results  │  │  - Actions       │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                      │            │
│           └─────────────────────┼──────────────────────┘            │
│                                 │                                   │
│  ┌──────────────────────────────┴───────────────────────────────┐  │
│  │           KanbanContext (Global State)                        │  │
│  │  - boards[]  (React state)                                    │  │
│  │  - tasks[]   (React state)                                    │  │
│  │  - activeTaskId                                               │  │
│  │  - Syncs with localStorage on every change                   │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
│                                  │                                  │
│  ┌───────────────────────────────┴───────────────────────────────┐  │
│  │             LocalStorage Service Layer                         │  │
│  │  - saveTask(task)           → localStorage.setItem()          │  │
│  │  - getTasks()               → localStorage.getItem()          │  │
│  │  - updateTask(id, updates)  → localStorage.setItem()          │  │
│  │  - deleteTask(id)           → localStorage.setItem()          │  │
│  │                                                                │  │
│  │  Storage Keys:                                                 │  │
│  │    - 'kanban_boards'  → Board configurations                  │  │
│  │    - 'kanban_tasks'   → All Kanban tasks                      │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
│                                  │                                  │
│  ┌───────────────────────────────┴───────────────────────────────┐  │
│  │           Existing API Service (HTTP + SSE)                    │  │
│  │  - Uses EXISTING endpoints:                                    │  │
│  │    POST /api/conversations/start  (assign task to agent)      │  │
│  │    GET  /api/stream/:streamingId  (real-time updates)         │  │
│  │    POST /api/conversations/:streamingId/stop (stop agent)     │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────┬┼───────────────────────────────────┘
                                  ││
                        HTTP/REST ││ SSE (EventSource)
                                  ││
┌─────────────────────────────────┴┴───────────────────────────────────┐
│                  BACKEND (Express.js) - NO CHANGES                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                 Existing API Routes (Used)                     │  │
│  │  /api/conversations/start     → Start agent conversation       │  │
│  │  /api/stream/:streamingId     → SSE stream for updates        │  │
│  │  /api/conversations/:id/stop  → Stop agent                     │  │
│  └──────────────────────┬─────────────────────────────────────────┘  │
│                         │                                            │
│  ┌──────────────────────┴─────────────────────────────────────────┐  │
│  │              Existing Services (No Changes)                    │  │
│  │                                                                │  │
│  │  ┌──────────────────┐  ┌──────────────┐                       │  │
│  │  │ ProcessManager   │  │ StreamMgr    │                       │  │
│  │  │ - startConv      │  │ - broadcast  │                       │  │
│  │  │ - killProcess    │  │ - addClient  │                       │  │
│  │  │ - getProcessInfo │  │ - sendEvent  │                       │  │
│  │  └──────────────────┘  └──────────────┘                       │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ Child Process
                                     ▼
                    ┌────────────────────────────────┐
                    │      Claude CLI Process        │
                    │  (Agent Execution Engine)      │
                    │                                │
                    │  - Receives task prompt        │
                    │  - Executes tools              │
                    │  - Streams JSONL output        │
                    │  - Runs in background          │
                    └────────────────────────────────┘

NOTE: All Kanban data stored in browser localStorage - no backend changes required!
```

### Component Interaction Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│  TASK ASSIGNMENT FLOW (Kanban Board → Agent Execution)              │
└──────────────────────────────────────────────────────────────────────┘

USER ACTION                    FRONTEND                   BACKEND
────────────────────────────────────────────────────────────────────────

1. Click "Assign Agent"
        │                         │                         │
        ▼                         │                         │
   Shows confirmation             │                         │
   dialog with task details       │                         │
        │                         │                         │
        ▼                         │                         │
2. Click "Confirm"                │                         │
        │                         │                         │
        └─────────────────────────▶                         │
                                  │                         │
                           api.assignTaskToAgent()          │
                                  │                         │
                                  └─────────────────────────▶
                                                            │
                                              POST /api/conversations/start
                                                    {
                                                      initialPrompt: taskDescription,
                                                      workingDirectory: task.cwd,
                                                      kanbanMetadata: {
                                                        taskId: task.id,
                                                        priority: task.priority
                                                      }
                                                    }
                                                            │
                                                            ▼
                                              ProcessManager.startConversation()
                                                            │
                                                            ▼
                                              Spawn Claude CLI child process
                                                            │
                                                            ▼
                                              Update session in SQLite
                                              SET kanban_column = 'inprogress'
                                                            │
                                                            ▼
                                              ConversationStatusManager
                                              .registerActiveSession()
                                                            │
                                                            ▼
                                              Return {streamingId, sessionId}
                                                            │
                                  ◀─────────────────────────┘
                                  │
                           Store in KanbanContext
                           Update task status
                                  │
        ◀─────────────────────────┘
        │
        ▼
3. Task card moves to
   "In Progress" column
   Shows "active" status
        │
        ▼
4. Open chat view (optional)
   Subscribe to SSE stream
        │
        └─────────────────────────▶
                                  │
                           EventSource.subscribe()
                                  │
                                  └─────────────────────────▶
                                                            │
                                              GET /api/stream/subscribe/:streamingId
                                                            │
                                                            ▼
                                              StreamManager.addClient()
                                                            │
                                                            ▼
                                              Stream JSONL from Claude CLI
                                                            │
                                  ◀────── SSE Events ───────┘
                                  │       (text, tool_use,
                                  │        tool_result,
        ◀─────────────────────────┘        status_update)
        │
        ▼
5. Real-time updates
   - Messages appear
   - Tool executions shown
   - Status indicator updates
        │
        ▼
6. User closes chat tab
   (Agent continues in background)
        │
        ▼
7. Check Kanban board later
   - Task still "In Progress"
   - Live status indicator
   - Click to view progress
```

---

## Data Models

### LocalStorage Data Structure

**No SQL database changes needed!** All Kanban data stored in browser localStorage:

```typescript
// Storage Key: 'kanban_boards'
interface KanbanBoardsStorage {
  boards: {
    id: string;
    name: string;
    columns: {
      id: string;
      name: string;
      position: number;
    }[];
    createdAt: string;
    updatedAt: string;
  }[];
}

// Storage Key: 'kanban_tasks'
interface KanbanTasksStorage {
  tasks: {
    id: string;                    // Unique task ID (UUID)
    title: string;                 // Task title
    description: string;           // Task description
    boardId: string;               // Board ID ('default')
    column: string;                // Column ID ('new', 'inprogress', 'done')
    position: number;              // Position in column
    priority: 'low' | 'medium' | 'high';
    tags: string[];                // Task tags

    // Agent/Conversation linkage
    sessionId?: string;            // Claude session ID (when assigned)
    streamingId?: string;          // Streaming ID (when active)
    agentStatus?: 'idle' | 'active' | 'paused' | 'waiting' | 'completed' | 'error';

    // Timestamps
    createdAt: string;             // ISO timestamp
    updatedAt: string;             // ISO timestamp
    assignedAt?: string;           // When assigned to agent
    completedAt?: string;          // When completed

    // Progress tracking
    progress?: number;             // 0-100
    statusMessage?: string;        // Current status message
  }[];
}
```

### TypeScript Interfaces

```typescript
// ============================================================================
// BACKEND TYPES (/src/types/index.ts)
// ============================================================================

/**
 * Kanban board definition
 */
export interface KanbanBoard {
  board_id: string;
  name: string;
  columns: KanbanColumn[];
  created_at: string;
  updated_at: string;
}

/**
 * Kanban column configuration
 */
export interface KanbanColumn {
  id: string;
  name: string;
  position: number;
  taskIds: string[]; // session_ids in this column
}

/**
 * Task metadata for Kanban integration
 */
export interface KanbanTaskMetadata {
  kanban_board_id: string;
  kanban_column: 'new' | 'inprogress' | 'done' | string;
  kanban_position: number;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  agent_status?: 'active' | 'paused' | 'completed' | 'error' | 'waiting';
  assigned_at?: string;
  completed_at?: string;
}

/**
 * Extended SessionInfo with Kanban fields
 */
export interface KanbanSessionInfo extends SessionInfo {
  kanban_board_id: string;
  kanban_column: string | null;
  kanban_position: number | null;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  agent_status: string | null;
  assigned_at: string | null;
  completed_at: string | null;
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
 * Task assignment request
 */
export interface AssignTaskRequest {
  taskId: string; // session_id
  assignToAgent: boolean;
  startImmediately?: boolean;
  additionalContext?: string;
}

/**
 * Task movement request
 */
export interface MoveTaskRequest {
  taskId: string;
  targetColumn: string;
  targetPosition: number;
  boardId?: string;
}

/**
 * Bulk task operation request
 */
export interface BulkTaskRequest {
  taskIds: string[];
  operation: 'move' | 'update' | 'delete';
  targetColumn?: string;
  metadata?: Partial<KanbanTaskMetadata>;
}

/**
 * Stream event for task progress
 */
export interface TaskProgressEvent extends StreamEvent {
  type: 'task_progress';
  taskId: string;
  status: 'active' | 'paused' | 'waiting' | 'completed' | 'error';
  message?: string;
  progress?: number; // 0-100
  toolsExecuted?: number;
}

/**
 * Stream event for task completion
 */
export interface TaskCompletionEvent extends StreamEvent {
  type: 'task_completion';
  taskId: string;
  success: boolean;
  summary?: string;
  outputFiles?: string[];
}

// ============================================================================
// FRONTEND TYPES (/src/web/chat/types/index.ts)
// ============================================================================

/**
 * Frontend Kanban task (extends ConversationSummary)
 */
export interface KanbanTask {
  id: string; // session_id
  title: string; // custom_name
  description: string; // from conversation context
  column: 'new' | 'inprogress' | 'done';
  position: number;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  agentStatus: 'idle' | 'active' | 'paused' | 'waiting' | 'completed' | 'error';
  streamingId?: string; // Present if agent is active
  createdAt: string;
  updatedAt: string;
  assignedAt?: string;
  completedAt?: string;
  workingDirectory?: string;

  // Metadata from conversation
  messageCount?: number;
  toolsExecuted?: number;
  lastMessage?: string;
}

/**
 * Frontend Kanban column
 */
export interface KanbanColumnUI {
  id: string;
  name: string;
  tasks: KanbanTask[];
  taskCount: number;
}

/**
 * Kanban board view state
 */
export interface KanbanBoardState {
  boards: KanbanBoard[];
  activeBoard: KanbanBoard | null;
  columns: KanbanColumnUI[];
  tasks: Map<string, KanbanTask>; // taskId -> task
  loading: boolean;
  error: string | null;
}

/**
 * Task assignment dialog state
 */
export interface TaskAssignmentDialogProps {
  task: KanbanTask;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Real-time task update from SSE
 */
export interface TaskUpdateEvent {
  taskId: string;
  type: 'status' | 'progress' | 'completion' | 'error';
  data: {
    status?: string;
    progress?: number;
    message?: string;
    column?: string;
  };
}
```

---

## Frontend Implementation

### 1. LocalStorage Service (`/src/web/chat/services/kanban-storage.ts`)

```typescript
import { v4 as uuidv4 } from 'uuid';
import type { KanbanBoard, KanbanTask } from '../types';

const STORAGE_KEYS = {
  BOARDS: 'kanban_boards',
  TASKS: 'kanban_tasks',
} as const;

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
      id: uuidv4(),
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
  createTask(request: {
    title: string;
    description: string;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
    boardId?: string;
  }): KanbanTask {
    const tasks = this.getTasks();
    const boardId = request.boardId || 'default';

    // Get next position in "new" column
    const newTasks = tasks.filter(t => t.boardId === boardId && t.column === 'new');
    const position = newTasks.length > 0
      ? Math.max(...newTasks.map(t => t.position)) + 1
      : 0;

    const newTask: KanbanTask = {
      id: uuidv4(),
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
    task.column = targetColumn;
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
```

### 2. Kanban Context (`/src/web/chat/contexts/KanbanContext.tsx`)

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { kanbanStorage } from '../services/kanban-storage';
import { api } from '../services/api';
import type { KanbanTask, KanbanBoard, KanbanColumn } from '../types';

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
  createTask: (title: string, description: string, priority?: string) => KanbanTask;
  assignTaskToAgent: (taskId: string) => Promise<void>;
  moveTask: (taskId: string, targetColumn: string, targetPosition: number) => void;
  updateTask: (taskId: string, updates: Partial<KanbanTask>) => void;
  deleteTask: (taskId: string) => void;
  refreshTasks: () => void;

  // Get tasks by column
  getTasksByColumn: (columnId: string) => KanbanTask[];
}

const KanbanContext = createContext<KanbanContextValue | null>(null);

export function KanbanProvider({ children }: { children: React.ReactNode }) {
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
  const createTask = useCallback((
    title: string,
    description: string,
    priority: string = 'medium'
  ): KanbanTask => {
    if (!activeBoard) {
      throw new Error('No active board selected');
    }

    const newTask = kanbanStorage.createTask({
      title,
      description,
      priority: priority as 'low' | 'medium' | 'high',
      boardId: activeBoard.id,
    });

    setTasks(prev => [...prev, newTask]);
    return newTask;
  }, [activeBoard]);

  // Assign task to agent (uses existing conversation API)
  const assignTaskToAgent = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');

    try {
      // Call existing conversation API to start agent
      const response = await api.startConversation({
        workingDirectory: process.cwd(),
        initialPrompt: `${task.title}\n\n${task.description}`,
      });

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
```

### 2. Kanban Board Component (`/src/web/chat/components/KanbanBoard/KanbanBoard.tsx`)

```typescript
import React, { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useKanban } from '../../contexts/KanbanContext';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { CreateTaskDialog } from './CreateTaskDialog';
import { AssignTaskDialog } from './AssignTaskDialog';
import { Button } from '../ui/button';
import type { KanbanTask } from '../../types';

export function KanbanBoard() {
  const { columns, moveTask, loading, error } = useKanban();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; task: KanbanTask | null }>({
    open: false,
    task: null,
  });
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const taskId = active.id as string;
    const targetColumn = over.id as string;

    // Get target position
    const column = columns.find(c => c.id === targetColumn);
    const targetPosition = column ? column.tasks.length : 0;

    await moveTask(taskId, targetColumn, targetPosition);
    setActiveTask(null);
  };

  const handleTaskClick = (task: KanbanTask) => {
    // Open chat view with this task
    // Navigate to /chat/:sessionId
    window.location.href = `/chat/${task.id}`;
  };

  const handleAssignClick = (task: KanbanTask) => {
    setAssignDialog({ open: true, task });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading tasks...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div className="flex flex-col h-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agent Task Board</h1>
        <Button onClick={() => setCreateDialogOpen(true)}>
          Create Task
        </Button>
      </div>

      {/* Kanban Columns */}
      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 flex-1 overflow-x-auto">
          {columns.map(column => (
            <SortableContext
              key={column.id}
              id={column.id}
              items={column.tasks.map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <KanbanColumn
                column={column}
                onTaskClick={handleTaskClick}
                onAssignClick={handleAssignClick}
              />
            </SortableContext>
          ))}
        </div>

        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Dialogs */}
      <CreateTaskDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      {assignDialog.task && (
        <AssignTaskDialog
          task={assignDialog.task}
          open={assignDialog.open}
          onClose={() => setAssignDialog({ open: false, task: null })}
        />
      )}
    </div>
  );
}
```

### 3. Task Assignment Dialog (`/src/web/chat/components/KanbanBoard/AssignTaskDialog.tsx`)

```typescript
import React from 'react';
import { useKanban } from '../../contexts/KanbanContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import type { KanbanTask } from '../../types';

interface AssignTaskDialogProps {
  task: KanbanTask;
  open: boolean;
  onClose: () => void;
}

export function AssignTaskDialog({ task, open, onClose }: AssignTaskDialogProps) {
  const { assignTaskToAgent } = useKanban();
  const [loading, setLoading] = React.useState(false);

  const handleAssign = async () => {
    setLoading(true);
    try {
      await assignTaskToAgent(task.id);
      onClose();
    } catch (error) {
      console.error('Failed to assign task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Task to Claude Agent?</DialogTitle>
          <DialogDescription>
            Review the task details before assigning to an AI agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Task Details */}
          <div>
            <label className="text-sm font-medium text-gray-700">Task</label>
            <p className="text-lg font-semibold">{task.title}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Description</label>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{task.description}</p>
          </div>

          <div className="flex gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Priority</label>
              <p className="text-sm">
                <span
                  className={`px-2 py-1 rounded ${
                    task.priority === 'high'
                      ? 'bg-red-100 text-red-800'
                      : task.priority === 'medium'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-green-100 text-green-800'
                  }`}
                >
                  {task.priority}
                </span>
              </p>
            </div>

            {task.workingDirectory && (
              <div>
                <label className="text-sm font-medium text-gray-700">Working Directory</label>
                <p className="text-sm font-mono text-gray-600">{task.workingDirectory}</p>
              </div>
            )}
          </div>

          {task.tags.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700">Tags</label>
              <div className="flex gap-2 flex-wrap">
                {task.tags.map(tag => (
                  <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Agent Info */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-sm text-blue-800">
              <strong>Agent will:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Start working on this task immediately</li>
                <li>Execute necessary tools and actions</li>
                <li>Stream progress in real-time</li>
                <li>Continue working even if you close the chat</li>
              </ul>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={loading}>
            {loading ? 'Assigning...' : 'Assign Agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4. Update App Routing (`/src/web/chat/ChatApp.tsx`)

```typescript
import { KanbanBoard } from './components/KanbanBoard/KanbanBoard';
import { KanbanProvider } from './contexts/KanbanContext';

// Add route
<Route path="/kanban" element={
  <KanbanProvider>
    <KanbanBoard />
  </KanbanProvider>
} />
```

---

## Real-time Agent Integration

### Agent Status Updates via SSE

```typescript
// Backend: Extend StreamManager to broadcast task status
// /src/services/stream-manager.ts

export class StreamManager {
  // ... existing code ...

  /**
   * Broadcast task status update to all clients
   */
  broadcastTaskStatus(taskId: string, status: string, data?: any): void {
    const event: TaskProgressEvent = {
      type: 'task_progress',
      taskId,
      status,
      ...data,
    };

    // Find all streams associated with this task
    // Broadcast to Kanban board listeners
    this.broadcastToBoard('default', event);
  }

  private broadcastToBoard(boardId: string, event: any): void {
    // Implementation to broadcast to board subscribers
    this.streams.forEach((clients, streamingId) => {
      clients.forEach(client => {
        this.sendEvent(streamingId, event, client);
      });
    });
  }
}

// Frontend: Listen for task updates
// /src/web/chat/contexts/KanbanContext.tsx

useEffect(() => {
  // Subscribe to board-wide updates
  const eventSource = new EventSource(`/api/stream/board/default`);

  eventSource.addEventListener('task_progress', (event) => {
    const data = JSON.parse(event.data);
    updateTaskStatus(data.taskId, data.status);
  });

  return () => eventSource.close();
}, []);
```

---

## Implementation Phases

### Phase 1: LocalStorage Foundation (3-5 days)

**Goal**: Basic localStorage service and Kanban data structure

- [ ] Create KanbanStorageService class (localStorage wrapper)
- [ ] Define TypeScript interfaces for Kanban data
- [ ] Implement board and task CRUD operations
- [ ] Create KanbanContext for React state management
- [ ] Build basic KanbanBoard component layout
- [ ] Build TaskCard component
- [ ] Build CreateTaskDialog component
- [ ] Test data persistence in localStorage

**Deliverables:**
- localStorage service working with basic CRUD
- Users can create tasks
- Tasks appear in "New" column
- Tasks persist across browser sessions
- Basic board UI renders correctly

### Phase 2: Agent Integration (3-5 days)

**Goal**: Connect tasks to existing conversation API

- [ ] Build AssignTaskDialog component
- [ ] Integrate with existing `/api/conversations/start` endpoint
- [ ] Link tasks to conversation sessionIds and streamingIds
- [ ] Subscribe to existing SSE streams for task updates
- [ ] Update localStorage when agent status changes
- [ ] Add status indicators (idle, active, waiting, completed, error)
- [ ] Handle agent completion events

**Deliverables:**
- Users can assign tasks to agents
- Tasks move to "In Progress" when assigned
- Real-time status updates via existing SSE
- Background execution works (existing feature)
- Tasks sync with localStorage automatically

### Phase 3: Advanced Features (3-5 days)

**Goal**: Drag-drop, filtering, and enhancements

- [ ] Install @dnd-kit for drag-and-drop
- [ ] Implement drag-drop reordering between columns
- [ ] Add task filtering (priority, tags, status)
- [ ] Add task search functionality
- [ ] Add bulk operations (move multiple tasks)
- [ ] Add task priority visualization (colors)
- [ ] Add progress indicators (based on tool executions)
- [ ] Desktop notifications for task completion
- [ ] Performance optimization (memoization, virtualization)

**Deliverables:**
- Full drag-and-drop Kanban board
- Advanced filtering and search
- Polished UI/UX
- Smooth animations and transitions

---

## Success Criteria

✅ **localStorage persists all Kanban data**
✅ **No backend changes required**
✅ **User can create tasks on Kanban board**
✅ **User can assign tasks to Claude agents (via existing API)**
✅ **Confirmation dialog shows task details before assignment**
✅ **Tasks automatically move between columns**
✅ **Real-time status updates via existing SSE**
✅ **User can click task to view chat conversation**
✅ **System handles multiple concurrent agent tasks**
✅ **Full integration with existing conversation system**
✅ **Data persists across browser sessions**

---

## Next Steps

1. **Review this plan**
2. **Start with Phase 1**: Create localStorage service
   - Implement KanbanStorageService
   - Define TypeScript types
   - Test localStorage operations

3. **Build UI components**:
   - KanbanBoard, KanbanColumn, TaskCard
   - CreateTaskDialog, AssignTaskDialog

4. **Integrate with existing APIs**:
   - Use existing conversation endpoints
   - Subscribe to existing SSE streams
   - Update localStorage based on agent events

5. **Add advanced features**:
   - Drag-and-drop
   - Filtering and search
   - Notifications

6. **Test and polish**:
   - Cross-browser testing
   - Performance optimization
   - UI/UX refinement

---

**Questions? Need clarification on any section?** Let me know and I'll provide more details!
