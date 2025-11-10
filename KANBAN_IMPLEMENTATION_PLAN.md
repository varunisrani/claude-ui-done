# Kanban Board with Agent Task Management - Implementation Plan

> **Vision**: Transform CUI Server into an agent task management platform where users can create tasks on a Kanban board, assign them to Claude agents, monitor progress in real-time, and let agents work in the background while maintaining full visibility and control.

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

1. **Tasks as Agents**: Each task is a Claude agent conversation
2. **Three Columns**:
   - **New** - Tasks waiting to be assigned
   - **In Progress** - Tasks actively being worked on by agents
   - **Done** - Completed tasks

3. **Task Assignment Flow**:
   - Create task on Kanban board → Assign to agent → Agent starts working
   - Type in chat → Auto-create task → Agent responds
   - Tasks run in background, user can check progress anytime

4. **Background Execution**:
   - User can close chat, agent continues working
   - Real-time progress updates via SSE
   - Status syncs across Kanban board and chat interface

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
│  │  - boards[]                                                   │  │
│  │  - tasks[]                                                    │  │
│  │  - activeTaskId                                               │  │
│  │  - streamStatus (from StreamStatusContext)                   │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
│                                  │                                  │
│  ┌───────────────────────────────┴───────────────────────────────┐  │
│  │               API Service (HTTP + SSE)                         │  │
│  │  - createTask()                                                │  │
│  │  - assignTaskToAgent()                                         │  │
│  │  - moveTask()                                                  │  │
│  │  - subscribeToTaskUpdates()                                    │  │
│  └───────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────┬┼───────────────────────────────────┘
                                  ││
                        HTTP/REST ││ SSE (EventSource)
                                  ││
┌─────────────────────────────────┴┴───────────────────────────────────┐
│                      BACKEND (Express.js)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                   API Routes Layer                             │  │
│  │  /api/kanban/tasks        (KanbanRoutes)                       │  │
│  │  /api/conversations       (ConversationRoutes)                 │  │
│  │  /api/stream              (StreamingRoutes)                    │  │
│  └──────────────────────┬─────────────────────────────────────────┘  │
│                         │                                            │
│  ┌──────────────────────┴─────────────────────────────────────────┐  │
│  │                   Service Layer                                │  │
│  │                                                                │  │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐  │  │
│  │  │ KanbanService   │  │ ProcessManager   │  │ StreamMgr    │  │  │
│  │  │                 │  │                  │  │              │  │  │
│  │  │ - createTask    │  │ - startConv      │  │ - broadcast  │  │  │
│  │  │ - moveTask      │  │ - killProcess    │  │ - addClient  │  │  │
│  │  │ - updateStatus  │  │ - getProcessInfo │  │ - sendEvent  │  │  │
│  │  └────────┬────────┘  └────────┬─────────┘  └──────┬───────┘  │  │
│  │           │                    │                    │          │  │
│  │           └────────────────────┼────────────────────┘          │  │
│  │                                │                                │  │
│  │  ┌─────────────────────────────┴──────────────────────────────┐  │
│  │  │           ConversationStatusManager                         │  │
│  │  │  - registerActiveSession(streamingId, sessionId, context)   │  │
│  │  │  - getConversationStatus(sessionId)                         │  │
│  │  │  - emit session events                                      │  │
│  │  └─────────────────────────────┬──────────────────────────────┘  │
│  └─────────────────────────────────┼─────────────────────────────────┘
│                                    │                                  │
│  ┌─────────────────────────────────┴──────────────────────────────┐  │
│  │              SessionInfoService (SQLite)                        │  │
│  │  ~/.cui/session-info.db                                         │  │
│  │                                                                 │  │
│  │  sessions table:                                                │  │
│  │    - session_id (PK)                                            │  │
│  │    - custom_name                                                │  │
│  │    - kanban_column (NEW)                                        │  │
│  │    - kanban_position (NEW)                                      │  │
│  │    - priority (NEW)                                             │  │
│  │    - tags (NEW)                                                 │  │
│  │    - created_at, updated_at                                     │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                  │
└────────────────────────────────────┼──────────────────────────────────┘
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

### Enhanced Session Schema (SQLite)

```sql
-- Extend existing sessions table with Kanban fields
ALTER TABLE sessions ADD COLUMN kanban_board_id TEXT DEFAULT 'default';
ALTER TABLE sessions ADD COLUMN kanban_column TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN kanban_position INTEGER DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN priority TEXT DEFAULT 'medium';
ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT '[]'; -- JSON array
ALTER TABLE sessions ADD COLUMN task_status TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN assigned_at TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN completed_at TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN agent_status TEXT DEFAULT NULL; -- 'active', 'paused', 'completed', 'error'

-- Create index for efficient Kanban queries
CREATE INDEX IF NOT EXISTS idx_kanban_column ON sessions(kanban_board_id, kanban_column, kanban_position);
CREATE INDEX IF NOT EXISTS idx_task_status ON sessions(task_status, agent_status);
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

## Backend Implementation

### 1. KanbanService (`/src/services/kanban-service.ts`)

```typescript
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from './logger';
import { CUIError } from './cui-error';
import type {
  KanbanBoard,
  KanbanColumn,
  KanbanTask,
  KanbanTaskMetadata,
  CreateTaskRequest,
  MoveTaskRequest,
  BulkTaskRequest
} from '@/types';

const logger = createLogger('KanbanService');

export class KanbanService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeTables();
  }

  /**
   * Initialize Kanban tables if they don't exist
   */
  private initializeTables(): void {
    // Extend sessions table with Kanban columns
    const alterStatements = [
      `ALTER TABLE sessions ADD COLUMN kanban_board_id TEXT DEFAULT 'default'`,
      `ALTER TABLE sessions ADD COLUMN kanban_column TEXT DEFAULT NULL`,
      `ALTER TABLE sessions ADD COLUMN kanban_position INTEGER DEFAULT NULL`,
      `ALTER TABLE sessions ADD COLUMN priority TEXT DEFAULT 'medium'`,
      `ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT '[]'`,
      `ALTER TABLE sessions ADD COLUMN agent_status TEXT DEFAULT NULL`,
      `ALTER TABLE sessions ADD COLUMN assigned_at TEXT DEFAULT NULL`,
      `ALTER TABLE sessions ADD COLUMN completed_at TEXT DEFAULT NULL`,
    ];

    for (const stmt of alterStatements) {
      try {
        this.db.exec(stmt);
      } catch (error: any) {
        // Ignore "duplicate column" errors
        if (!error.message.includes('duplicate column')) {
          logger.error('Failed to alter sessions table', { error: error.message });
        }
      }
    }

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kanban_column
      ON sessions(kanban_board_id, kanban_column, kanban_position)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_status
      ON sessions(agent_status)
    `);

    logger.info('Kanban tables initialized');
  }

  // =========================================================================
  // TASK CRUD OPERATIONS
  // =========================================================================

  /**
   * Create a new task
   */
  createTask(request: CreateTaskRequest): KanbanTask {
    const taskId = uuidv4();
    const now = new Date().toISOString();

    const insertStmt = this.db.prepare(`
      INSERT INTO sessions (
        session_id, custom_name, created_at, updated_at, version,
        kanban_board_id, kanban_column, kanban_position, priority, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Get next position in "new" column
    const position = this.getNextPosition(request.boardId || 'default', 'new');

    insertStmt.run(
      taskId,
      request.title,
      now,
      now,
      1, // version
      request.boardId || 'default',
      'new',
      position,
      request.priority || 'medium',
      JSON.stringify(request.tags || [])
    );

    logger.info('Task created', { taskId, title: request.title });

    return this.getTask(taskId)!;
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): KanbanTask | null {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions WHERE session_id = ?
    `);
    const row = stmt.get(taskId) as any;

    if (!row) {
      return null;
    }

    return this.mapRowToTask(row);
  }

  /**
   * Get all tasks in a board
   */
  getTasks(boardId: string = 'default'): KanbanTask[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE kanban_board_id = ?
      ORDER BY kanban_position ASC
    `);
    const rows = stmt.all(boardId) as any[];

    return rows.map(row => this.mapRowToTask(row));
  }

  /**
   * Get tasks by column
   */
  getTasksByColumn(boardId: string, column: string): KanbanTask[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE kanban_board_id = ? AND kanban_column = ?
      ORDER BY kanban_position ASC
    `);
    const rows = stmt.all(boardId, column) as any[];

    return rows.map(row => this.mapRowToTask(row));
  }

  /**
   * Move task to different column/position
   */
  moveTask(request: MoveTaskRequest): KanbanTask {
    const { taskId, targetColumn, targetPosition } = request;

    // Get current task
    const task = this.getTask(taskId);
    if (!task) {
      throw new CUIError('Task not found', 'NOT_FOUND');
    }

    // Update task position
    const updateStmt = this.db.prepare(`
      UPDATE sessions
      SET kanban_column = ?, kanban_position = ?, updated_at = ?
      WHERE session_id = ?
    `);

    updateStmt.run(
      targetColumn,
      targetPosition,
      new Date().toISOString(),
      taskId
    );

    // Reorder other tasks in target column
    this.reorderColumn(task.kanban_board_id, targetColumn);

    logger.info('Task moved', { taskId, targetColumn, targetPosition });

    return this.getTask(taskId)!;
  }

  /**
   * Update task metadata
   */
  updateTaskMetadata(taskId: string, metadata: Partial<KanbanTaskMetadata>): KanbanTask {
    const updates: string[] = [];
    const values: any[] = [];

    if (metadata.priority) {
      updates.push('priority = ?');
      values.push(metadata.priority);
    }
    if (metadata.tags) {
      updates.push('tags = ?');
      values.push(JSON.stringify(metadata.tags));
    }
    if (metadata.agent_status) {
      updates.push('agent_status = ?');
      values.push(metadata.agent_status);
    }
    if (metadata.assigned_at) {
      updates.push('assigned_at = ?');
      values.push(metadata.assigned_at);
    }
    if (metadata.completed_at) {
      updates.push('completed_at = ?');
      values.push(metadata.completed_at);
    }

    if (updates.length === 0) {
      throw new CUIError('No metadata to update', 'INVALID_REQUEST');
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(taskId);

    const stmt = this.db.prepare(`
      UPDATE sessions SET ${updates.join(', ')} WHERE session_id = ?
    `);
    stmt.run(...values);

    logger.info('Task metadata updated', { taskId, metadata });

    return this.getTask(taskId)!;
  }

  /**
   * Delete task
   */
  deleteTask(taskId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM sessions WHERE session_id = ?
    `);
    const result = stmt.run(taskId);

    logger.info('Task deleted', { taskId, changes: result.changes });

    return result.changes > 0;
  }

  // =========================================================================
  // BULK OPERATIONS
  // =========================================================================

  /**
   * Bulk move tasks
   */
  bulkMoveTasks(request: BulkTaskRequest): number {
    if (request.operation !== 'move' || !request.targetColumn) {
      throw new CUIError('Invalid bulk move request', 'INVALID_REQUEST');
    }

    let moved = 0;
    for (const taskId of request.taskIds) {
      try {
        const position = this.getNextPosition('default', request.targetColumn);
        this.moveTask({ taskId, targetColumn: request.targetColumn, targetPosition: position });
        moved++;
      } catch (error) {
        logger.error('Failed to move task in bulk', { taskId, error });
      }
    }

    logger.info('Bulk move completed', { moved, total: request.taskIds.length });

    return moved;
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  /**
   * Get next position in column
   */
  private getNextPosition(boardId: string, column: string): number {
    const stmt = this.db.prepare(`
      SELECT MAX(kanban_position) as maxPos
      FROM sessions
      WHERE kanban_board_id = ? AND kanban_column = ?
    `);
    const result = stmt.get(boardId, column) as any;

    return (result?.maxPos ?? -1) + 1;
  }

  /**
   * Reorder tasks in column to fill gaps
   */
  private reorderColumn(boardId: string, column: string): void {
    const tasks = this.getTasksByColumn(boardId, column);

    tasks.forEach((task, index) => {
      if (task.kanban_position !== index) {
        const stmt = this.db.prepare(`
          UPDATE sessions SET kanban_position = ? WHERE session_id = ?
        `);
        stmt.run(index, task.id);
      }
    });
  }

  /**
   * Map database row to KanbanTask
   */
  private mapRowToTask(row: any): KanbanTask {
    return {
      id: row.session_id,
      title: row.custom_name,
      description: '', // Will be fetched from conversation context
      kanban_board_id: row.kanban_board_id,
      kanban_column: row.kanban_column,
      kanban_position: row.kanban_position,
      priority: row.priority as 'low' | 'medium' | 'high',
      tags: JSON.parse(row.tags || '[]'),
      agent_status: row.agent_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      assigned_at: row.assigned_at,
      completed_at: row.completed_at,
      pinned: Boolean(row.pinned),
      archived: Boolean(row.archived),
    };
  }
}
```

### 2. Kanban Routes (`/src/routes/kanban.routes.ts`)

```typescript
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { KanbanService } from '@/services/kanban-service';
import { CUIError } from '@/services/cui-error';
import { createLogger } from '@/services/logger';

const logger = createLogger('KanbanRoutes');

export function createKanbanRoutes(kanbanService: KanbanService): Router {
  const router = Router();

  // =========================================================================
  // TASK ROUTES
  // =========================================================================

  /**
   * Create new task
   * POST /api/kanban/tasks
   */
  router.post('/tasks', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description, priority, tags, workingDirectory, boardId } = req.body;

      if (!title || !description) {
        throw new CUIError('Title and description are required', 'INVALID_REQUEST');
      }

      const task = kanbanService.createTask({
        title,
        description,
        priority: priority || 'medium',
        tags: tags || [],
        workingDirectory,
        boardId: boardId || 'default',
      });

      logger.info('Task created via API', { taskId: task.id });

      res.json({ success: true, task });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Get all tasks
   * GET /api/kanban/tasks
   */
  router.get('/tasks', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { boardId = 'default', column } = req.query;

      const tasks = column
        ? kanbanService.getTasksByColumn(boardId as string, column as string)
        : kanbanService.getTasks(boardId as string);

      res.json({ success: true, tasks });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Get task by ID
   * GET /api/kanban/tasks/:taskId
   */
  router.get('/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;

      const task = kanbanService.getTask(taskId);
      if (!task) {
        throw new CUIError('Task not found', 'NOT_FOUND');
      }

      res.json({ success: true, task });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Move task
   * PUT /api/kanban/tasks/:taskId/move
   */
  router.put('/tasks/:taskId/move', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const { targetColumn, targetPosition } = req.body;

      if (!targetColumn || targetPosition === undefined) {
        throw new CUIError('Target column and position are required', 'INVALID_REQUEST');
      }

      const task = kanbanService.moveTask({
        taskId,
        targetColumn,
        targetPosition,
      });

      logger.info('Task moved via API', { taskId, targetColumn });

      res.json({ success: true, task });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Update task metadata
   * PUT /api/kanban/tasks/:taskId/metadata
   */
  router.put('/tasks/:taskId/metadata', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const metadata = req.body;

      const task = kanbanService.updateTaskMetadata(taskId, metadata);

      logger.info('Task metadata updated via API', { taskId });

      res.json({ success: true, task });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Delete task
   * DELETE /api/kanban/tasks/:taskId
   */
  router.delete('/tasks/:taskId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;

      const deleted = kanbanService.deleteTask(taskId);
      if (!deleted) {
        throw new CUIError('Task not found', 'NOT_FOUND');
      }

      logger.info('Task deleted via API', { taskId });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Bulk operations
   * POST /api/kanban/tasks/bulk
   */
  router.post('/tasks/bulk', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { taskIds, operation, targetColumn, metadata } = req.body;

      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        throw new CUIError('Task IDs array is required', 'INVALID_REQUEST');
      }

      let result;
      if (operation === 'move') {
        result = kanbanService.bulkMoveTasks({ taskIds, operation, targetColumn });
      } else {
        throw new CUIError('Invalid bulk operation', 'INVALID_REQUEST');
      }

      res.json({ success: true, affected: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

### 3. Integrate into CUIServer (`/src/cui-server.ts`)

```typescript
// Add to imports
import { KanbanService } from './services/kanban-service';
import { createKanbanRoutes } from './routes/kanban.routes';

// Add to CUIServer class
export class CUIServer {
  // ... existing properties ...
  private kanbanService!: KanbanService;

  constructor(config: CUIServerConfig = {}) {
    // ... existing code ...

    // Initialize KanbanService (after sessionInfoService)
    this.kanbanService = new KanbanService(this.sessionInfoService.getDatabase());
    logger.info('KanbanService initialized');
  }

  private setupRoutes(): void {
    // ... existing routes ...

    // Kanban routes
    this.app.use('/api/kanban', createKanbanRoutes(this.kanbanService));
    logger.info('Kanban routes registered');
  }
}
```

---

## Frontend Implementation

### 1. Kanban Context (`/src/web/chat/contexts/KanbanContext.tsx`)

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { KanbanTask, KanbanColumnUI, KanbanBoardState } from '../types';

interface KanbanContextValue extends KanbanBoardState {
  createTask: (title: string, description: string, priority?: string) => Promise<KanbanTask>;
  assignTaskToAgent: (taskId: string) => Promise<void>;
  moveTask: (taskId: string, targetColumn: string, targetPosition: number) => Promise<void>;
  updateTaskStatus: (taskId: string, status: string) => void;
  refreshTasks: () => Promise<void>;
}

const KanbanContext = createContext<KanbanContextValue | null>(null);

export function KanbanProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<KanbanBoardState>({
    boards: [],
    activeBoard: null,
    columns: [
      { id: 'new', name: 'New', tasks: [], taskCount: 0 },
      { id: 'inprogress', name: 'In Progress', tasks: [], taskCount: 0 },
      { id: 'done', name: 'Done', tasks: [], taskCount: 0 },
    ],
    tasks: new Map(),
    loading: false,
    error: null,
  });

  // Fetch tasks from API
  const refreshTasks = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await api.getTasks();
      const tasks = response.tasks;

      // Organize tasks by column
      const columns = [
        { id: 'new', name: 'New', tasks: [], taskCount: 0 },
        { id: 'inprogress', name: 'In Progress', tasks: [], taskCount: 0 },
        { id: 'done', name: 'Done', tasks: [], taskCount: 0 },
      ];

      const taskMap = new Map<string, KanbanTask>();

      tasks.forEach((task: KanbanTask) => {
        taskMap.set(task.id, task);
        const column = columns.find(c => c.id === task.kanban_column);
        if (column) {
          column.tasks.push(task);
          column.taskCount++;
        }
      });

      // Sort tasks by position
      columns.forEach(col => {
        col.tasks.sort((a, b) => a.kanban_position - b.kanban_position);
      });

      setState(prev => ({
        ...prev,
        columns,
        tasks: taskMap,
        loading: false,
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to load tasks',
      }));
    }
  }, []);

  // Create new task
  const createTask = useCallback(async (
    title: string,
    description: string,
    priority: string = 'medium'
  ): Promise<KanbanTask> => {
    const response = await api.createTask({ title, description, priority });
    await refreshTasks();
    return response.task;
  }, [refreshTasks]);

  // Assign task to agent
  const assignTaskToAgent = useCallback(async (taskId: string) => {
    const task = state.tasks.get(taskId);
    if (!task) throw new Error('Task not found');

    // Start conversation with task description
    await api.startConversation({
      workingDirectory: task.workingDirectory || process.cwd(),
      initialPrompt: `${task.title}\n\n${task.description}`,
      kanbanMetadata: {
        taskId: task.id,
        priority: task.priority,
      },
    });

    // Move to "In Progress"
    await api.moveTask(taskId, 'inprogress', 0);
    await refreshTasks();
  }, [state.tasks, refreshTasks]);

  // Move task
  const moveTask = useCallback(async (
    taskId: string,
    targetColumn: string,
    targetPosition: number
  ) => {
    await api.moveTask(taskId, targetColumn, targetPosition);
    await refreshTasks();
  }, [refreshTasks]);

  // Update task status (from SSE events)
  const updateTaskStatus = useCallback((taskId: string, status: string) => {
    setState(prev => {
      const task = prev.tasks.get(taskId);
      if (!task) return prev;

      const updatedTask = { ...task, agentStatus: status };
      const newTasks = new Map(prev.tasks);
      newTasks.set(taskId, updatedTask);

      return { ...prev, tasks: newTasks };
    });
  }, []);

  // Load tasks on mount
  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const value: KanbanContextValue = {
    ...state,
    createTask,
    assignTaskToAgent,
    moveTask,
    updateTaskStatus,
    refreshTasks,
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

### Phase 1: Foundation (Week 1)

**Goal**: Basic Kanban board with task CRUD

- [ ] Extend SQLite schema with Kanban columns
- [ ] Create KanbanService with basic operations
- [ ] Create Kanban API routes
- [ ] Create frontend Kanban types
- [ ] Create KanbanContext for state management
- [ ] Build basic KanbanBoard component (no drag-drop yet)
- [ ] Build TaskCard component
- [ ] Build CreateTaskDialog component

**Deliverables:**
- Users can create tasks
- Tasks appear in "New" column
- Tasks can be clicked to view details

### Phase 2: Agent Integration (Week 2)

**Goal**: Assign tasks to agents and monitor progress

- [ ] Build AssignTaskDialog component
- [ ] Integrate with ClaudeProcessManager
- [ ] Link tasks to conversations (sessionId)
- [ ] Update ConversationStatusManager for task tracking
- [ ] Implement task status updates via SSE
- [ ] Build background execution support
- [ ] Add status indicators (active, paused, completed)

**Deliverables:**
- Users can assign tasks to agents
- Tasks move to "In Progress" when assigned
- Real-time status updates
- Background execution works

### Phase 3: Advanced Features (Week 3)

**Goal**: Drag-drop, filtering, and enhancements

- [ ] Install @dnd-kit for drag-and-drop
- [ ] Implement drag-drop reordering
- [ ] Add task filtering (priority, tags, status)
- [ ] Add task search
- [ ] Add bulk operations (assign multiple, move multiple)
- [ ] Add task priority visualization
- [ ] Add progress indicators (% complete)
- [ ] Desktop notifications for task completion

**Deliverables:**
- Full drag-and-drop Kanban board
- Advanced filtering and search
- Polished UI/UX

---

## Success Criteria

✅ **User can create tasks on Kanban board**
✅ **User can assign tasks to Claude agents**
✅ **Confirmation dialog shows task details before assignment**
✅ **Tasks can be assigned from Kanban board OR chat**
✅ **Agents work in background when chat is closed**
✅ **Real-time status updates across all views**
✅ **User can click task to view chat conversation**
✅ **Tasks automatically move between columns based on status**
✅ **System handles multiple concurrent agent tasks**
✅ **Full integration with existing conversation system**

---

## Next Steps

1. **Review this plan** with your team
2. **Set up development environment**
3. **Start with Phase 1**: Database schema + KanbanService
4. **Test backend APIs** with Postman/curl
5. **Build frontend components** incrementally
6. **Integrate with existing chat system**
7. **Add real-time updates**
8. **Polish UI/UX**

---

**Questions? Need clarification on any section?** Let me know and I'll provide more details!
