# CUI Server - Kanban Board Integration Analysis

## Executive Summary
The CUI Server project is a comprehensive web-based agent platform built on Claude Code with a modern Express.js backend and React frontend. The architecture supports real-time conversation streaming, permission management, and extensible task management. Current implementation already has foundation for task management (conversations) that can be extended into a full Kanban board system.

---

## 1. CURRENT CONVERSATION FLOW

### 1.1 Starting a Conversation
**File**: `/home/user/claude-ui-done/src/routes/conversation.routes.ts` (lines 36-211)

**Entry Point**: `POST /api/conversations/start`

**Request Structure**:
```typescript
interface StartConversationRequest {
  workingDirectory: string;
  initialPrompt: string;
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
  systemPrompt?: string;
  permissionMode?: string;
  resumedSessionId?: string; // For resuming conversations
}
```

**Key Flow**:
1. Request validation (workingDirectory, initialPrompt required)
2. Permission mode validation ('acceptEdits', 'bypassPermissions', 'default', 'plan')
3. If resuming: fetch previous messages from history
4. Call `processManager.startConversation(config)` → returns `{streamingId, systemInit}`
5. Register session with ConversationStatusManager
6. Store permission mode in SessionInfoService
7. Return StartConversationResponse with streamingId and session metadata

**Response**:
```typescript
interface StartConversationResponse {
  streamingId: string;           // CUI internal streaming ID
  streamUrl: string;             // `/api/stream/{streamingId}`
  sessionId: string;             // Claude CLI session ID
  cwd: string;
  tools: string[];
  mcpServers: { name: string; status: string; }[];
  model: string;
  permissionMode: string;
  apiKeySource: string;
}
```

### 1.2 Conversation Status Tracking
**File**: `/home/user/claude-ui-done/src/services/conversation-status-manager.ts`

**Key Responsibilities**:
- Track active streaming sessions and Claude session IDs
- Store conversation context (initialPrompt, workingDirectory, model, timestamp)
- Generate optimistic UI summaries for active conversations
- Emit session lifecycle events

**Core Methods**:
```typescript
registerActiveSession(streamingId, claudeSessionId, conversationContext?)
unregisterActiveSession(streamingId)
getConversationContext(claudeSessionId)
isSessionActive(claudeSessionId)
getConversationStatus(claudeSessionId) // 'completed' | 'ongoing' | 'pending'
getConversationsNotInHistory(existingSessionIds) // Optimistic conversations
getActiveConversationDetails(sessionId)
```

**Data Structure**:
```typescript
interface ConversationStatusContext {
  initialPrompt: string;
  workingDirectory: string;
  model: string;
  timestamp: string;
  inheritedMessages?: ConversationMessage[]; // For resumed sessions
}
```

### 1.3 Chat Interface to Backend Flow
**Frontend Files**: 
- `/home/user/claude-ui-done/src/web/chat/ChatApp.tsx` - Main app router
- `/home/user/claude-ui-done/src/web/chat/components/ConversationView/ConversationView.tsx` - View component
- `/home/user/claude-ui-done/src/web/chat/components/Home/Home.tsx` - Home/task list

**Frontend API Service**: `/home/user/claude-ui-done/src/web/chat/services/api.ts`

**Key Methods**:
```typescript
// Start conversation
async startConversation(request: StartConversationRequest): Promise<StartConversationResponse>

// Get conversations list
async getConversations(params?: {
  limit?: number;
  offset?: number;
  projectPath?: string;
  hasContinuation?: boolean;
  archived?: boolean;
  pinned?: boolean;
}): Promise<{ conversations: ConversationSummary[]; total: number }>

// Get conversation details
async getConversationDetails(sessionId: string): Promise<ConversationDetailsResponse>

// Stop conversation
async stopConversation(streamingId: string): Promise<{ success: boolean }>

// Update session metadata
async updateSession(sessionId: string, updates: Partial<SessionInfo>)
```

### 1.4 Data Flow: User Input → Claude CLI → Response

```
User Input (Home/ConversationView)
         ↓
   API Call: POST /api/conversations/start
         ↓
   ClaudeProcessManager.startConversation()
         ↓
   Spawn Claude CLI process with JSON stream
         ↓
   StreamManager broadcasts to SSE clients
         ↓
   Frontend receives via EventSource stream
         ↓
   React state updated → UI refresh
```

**Real-time Update Chain**:
1. ProcessManager spawns Claude CLI process
2. Claude outputs JSONL (JSON Lines) stream
3. JsonLinesParser parses stream
4. ProcessManager emits 'claude-message' event
5. StreamManager broadcasts to all connected SSE clients
6. Frontend receives via EventSource
7. StreamStatusContext updates state
8. React re-renders components

---

## 2. DATABASE & STORAGE

### 2.1 SQLite Backend
**File**: `/home/user/claude-ui-done/src/services/session-info-service.ts`

**Location**: `~/.cui/session-info.db`

**Technology**: `better-sqlite3` (synchronous SQLite wrapper)

### 2.2 Schema

**Sessions Table**:
```sql
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  custom_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  continuation_session_id TEXT NOT NULL DEFAULT '',
  initial_commit_head TEXT NOT NULL DEFAULT '',
  permission_mode TEXT NOT NULL DEFAULT 'default'
);
```

**Metadata Table**:
```sql
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### 2.3 SessionInfo Type
```typescript
interface SessionInfo {
  custom_name: string;
  created_at: string;
  updated_at: string;
  version: number;
  pinned: boolean;
  archived: boolean;
  continuation_session_id: string;
  initial_commit_head: string;
  permission_mode: string;
}
```

### 2.4 Key Operations

**SessionInfoService Methods**:
```typescript
// Get session info (creates if not exists)
async getSessionInfo(sessionId: string): Promise<SessionInfo>

// Update session info
async updateSessionInfo(sessionId: string, updates: Partial<SessionInfo>): Promise<SessionInfo>

// Custom name operations
async updateCustomName(sessionId: string, customName: string): Promise<SessionInfo>

// Archive operations
async archiveAllSessions(): Promise<number>

// Metadata operations
private setMetadata(key: string, value: string)
private getMetadata(key: string): string | null
```

### 2.5 Conversation History Storage
**File**: `/home/user/claude-ui-done/src/services/claude-history-reader.ts`

- Reads from local Claude history files (`~/.local/share/claude/conversations/`)
- **Not SQLite** - local directory-based storage
- Returns ConversationMessage[] arrays
- Provides metadata via getConversationMetadata()

---

## 3. FRONTEND ROUTING & STATE MANAGEMENT

### 3.1 React Router Setup
**File**: `/home/user/claude-ui-done/src/web/App.tsx`

```typescript
<Router>
  <Routes>
    <Route path="/*" element={<ChatApp />} />
    <Route path="/inspector" element={<InspectorApp />} />
  </Routes>
</Router>
```

**File**: `/home/user/claude-ui-done/src/web/chat/ChatApp.tsx`

```typescript
<ConversationsProvider>
  <StreamStatusProvider>
    <PreferencesProvider>
      <Routes>
        <Route path="/" element={<Layout><Home /></Layout>} />
        <Route path="/c/:sessionId" element={<Layout><ConversationView /></Layout>} />
      </Routes>
    </PreferencesProvider>
  </StreamStatusProvider>
</ConversationsProvider>
```

### 3.2 Context-Based State Management

#### ConversationsContext
**File**: `/home/user/claude-ui-done/src/web/chat/contexts/ConversationsContext.tsx`

**Manages**:
- List of conversations (with pagination)
- Recent working directories
- Loading/error states
- Conversation filtering (archived, pinned, continuation)

**Key Methods**:
```typescript
loadConversations(limit?, filters?)
loadMoreConversations()
getMostRecentWorkingDirectory()
```

**Current Tab System** (in Home.tsx):
```typescript
activeTab: 'tasks' | 'history' | 'archive'
// Tasks: archived=false, hasContinuation=false
// History: hasContinuation=true
// Archive: archived=true
```

#### StreamStatusContext
**File**: `/home/user/claude-ui-done/src/web/chat/contexts/StreamStatusContext.tsx`

**Manages**:
- Real-time stream status for each conversation
- Connection state (connecting/connected/disconnected/error)
- Current status messages
- Tool metrics

**Key Data**:
```typescript
interface StreamStatus {
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastEvent?: StreamEvent;
  lastEventTime?: string;
  currentStatus: string;
  toolMetrics?: ToolMetrics;
}
```

#### PreferencesContext
- Color scheme preferences
- Language settings
- Notification preferences

### 3.3 Component Hierarchy

```
App
├── Login (if not authenticated)
└── Router
    └── ChatApp
        ├── PreferencesProvider
        ├── StreamStatusProvider
        └── ConversationsProvider
            ├── Home
            │   ├── Header
            │   ├── TaskTabs (tasks/history/archive)
            │   ├── TaskList
            │   │   └── TaskItem[] (each conversation)
            │   └── Composer (input)
            └── ConversationView (/c/:sessionId)
                ├── ConversationHeader
                ├── MessageList
                │   ├── MessageItem[]
                │   └── ToolRendering
                │       ├── TaskTool
                │       ├── BashTool
                │       ├── EditTool
                │       ├── WriteTool
                │       ├── ReadTool
                │       ├── DiffViewer
                │       ├── WebTool
                │       └── SearchTool
                └── Composer (input)
```

---

## 4. REAL-TIME UPDATES

### 4.1 StreamManager (Server-Sent Events)
**File**: `/home/user/claude-ui-done/src/services/stream-manager.ts`

**Protocol**: Server-Sent Events (SSE) over HTTP
**Endpoint**: `GET /api/stream/{streamingId}`

**Key Features**:
- Multiple clients per session (Set<Response>)
- Heartbeat every 30 seconds to keep connections alive
- Automatic cleanup on client disconnect
- Event broadcasting to all connected clients

**Methods**:
```typescript
addClient(streamingId: string, res: Response)
removeClient(streamingId: string, res: Response)
broadcast(streamingId: string, event: StreamEvent)
closeSession(streamingId: string)
getClientCount(streamingId: string): number
```

### 4.2 ConversationStatusManager Integration
**File**: `/home/user/claude-ui-done/src/cui-server.ts` (lines 507-639)

**Integration Points**:
1. ProcessManager emits 'claude-message' events
2. CUIServer forwards to StreamManager.broadcast()
3. StreamManager sends via SSE
4. Frontend receives and updates StreamStatusContext

**Event Flow**:
```
ProcessManager
  ├─ 'claude-message' event
  ├─ 'process-closed' event
  └─ 'process-error' event
        ↓
   StreamManager.broadcast()
        ↓
   SSE Event to clients
        ↓
   StreamStatusContext (frontend)
        ↓
   React Component Update
```

### 4.3 Stream Events
**File**: `/home/user/claude-ui-done/src/types/index.ts` (lines 183-192)

```typescript
type StreamEvent = 
  | { type: 'connected'; streaming_id: string; timestamp: string }
  | { type: 'permission_request'; data: PermissionRequest; streamingId: string; timestamp: string }
  | { type: 'error'; error: string; streamingId: string; timestamp: string }
  | { type: 'closed'; streamingId: string; timestamp: string }
  | SystemInitMessage
  | AssistantStreamMessage
  | UserStreamMessage
  | ResultStreamMessage;
```

### 4.4 Frontend Stream Subscription
**File**: `/home/user/claude-ui-done/src/web/chat/hooks/useMultipleStreams.ts`

- Manages multiple EventSource connections
- Handles reconnection with exponential backoff
- Max 5 concurrent connections
- Max 3 retries per connection

---

## 5. API STRUCTURE & PATTERNS

### 5.1 Route Creation Pattern
**File**: `/home/user/claude-ui-done/src/cui-server.ts` (lines 453-505)

**Pattern**:
```typescript
// Each route file exports a factory function
export function createConversationRoutes(
  processManager: ClaudeProcessManager,
  historyReader: ClaudeHistoryReader,
  statusTracker: ConversationStatusManager,
  sessionInfoService: SessionInfoService,
  conversationStatusManager: ConversationStatusManager,
  toolMetricsService: ToolMetricsService
): Router {
  const router = Router();
  // Define routes
  return router;
}

// Register in setupRoutes()
this.app.use('/api/conversations', createConversationRoutes(
  this.processManager,
  this.historyReader,
  this.statusTracker,
  this.sessionInfoService,
  this.conversationStatusManager,
  this.toolMetricsService
));
```

### 5.2 Service Injection
All services are instantiated in the CUIServer constructor and passed to route factories:

**Services Available**:
1. `ClaudeProcessManager` - Process management
2. `StreamManager` - Real-time streaming
3. `ClaudeHistoryReader` - History access
4. `ConversationStatusManager` - Status tracking
5. `PermissionTracker` - Permission management
6. `SessionInfoService` - Session metadata (SQLite)
7. `FileSystemService` - File operations
8. `ConfigService` - Configuration
9. `ToolMetricsService` - Metrics tracking
10. `NotificationService` - Notifications
11. `WebPushService` - Web push

### 5.3 Request/Response Pattern
**File**: `/home/user/claude-ui-done/src/middleware/error-handler.ts`

**Standard Response**:
```typescript
// Success
{ 
  success: true,
  data: T,
  ...additionalFields
}

// Error (handled by middleware)
{
  error: string,
  code: string,
  statusCode: number
}
```

**Request ID Tracking**:
All requests get a unique `requestId` via middleware for request tracing.

### 5.4 Authentication Middleware
**File**: `/home/user/claude-ui-done/src/middleware/auth.ts`

- Bearer token authentication
- Skippable for specific routes (system, permissions, notifications)
- Custom token override option via CLI

### 5.5 Error Handling
**File**: `/home/user/claude-ui-done/src/types/index.ts` (lines 195-200)

```typescript
export class CUIError extends Error {
  constructor(public code: string, message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'CUIError';
  }
}
```

**Usage Pattern**:
```typescript
throw new CUIError('MISSING_WORKING_DIRECTORY', 'workingDirectory is required', 400);
```

---

## 6. EXISTING CONVERSATION ROUTES

**File**: `/home/user/claude-ui-done/src/routes/conversation.routes.ts`

### Available Endpoints:

1. **POST /api/conversations/start**
   - Starts new conversation or resumes
   - Returns streamingId and sessionId

2. **GET /api/conversations**
   - Lists conversations with pagination
   - Query: limit, offset, projectPath, hasContinuation, archived, pinned, sortBy, order
   - Returns: conversations[], total count

3. **GET /api/conversations/:sessionId**
   - Gets conversation details
   - Returns: messages[], summary, projectPath, metadata

4. **POST /api/conversations/:streamingId/stop**
   - Stops an ongoing conversation
   - Returns: success boolean

5. **PUT /api/conversations/:sessionId/rename**
   - Renames session (legacy)
   - Body: { customName }

6. **PUT /api/conversations/:sessionId/update**
   - Updates session info
   - Body: { customName?, pinned?, archived?, permissionMode? }

7. **POST /api/conversations/archive-all**
   - Archives all non-archived sessions
   - Returns: archivedCount

---

## 7. KEY INTEGRATION POINTS FOR KANBAN BOARD

### 7.1 Task/Conversation Linking

**Current Data**:
- Each conversation has a `sessionId` (Claude CLI's session ID)
- SessionInfoService stores metadata in SQLite
- All metadata is already linked to sessionId

**For Kanban Integration**:
```typescript
interface TaskKanbanData {
  // Existing fields from ConversationSummary
  sessionId: string;
  status: 'todo' | 'in-progress' | 'review' | 'completed';
  
  // New Kanban fields
  kanban_board_id?: string; // Link to board
  kanban_column: string;    // Current column
  kanban_position: number;  // Position in column
  priority: 'low' | 'medium' | 'high';
  assignee?: string;
  tags: string[];
  subtasks?: { id: string; title: string; done: boolean }[];
}
```

**Schema Extension**:
```sql
-- Add to SessionInfoService
ALTER TABLE sessions ADD COLUMN kanban_column TEXT DEFAULT 'todo';
ALTER TABLE sessions ADD COLUMN kanban_position INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN priority TEXT DEFAULT 'medium';
ALTER TABLE sessions ADD COLUMN assignee TEXT DEFAULT '';
ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT '[]'; -- JSON array
```

### 7.2 Task Status Synchronization

**Mapping**:
```typescript
// Conversation status → Kanban column
'ongoing' → 'in-progress'
'completed' → 'completed'
'pending' → 'todo'

// StreamStatus → Visual feedback
connectionState: 'connected' → Blue pulse
connectionState: 'disconnected' → Gray
tool metrics → Show progress
```

### 7.3 Background Task Execution

**Current Pattern** (from Claude CLI):
```
startConversation() 
  → spawnProcess() 
  → StreamManager broadcasts updates
  → ProcessManager handles completion
```

**For Kanban**:
Create a TaskExecutor service:
```typescript
class KanbanTaskExecutor extends EventEmitter {
  async executeTask(taskId: string, config: ConversationConfig)
  async pauseTask(taskId: string)
  async resumeTask(taskId: string)
  async cancelTask(taskId: string)
  
  // Events
  on('task-started', (taskId) => {})
  on('task-progress', (taskId, progress) => {})
  on('task-completed', (taskId, result) => {})
  on('task-error', (taskId, error) => {})
}
```

### 7.4 Database Schema for Kanban

**Extend SessionInfoService**:
```typescript
// New table for Kanban boards
CREATE TABLE IF NOT EXISTS kanban_boards (
  board_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  columns JSON NOT NULL DEFAULT '[]'
);

// Junction table for task-to-board
CREATE TABLE IF NOT EXISTS task_board_mapping (
  session_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  kanban_column TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (session_id, board_id),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id),
  FOREIGN KEY (board_id) REFERENCES kanban_boards(board_id)
);
```

### 7.5 API Routes to Add

```typescript
// Kanban Board Routes
POST   /api/kanban/boards              - Create board
GET    /api/kanban/boards              - List boards
GET    /api/kanban/boards/:boardId     - Get board details
PUT    /api/kanban/boards/:boardId     - Update board
DELETE /api/kanban/boards/:boardId     - Delete board

// Task Management Routes
POST   /api/tasks                      - Create task
PUT    /api/tasks/:taskId              - Update task
GET    /api/tasks/:taskId              - Get task details
DELETE /api/tasks/:taskId              - Delete task

// Kanban Column Operations
PUT    /api/tasks/:taskId/move         - Move task to column
PUT    /api/tasks/:taskId/reorder      - Reorder within column

// Bulk Operations
POST   /api/tasks/bulk-move            - Move multiple tasks
POST   /api/tasks/bulk-update          - Update multiple tasks
```

### 7.6 Frontend Components Structure

```
KanbanBoard/
├── KanbanBoard.tsx           - Main board component
├── KanbanColumn.tsx          - Individual column
├── KanbanCard.tsx            - Task card
├── TaskModal.tsx             - Task detail modal
├── CreateTaskDialog.tsx      - New task creation
├── BoardSelector.tsx         - Switch between boards
├── KanbanContext.tsx         - State management
└── hooks/
    ├── useKanbanBoard.ts     - Board operations
    ├── useKanbanTasks.ts     - Task operations
    └── useDragDrop.ts        - Drag & drop handling
```

---

## 8. IMPLEMENTATION RECOMMENDATIONS

### Phase 1: Foundation
1. Create KanbanService (SQLite operations)
2. Add Kanban routes to Express
3. Create basic frontend Kanban component
4. Integrate with existing conversation system

### Phase 2: Features
1. Drag & drop (use react-beautiful-dnd or dnd-kit)
2. Task status sync with conversations
3. Real-time updates via StreamManager
4. Task creation from composer

### Phase 3: Advanced
1. Task dependencies
2. Subtasks
3. Board templates
4. Task automation rules

### Key Classes/Interfaces to Extend

**Frontend Types** (`/home/user/claude-ui-done/src/web/chat/types/index.ts`):
```typescript
export interface KanbanTask extends ConversationSummary {
  kanbanColumn: string;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  subtasks: Subtask[];
}

export interface KanbanBoard {
  id: string;
  name: string;
  columns: KanbanColumn[];
  tasks: KanbanTask[];
}
```

**Backend Services** (in `/home/user/claude-ui-done/src/services/`):
```typescript
// New file: kanban-service.ts
export class KanbanService {
  constructor(
    private db: Database,
    private sessionInfoService: SessionInfoService,
    private logger: Logger
  ) {}
  
  // Board operations
  createBoard(name: string): Promise<KanbanBoard>
  getBoard(boardId: string): Promise<KanbanBoard>
  updateBoard(boardId: string, updates: Partial<KanbanBoard>): Promise<void>
  deleteBoard(boardId: string): Promise<void>
  
  // Task operations
  moveTask(taskId: string, columnId: string, position: number): Promise<void>
  updateTaskMetadata(taskId: string, metadata: Partial<KanbanTask>): Promise<void>
}
```

---

## 9. CURRENT TOOL USAGE

The project already has a TaskTool component for displaying subtasks/nested messages:

**File**: `/home/user/claude-ui-done/src/web/chat/components/ToolRendering/tools/TaskTool.tsx`

This can be extended to show Kanban-like nested task structure.

---

## 10. DEPLOYMENT & CONFIGURATION

**Configuration Service**: `/home/user/claude-ui-done/src/services/config-service.ts`

**Config File**: `~/.cui/config.json`

**For Kanban**:
```json
{
  "kanban": {
    "enabled": true,
    "defaultColumns": ["todo", "in-progress", "review", "done"],
    "enableSubtasks": true,
    "enableTags": true
  }
}
```

---

## Conclusion

The CUI Server has a well-structured, extensible architecture that supports:
- Real-time streaming via SSE
- SQLite-backed persistent storage
- Clear service injection pattern
- Context-based state management in React
- Modular route and middleware system

A Kanban board integration would leverage these existing patterns while adding:
- Additional database schema for boards and task metadata
- New API routes following existing patterns
- Frontend context and components following React patterns
- Task execution and status synchronization using existing StreamManager

