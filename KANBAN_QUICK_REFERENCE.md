# Kanban Board Integration - Quick Reference

## File Locations - Key Files to Review

### Backend Architecture (Express.js)

| File | Purpose | Key Classes/Functions |
|------|---------|----------------------|
| `/src/cui-server.ts` | Main server initialization | `CUIServer` class, service setup |
| `/src/routes/conversation.routes.ts` | Conversation API routes | `createConversationRoutes()` |
| `/src/services/session-info-service.ts` | SQLite session metadata | `SessionInfoService` class |
| `/src/services/conversation-status-manager.ts` | Active session tracking | `ConversationStatusManager` |
| `/src/services/stream-manager.ts` | Server-Sent Events (SSE) | `StreamManager` class |
| `/src/services/claude-process-manager.ts` | Claude CLI process mgmt | `ClaudeProcessManager` |
| `/src/services/notification-service.ts` | Push notifications | `NotificationService` |
| `/src/middleware/auth.ts` | Authentication | Bearer token validation |
| `/src/middleware/error-handler.ts` | Error handling | `CUIError` class |

### Frontend Architecture (React)

| File | Purpose | Key Components/Hooks |
|------|---------|----------------------|
| `/src/web/App.tsx` | Root app component | React Router setup |
| `/src/web/chat/ChatApp.tsx` | Chat app router | Provider setup |
| `/src/web/chat/components/Home/Home.tsx` | Home/task list view | Task tab system |
| `/src/web/chat/components/Home/TaskTabs.tsx` | Tab selector | Tab navigation |
| `/src/web/chat/components/Home/TaskList.tsx` | Task list display | Conversation cards |
| `/src/web/chat/components/Home/TaskItem.tsx` | Single task card | Task rendering |
| `/src/web/chat/contexts/ConversationsContext.tsx` | Conversations state | `useConversations()` hook |
| `/src/web/chat/contexts/StreamStatusContext.tsx` | Real-time stream status | `useStreamStatus()` hook |
| `/src/web/chat/services/api.ts` | API client | API methods |
| `/src/web/chat/types/index.ts` | Type definitions | TypeScript interfaces |

### Types & Models

| File | Key Types |
|------|-----------|
| `/src/types/index.ts` | `ConversationSummary`, `ConversationMessage`, `StreamEvent`, `CUIError` |
| `/src/web/chat/types/index.ts` | `ChatMessage`, `StreamStatus`, `Preferences` |

---

## Data Flow Diagrams

### Conversation Start Flow

```
Frontend (Home.tsx)
    ↓
api.startConversation()
    ↓
POST /api/conversations/start
    ↓
createConversationRoutes (conversation.routes.ts)
    ↓
processManager.startConversation()
    ↓
Spawn Claude CLI process
    ↓
StreamManager.addClient() / broadcast()
    ↓
GET /api/stream/{streamingId} (SSE)
    ↓
Frontend EventSource listener
    ↓
StreamStatusContext update
    ↓
React re-render (ConversationView)
```

### Session Metadata Update Flow

```
Frontend (TaskItem.tsx)
    ↓
api.updateSession(sessionId, updates)
    ↓
PUT /api/conversations/:sessionId/update
    ↓
sessionInfoService.updateSessionInfo()
    ↓
SQLite update (session_id = ?)
    ↓
Return updated SessionInfo
    ↓
Frontend reloads conversations
```

### Real-time Status Update Flow

```
Claude CLI outputs JSONL
    ↓
ProcessManager receives stdout
    ↓
JsonLinesParser.parseLine()
    ↓
ProcessManager emits 'claude-message'
    ↓
CUIServer forwards to StreamManager
    ↓
StreamManager.broadcast(streamingId, event)
    ↓
SSE clients receive event
    ↓
StreamStatusContext receives via EventSource
    ↓
mapStreamEventToStatus() converts to StreamStatus
    ↓
React components update (live status pulse)
```

---

## Database Schema

### Current Sessions Table

```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  custom_name TEXT DEFAULT '',
  created_at TEXT,
  updated_at TEXT,
  version INTEGER,
  pinned INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  continuation_session_id TEXT DEFAULT '',
  initial_commit_head TEXT DEFAULT '',
  permission_mode TEXT DEFAULT 'default'
);
```

### Proposed Kanban Extensions

```sql
-- Add to sessions table:
ALTER TABLE sessions ADD COLUMN kanban_column TEXT DEFAULT 'todo';
ALTER TABLE sessions ADD COLUMN kanban_position INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN priority TEXT DEFAULT 'medium';
ALTER TABLE sessions ADD COLUMN assignee TEXT DEFAULT '';
ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT '[]';

-- New table for Kanban boards:
CREATE TABLE kanban_boards (
  board_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  columns JSON NOT NULL
);

-- Junction table for tasks to boards:
CREATE TABLE task_board_mapping (
  session_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  kanban_column TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (session_id, board_id),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id),
  FOREIGN KEY (board_id) REFERENCES kanban_boards(board_id)
);
```

---

## API Patterns to Follow

### Route Creation Pattern

**Location**: `/src/routes/conversation.routes.ts` (see lines 24-31)

```typescript
export function createConversationRoutes(
  processManager: ClaudeProcessManager,
  historyReader: ClaudeHistoryReader,
  statusTracker: ConversationStatusManager,
  sessionInfoService: SessionInfoService,
  conversationStatusManager: ConversationStatusManager,
  toolMetricsService: ToolMetricsService
): Router {
  const router = Router();
  const logger = createLogger('ConversationRoutes');
  
  // Define routes
  router.post('/start', async (req, res, next) => {
    try {
      // Validate input
      // Call services
      // Return response
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}
```

### Error Handling Pattern

**Location**: `/src/types/index.ts` (see lines 195-200)

```typescript
throw new CUIError('VALIDATION_FAILED', 'Invalid input provided', 400);
throw new CUIError('NOT_FOUND', 'Resource not found', 404);
throw new CUIError('SERVER_ERROR', 'Internal server error', 500);
```

### Request/Response Pattern

**Frontend**:
```typescript
// In `/src/web/chat/services/api.ts`
async getConversations(params?: ConversationListQuery): Promise<{ 
  conversations: ConversationSummary[]; 
  total: number 
}> {
  return this.apiCall(`/api/conversations?${searchParams}`);
}
```

**Backend**:
```typescript
router.get('/', async (req, res, next) => {
  try {
    const result = await historyReader.listConversations(req.query);
    res.json({
      conversations: result.conversations,
      total: result.total
    });
  } catch (error) {
    next(error);
  }
});
```

---

## Service Injection Pattern

**Location**: `/src/cui-server.ts` (see lines 453-505)

All services are:
1. Instantiated in CUIServer constructor (lines 98-120)
2. Passed to route factories (lines 478-492)
3. Available within route handlers

**New Kanban Service would be**:
```typescript
// In constructor (line ~113)
this.kanbanService = new KanbanService(sessionInfoService, logger);

// In setupRoutes() (line ~500)
this.app.use('/api/kanban', createKanbanRoutes(this.kanbanService));
```

---

## Frontend Context Pattern

**Location**: `/src/web/chat/contexts/ConversationsContext.tsx`

```typescript
const ConversationsContext = createContext<ConversationsContextType | undefined>(undefined);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<ConversationSummaryWithLiveStatus[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Load and mutation operations
  const loadConversations = async (limit?: number, filters?: any) => {
    setLoading(true);
    try {
      const data = await api.getConversations({ limit, ...filters });
      setConversations(data.conversations);
    } catch (err) {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <ConversationsContext.Provider value={{ conversations, loading, loadConversations, ... }}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations() {
  const context = useContext(ConversationsContext);
  if (!context) throw new Error('useConversations must be used within ConversationsProvider');
  return context;
}
```

**For Kanban**, create similar:
```typescript
// /src/web/chat/contexts/KanbanContext.tsx
export function useKanban() { ... }
export function KanbanProvider() { ... }
```

---

## Real-Time Update Integration

### Current Stream Event Types

**Location**: `/src/types/index.ts` (lines 183-192)

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

### For Kanban Task Updates

Add new stream event types:
```typescript
| { type: 'task_started'; taskId: string; timestamp: string }
| { type: 'task_progress'; taskId: string; status: string; progress: number; timestamp: string }
| { type: 'task_completed'; taskId: string; result: string; timestamp: string }
```

### StreamManager Usage

**Location**: `/src/services/stream-manager.ts`

```typescript
// Broadcasting updates
streamManager.broadcast(streamingId, {
  type: 'task_progress',
  taskId: sessionId,
  status: 'Running',
  progress: 45,
  timestamp: new Date().toISOString()
});
```

---

## Existing Conversation Tab System

**Current Implementation** (in `/src/web/chat/components/Home/Home.tsx`):

```typescript
const activeTab = 'tasks' | 'history' | 'archive';

const getFiltersForTab = (tab) => {
  switch (tab) {
    case 'tasks':
      return { archived: false, hasContinuation: false };
    case 'history':
      return { hasContinuation: true };
    case 'archive':
      return { archived: true, hasContinuation: false };
  }
};

// Can extend with 'kanban' tab:
case 'kanban':
  return { board_id: selectedBoardId };
```

---

## Testing Architecture

**Location**: `/CLAUDE.md` in project root

Key patterns:
- Mock Claude CLI: `/tests/__mocks__/claude`
- Test structure: `tests/unit/`, `tests/integration/`
- Silent logging: `LOG_LEVEL=silent`
- Random ports for server tests

**Commands**:
```bash
npm test -- [file]              # Run specific test
npm run unit-tests              # Run unit tests only
npm run integration-tests       # Run integration tests
npm test:coverage              # Run with coverage
```

---

## Configuration & Deployment

**Config Location**: `~/.cui/config.json`

**Managed by**: `/src/services/config-service.ts`

**For Kanban, extend config**:
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

## Key Statistics

- **Total Backend Services**: 11
- **Frontend Contexts**: 3 (Conversations, StreamStatus, Preferences)
- **Current Conversation Routes**: 7 endpoints
- **Frontend Components**: 30+ components
- **Database Tables**: 2 (sessions, metadata)
- **Real-time Protocol**: Server-Sent Events (SSE)
- **Frontend Framework**: React 18+ with TypeScript
- **Backend Framework**: Express.js with TypeScript

---

## Next Steps for Implementation

1. **Understand Current Flow**:
   - Read `/src/routes/conversation.routes.ts` (start/stop flow)
   - Read `/src/services/session-info-service.ts` (SQLite operations)
   - Read `/src/web/chat/contexts/ConversationsContext.tsx` (state management)

2. **Create Kanban Service**:
   - Extend SessionInfoService with kanban tables
   - Create `/src/services/kanban-service.ts`
   - Add board and task operations

3. **Create Kanban Routes**:
   - Create `/src/routes/kanban.routes.ts`
   - Follow conversation.routes pattern
   - Register in setupRoutes()

4. **Create Frontend Context**:
   - Create `/src/web/chat/contexts/KanbanContext.tsx`
   - Implement board and task operations
   - Integrate with StreamStatusContext

5. **Create UI Components**:
   - `/src/web/chat/components/Kanban/KanbanBoard.tsx`
   - `/src/web/chat/components/Kanban/KanbanColumn.tsx`
   - `/src/web/chat/components/Kanban/KanbanCard.tsx`
   - Add route: `/kanban` or tab in Home

6. **Add Real-time Updates**:
   - Extend StreamEvent types
   - Create TaskExecutor service
   - Broadcast task status changes

7. **Testing**:
   - Create `/tests/unit/kanban-service.test.ts`
   - Create `/tests/integration/kanban-routes.test.ts`
   - Follow existing patterns from conversation tests

