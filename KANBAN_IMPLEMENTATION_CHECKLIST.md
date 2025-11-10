# Kanban Board Implementation Checklist

## Phase 1: Foundation & Setup

### Database Schema
- [ ] Extend SessionInfoService with Kanban columns
- [ ] Add migration script for existing databases
- [ ] Create kanban_boards table
- [ ] Create task_board_mapping junction table
- [ ] Create subtasks table (optional phase 2)
- [ ] Add database schema version check

**Files to Modify**:
- `/src/services/session-info-service.ts` - Add new tables and statements

### Backend Service Layer
- [ ] Create `/src/services/kanban-service.ts`
- [ ] Implement board CRUD operations
- [ ] Implement task movement/reordering logic
- [ ] Implement bulk operations
- [ ] Add comprehensive logging with createLogger()
- [ ] Add error handling using CUIError

**Interface to Implement**:
```typescript
export class KanbanService {
  // Board operations
  createBoard(name: string, columns?: string[])
  getBoard(boardId: string)
  updateBoard(boardId: string, updates: Partial<KanbanBoard>)
  deleteBoard(boardId: string)
  listBoards()
  
  // Task operations
  moveTask(sessionId: string, boardId: string, columnId: string, position: number)
  updateTaskMetadata(sessionId: string, metadata: Partial<KanbanTaskMetadata>)
  getTaskMetadata(sessionId: string)
  bulkMoveTask(sessionIds: string[], targetColumn: string)
  bulkUpdateTasks(sessionIds: string[], metadata: Partial<KanbanTaskMetadata>)
}
```

### Backend API Routes
- [ ] Create `/src/routes/kanban.routes.ts`
- [ ] Implement board routes (CRUD)
- [ ] Implement task routes (move, reorder, update)
- [ ] Implement bulk operations
- [ ] Add proper request validation
- [ ] Add authorization checks
- [ ] Register routes in `CUIServer.setupRoutes()`

**Routes to Create**:
```
GET    /api/kanban/boards
POST   /api/kanban/boards
GET    /api/kanban/boards/:boardId
PUT    /api/kanban/boards/:boardId
DELETE /api/kanban/boards/:boardId

PUT    /api/kanban/tasks/:taskId/move
PUT    /api/kanban/tasks/:taskId/metadata
POST   /api/kanban/tasks/bulk-move
POST   /api/kanban/tasks/bulk-update
```

### CUIServer Integration
- [ ] Instantiate KanbanService in constructor
- [ ] Pass to kanban route factory
- [ ] Register kanban routes in setupRoutes()
- [ ] Add logging for service initialization

**Changes in `/src/cui-server.ts`**:
- Line ~113: Add `this.kanbanService = new KanbanService(...)`
- Line ~500: Add `this.app.use('/api/kanban', createKanbanRoutes(this.kanbanService));`

### Types & Interfaces
- [ ] Add Kanban types to `/src/types/index.ts`
- [ ] Add frontend Kanban types to `/src/web/chat/types/index.ts`
- [ ] Update StreamEvent type with task events
- [ ] Ensure backward compatibility

**Types to Add**:
```typescript
interface KanbanBoard {
  board_id: string;
  name: string;
  columns: KanbanColumn[];
  created_at: string;
  updated_at: string;
}

interface KanbanColumn {
  id: string;
  name: string;
  position: number;
  taskIds: string[];
}

interface KanbanTaskMetadata {
  kanban_column?: string;
  kanban_position?: number;
  priority?: 'low' | 'medium' | 'high';
  assignee?: string;
  tags?: string[];
}

// Extend SessionInfo to include kanban fields
interface KanbanTask extends ConversationSummary {
  kanban_column: string;
  kanban_position: number;
  priority: 'low' | 'medium' | 'high';
  assignee?: string;
  tags: string[];
}

// Stream events
interface TaskProgressEvent extends StreamEvent {
  type: 'task_progress';
  taskId: string;
  status: string;
  progress: number;
}
```

---

## Phase 2: Frontend Implementation

### Frontend Types & API Integration
- [ ] Add Kanban types to `/src/web/chat/types/index.ts`
- [ ] Extend API service with Kanban methods in `/src/web/chat/services/api.ts`
- [ ] Add API request/response handling

**API Methods to Add**:
```typescript
async createBoard(name: string): Promise<KanbanBoard>
async getBoards(): Promise<KanbanBoard[]>
async getBoard(boardId: string): Promise<KanbanBoard>
async updateBoard(boardId: string, updates: Partial<KanbanBoard>): Promise<KanbanBoard>
async deleteBoard(boardId: string): Promise<{ success: boolean }>

async moveTask(taskId: string, boardId: string, columnId: string, position: number): Promise<void>
async updateTaskMetadata(taskId: string, metadata: Partial<KanbanTaskMetadata>): Promise<void>
async bulkMoveTask(taskIds: string[], targetColumn: string): Promise<void>
async bulkUpdateTasks(taskIds: string[], metadata: Partial<KanbanTaskMetadata>): Promise<void>
```

### Frontend State Management
- [ ] Create `/src/web/chat/contexts/KanbanContext.tsx`
- [ ] Implement board operations
- [ ] Implement task operations
- [ ] Integrate with ConversationsContext
- [ ] Integrate with StreamStatusContext
- [ ] Handle loading/error states

**Context Interface**:
```typescript
interface KanbanContextType {
  boards: KanbanBoard[];
  selectedBoard: KanbanBoard | null;
  loading: boolean;
  error: string | null;
  
  // Board operations
  loadBoards(): Promise<void>
  createBoard(name: string): Promise<void>
  updateBoard(boardId: string, updates: Partial<KanbanBoard>): Promise<void>
  deleteBoard(boardId: string): Promise<void>
  selectBoard(boardId: string): void
  
  // Task operations
  moveTask(taskId: string, columnId: string, position: number): Promise<void>
  updateTaskMetadata(taskId: string, metadata: Partial<KanbanTaskMetadata>): Promise<void>
  bulkMove(taskIds: string[], columnId: string): Promise<void>
}
```

### Frontend Components - Kanban Board
- [ ] Create `/src/web/chat/components/Kanban/KanbanBoard.tsx` (main container)
- [ ] Create `/src/web/chat/components/Kanban/KanbanColumn.tsx` (column)
- [ ] Create `/src/web/chat/components/Kanban/KanbanCard.tsx` (task card)
- [ ] Create `/src/web/chat/components/Kanban/CreateBoardDialog.tsx`
- [ ] Create `/src/web/chat/components/Kanban/TaskDetailsModal.tsx`

**KanbanBoard Props**:
```typescript
interface KanbanBoardProps {
  board: KanbanBoard;
  onTaskMove: (taskId: string, columnId: string, position: number) => void;
  onTaskClick: (taskId: string) => void;
  onColumnAdd: (columnName: string) => void;
  onBoardUpdate: (updates: Partial<KanbanBoard>) => void;
  tasks: KanbanTask[];
}
```

### Frontend Components - Integration
- [ ] Update `/src/web/chat/components/Home/Home.tsx` to include Kanban tab
- [ ] Update `/src/web/chat/components/Home/TaskTabs.tsx` to add 'kanban' tab
- [ ] Create Kanban route: `GET /kanban` or add as tab in Home
- [ ] Ensure responsive design for mobile

### Drag & Drop
- [ ] Install drag-drop library (react-beautiful-dnd or dnd-kit)
- [ ] Implement drag handlers in KanbanColumn
- [ ] Handle drop events with API calls
- [ ] Add visual feedback during drag
- [ ] Implement undo/rollback on error

### Real-Time Updates Integration
- [ ] Extend StreamStatusContext to handle task events
- [ ] Add task progress visualization
- [ ] Display live status in KanbanCard
- [ ] Handle task completion events
- [ ] Update board when task status changes via stream

---

## Phase 3: Advanced Features

### Task Execution Integration
- [ ] Create `/src/services/task-executor-service.ts`
- [ ] Link task execution to board status
- [ ] Create background job management
- [ ] Implement task pause/resume
- [ ] Implement task cancellation

### Subtasks Support
- [ ] Create subtask schema in database
- [ ] Add subtask operations to KanbanService
- [ ] Add subtask UI components
- [ ] Handle subtask progress in parent task
- [ ] Display subtask metrics in Kanban

### Task Dependencies
- [ ] Add task dependency schema
- [ ] Implement dependency validation
- [ ] Prevent moving blocked tasks
- [ ] Show dependency warnings
- [ ] Visualize dependency graph

### Automation & Rules
- [ ] Create rule engine service
- [ ] Implement auto-move rules (e.g., on completion)
- [ ] Implement auto-assign rules
- [ ] Add webhook support for external triggers
- [ ] Create rule management UI

### Board Templates
- [ ] Create template service
- [ ] Implement template UI
- [ ] Allow custom templates
- [ ] Save board as template
- [ ] Clone from template

---

## Testing

### Unit Tests
- [ ] `/tests/unit/kanban-service.test.ts` - Service logic
- [ ] `/tests/unit/kanban-routes.test.ts` - API endpoints
- [ ] `/tests/unit/kanban-context.test.ts` - Frontend state
- [ ] Test board CRUD operations
- [ ] Test task movements
- [ ] Test error scenarios
- [ ] Mock database calls

### Integration Tests
- [ ] `/tests/integration/kanban-end-to-end.test.ts`
- [ ] Test full workflow: create board → add tasks → move tasks
- [ ] Test real-time updates
- [ ] Test concurrent operations
- [ ] Test database consistency

### Component Tests
- [ ] Test KanbanBoard rendering
- [ ] Test KanbanCard interactions
- [ ] Test drag-drop functionality
- [ ] Test error handling UI
- [ ] Test responsive behavior

**Test Commands**:
```bash
npm test -- kanban-service.test.ts
npm test -- kanban-routes.test.ts
npm test -- kanban-context.test.ts
npm run unit-tests -- --glob="**/kanban*"
npm run integration-tests -- kanban-end-to-end.test.ts
npm test:coverage
```

---

## Documentation

- [ ] Update README with Kanban feature overview
- [ ] Create Kanban user guide
- [ ] Document API endpoints
- [ ] Document context API
- [ ] Add architecture diagram
- [ ] Add UI/UX guidelines
- [ ] Create troubleshooting guide

---

## Deployment & Configuration

### Configuration
- [ ] Add kanban config to ConfigService
- [ ] Create default config options
- [ ] Add environment variables for Kanban
- [ ] Document configuration options
- [ ] Test config hot-reload

**Config Options**:
```json
{
  "kanban": {
    "enabled": true,
    "defaultColumns": ["todo", "in-progress", "review", "done"],
    "enableSubtasks": true,
    "enableTags": true,
    "enableDependencies": false,
    "maxBoardsPerUser": 10,
    "maxTasksPerBoard": 1000
  }
}
```

### Migration
- [ ] Create database migration script
- [ ] Test on existing installations
- [ ] Backup strategy
- [ ] Rollback plan
- [ ] Version management

### Performance
- [ ] Profile database queries
- [ ] Implement query caching
- [ ] Add pagination for large boards
- [ ] Optimize SSE updates
- [ ] Load testing

---

## Code Quality

- [ ] Follow existing code patterns
- [ ] Use consistent naming conventions
- [ ] Add TypeScript strict mode
- [ ] Comprehensive error handling
- [ ] Input validation on all endpoints
- [ ] Rate limiting for API endpoints
- [ ] Logging throughout service
- [ ] JSDoc comments for public APIs

---

## Security

- [ ] Validate all user inputs
- [ ] Sanitize board/task names
- [ ] Implement permission checks
- [ ] Audit logging
- [ ] SQL injection prevention (use parameterized queries)
- [ ] XSS protection in UI
- [ ] CSRF protection if needed
- [ ] Rate limit API endpoints

---

## Git Workflow

### Commit Guidelines
- [ ] Logical commits (one feature per commit)
- [ ] Clear commit messages
- [ ] Reference issue numbers
- [ ] Test before committing

**Example Commits**:
```
feat: add kanban board data model and schema
feat: implement kanban service with board operations
feat: create kanban routes with full REST API
feat: add KanbanContext for frontend state management
feat: build kanban board UI components
test: add comprehensive kanban service tests
docs: add kanban integration guide
```

### Branch Strategy
- Create feature branch: `kanban/board-operations`
- Keep commits clean and organized
- Request code review before merge
- Squash commits if needed for cleanliness

---

## Completion Checklist Summary

### Phase 1 (Foundation)
- [ ] Backend service complete
- [ ] Database schema ready
- [ ] API routes functional
- [ ] Types defined
- [ ] Unit tests passing
- [ ] Error handling solid

### Phase 2 (Frontend)
- [ ] Frontend types added
- [ ] API client methods added
- [ ] State context created
- [ ] Components built
- [ ] Real-time integration done
- [ ] Drag-drop working
- [ ] Component tests passing

### Phase 3 (Advanced)
- [ ] Task execution linked
- [ ] Subtasks supported
- [ ] Dependencies working
- [ ] Automation rules implemented
- [ ] Templates created
- [ ] All advanced tests passing

### Quality & Deployment
- [ ] All tests passing
- [ ] Code review completed
- [ ] Documentation written
- [ ] Performance optimized
- [ ] Security reviewed
- [ ] Migration tested
- [ ] Deployed to production

---

## Success Criteria

- [ ] Kanban board displays and functions correctly
- [ ] Drag-drop reordering works smoothly
- [ ] Real-time status updates visible
- [ ] All CRUD operations work
- [ ] No console errors
- [ ] Tests provide 80%+ coverage
- [ ] Performance is acceptable (< 500ms API responses)
- [ ] Mobile responsive design
- [ ] Accessibility compliance (WCAG 2.1 AA)
- [ ] Users prefer Kanban over list view (qualitative)

