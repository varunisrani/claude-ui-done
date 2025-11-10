# CUI Server Kanban Integration - Analysis Documentation

## Overview

This directory contains comprehensive technical analysis for integrating a Kanban board into the CUI Server project. The analysis covers the existing architecture, design patterns, and provides a step-by-step implementation guide.

## Documents

### 1. **KANBAN_INTEGRATION_ANALYSIS.md** (23 KB, 804 lines)
**Comprehensive technical deep-dive**

The main analysis document covering:
- **Conversation Flow**: How conversations start, are tracked, and communicate with the backend
- **Database & Storage**: SQLite architecture and current schema design
- **Frontend Routing & State**: React Router setup and Context-based state management
- **Real-time Updates**: Server-Sent Events (SSE) architecture and StreamManager
- **API Structure**: Service injection patterns, route factories, and request/response handling
- **Integration Points**: Specific locations and patterns for Kanban implementation
- **Deployment**: Configuration and production considerations

**Best for**: Understanding the full architecture and how systems interact

### 2. **KANBAN_QUICK_REFERENCE.md** (13 KB, 466 lines)
**Quick lookup guide and patterns**

Organized reference including:
- **File Locations Table**: All key files with their purposes
- **Data Flow Diagrams**: Visual representations of conversation flow, metadata updates, and real-time updates
- **Database Schema**: Current and proposed Kanban schema
- **API Patterns**: Route creation, error handling, request/response patterns
- **Service Injection Pattern**: How services are instantiated and registered
- **Frontend Context Pattern**: How to create new contexts following existing patterns
- **Real-Time Integration**: Stream event types and usage
- **Key Statistics**: Overview of architecture scale

**Best for**: Quick lookups while coding, copy-paste reference patterns

### 3. **KANBAN_IMPLEMENTATION_CHECKLIST.md** (13 KB, 450 lines)
**Detailed implementation tasks and checklist**

Organized by phases:
- **Phase 1: Foundation & Setup** (Database, Service, Routes, Types)
- **Phase 2: Frontend** (Context, Components, Drag-Drop, Real-time)
- **Phase 3: Advanced Features** (Task Execution, Subtasks, Dependencies, Automation)
- **Testing**: Unit, integration, and component tests
- **Documentation, Security, Code Quality**: Full quality metrics
- **Success Criteria**: Measurable completion goals

**Best for**: Planning implementation, tracking progress, ensuring quality

## Quick Start

### For Understanding the Architecture
1. Start with: **KANBAN_QUICK_REFERENCE.md** (Data Flow Diagrams section)
2. Deep dive: **KANBAN_INTEGRATION_ANALYSIS.md** (sections 1-5)
3. Reference: **KANBAN_QUICK_REFERENCE.md** (File Locations & Patterns)

### For Implementation
1. Check: **KANBAN_QUICK_REFERENCE.md** (Existing Conversation Tab System)
2. Follow: **KANBAN_IMPLEMENTATION_CHECKLIST.md** (Phase 1)
3. Reference: **KANBAN_QUICK_REFERENCE.md** (API Patterns)
4. Code: Use specific file paths from quick reference

### For Specific Features
- Conversation Flow → **KANBAN_INTEGRATION_ANALYSIS.md** sections 1.1-1.4
- Database Design → **KANBAN_INTEGRATION_ANALYSIS.md** section 2 + **KANBAN_QUICK_REFERENCE.md** Database Schema
- State Management → **KANBAN_INTEGRATION_ANALYSIS.md** section 3 + **KANBAN_QUICK_REFERENCE.md** Frontend Context Pattern
- Real-time Updates → **KANBAN_INTEGRATION_ANALYSIS.md** section 4 + **KANBAN_QUICK_REFERENCE.md** Real-Time Integration
- API Routes → **KANBAN_INTEGRATION_ANALYSIS.md** section 5 + **KANBAN_QUICK_REFERENCE.md** API Patterns

## Key Findings

### Architecture Summary
- **Backend**: Express.js with 11 core services
- **Frontend**: React 18+ with Context-based state management
- **Database**: SQLite (better-sqlite3) with session metadata
- **Real-time**: Server-Sent Events (SSE) for live updates
- **Patterns**: Service injection, factory functions, context hooks

### Current Task Management
The project already has a task management system in the form of:
- Conversation-based tasks with status tracking
- Tab system (Tasks, History, Archive)
- SQLite session metadata storage
- Real-time status updates via SSE
- Drag-able task interactions (archiving, pinning)

### Kanban Integration Points
1. **Extend SessionInfoService** with Kanban metadata columns
2. **Create KanbanService** following existing service patterns
3. **Add Kanban Routes** in `/src/routes/` following conversation routes pattern
4. **Create KanbanContext** for state management
5. **Build UI Components** in `/src/web/chat/components/Kanban/`
6. **Integrate StreamManager** for real-time task updates

### Implementation Strategy
The analysis recommends a **3-phase approach**:
1. **Phase 1 (Foundation)**: Database schema, service layer, API routes
2. **Phase 2 (Frontend)**: Context, components, drag-drop, real-time
3. **Phase 3 (Advanced)**: Task execution, subtasks, dependencies, automation

Each phase builds on the previous, allowing for incremental delivery.

## File Reference Map

### Backend Core Files
| Component | Files | Key Classes |
|-----------|-------|------------|
| Main Server | `src/cui-server.ts` | `CUIServer` |
| Conversation Routes | `src/routes/conversation.routes.ts` | Route handlers |
| Session Data | `src/services/session-info-service.ts` | `SessionInfoService` |
| Status Tracking | `src/services/conversation-status-manager.ts` | `ConversationStatusManager` |
| Real-time Streaming | `src/services/stream-manager.ts` | `StreamManager` |
| Process Management | `src/services/claude-process-manager.ts` | `ClaudeProcessManager` |

### Frontend Core Files
| Component | Files | Key Exports |
|-----------|-------|------------|
| App Root | `src/web/App.tsx`, `src/web/chat/ChatApp.tsx` | App component |
| Conversation List | `src/web/chat/components/Home/Home.tsx` | Home component |
| State Management | `src/web/chat/contexts/ConversationsContext.tsx` | `useConversations()` |
| Real-time Status | `src/web/chat/contexts/StreamStatusContext.tsx` | `useStreamStatus()` |
| API Client | `src/web/chat/services/api.ts` | `api` service |
| Types | `src/web/chat/types/index.ts` | TypeScript interfaces |

### Type Definitions
| File | Contains |
|------|----------|
| `src/types/index.ts` | Backend types (ConversationSummary, StreamEvent, CUIError) |
| `src/web/chat/types/index.ts` | Frontend types (ChatMessage, StreamStatus, Preferences) |

## Integration Patterns Summary

### Service Creation Pattern
```typescript
// 1. Create service class in /src/services/
export class KanbanService {
  constructor(sessionInfoService: SessionInfoService, logger: Logger) {}
  // Implementation
}

// 2. Instantiate in CUIServer constructor (~line 113)
this.kanbanService = new KanbanService(...);

// 3. Pass to route factory (~line 500)
this.app.use('/api/kanban', createKanbanRoutes(this.kanbanService));
```

### Route Creation Pattern
```typescript
// File: /src/routes/kanban.routes.ts
export function createKanbanRoutes(kanbanService: KanbanService): Router {
  const router = Router();
  const logger = createLogger('KanbanRoutes');
  
  router.post('/boards', async (req, res, next) => {
    try {
      const result = await kanbanService.createBoard(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}
```

### Context Creation Pattern
```typescript
// File: /src/web/chat/contexts/KanbanContext.tsx
const KanbanContext = createContext<KanbanContextType | undefined>(undefined);

export function KanbanProvider({ children }: { children: ReactNode }) {
  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  
  const loadBoards = async () => {
    const data = await api.getBoards();
    setBoards(data);
  };
  
  return (
    <KanbanContext.Provider value={{ boards, loadBoards, ... }}>
      {children}
    </KanbanContext.Provider>
  );
}

export function useKanban() {
  const context = useContext(KanbanContext);
  if (!context) throw new Error('useKanban must be within KanbanProvider');
  return context;
}
```

## Database Schema Reference

### Current Sessions Table (Existing)
```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  custom_name TEXT,
  created_at TEXT,
  updated_at TEXT,
  version INTEGER,
  pinned INTEGER,
  archived INTEGER,
  continuation_session_id TEXT,
  initial_commit_head TEXT,
  permission_mode TEXT
);
```

### Proposed Kanban Extensions
Add columns to sessions table:
- `kanban_column`: Current Kanban column (todo/in-progress/review/done)
- `kanban_position`: Position within column for ordering
- `priority`: Task priority (low/medium/high)
- `assignee`: Task assignee (optional)
- `tags`: JSON array of tags

New tables needed:
- `kanban_boards`: Board definitions
- `task_board_mapping`: Link sessions to boards

## Testing Strategy

The project uses **Vitest** with mock Claude CLI. For Kanban:

### Unit Tests
- Service logic: `/tests/unit/kanban-service.test.ts`
- Route handlers: `/tests/unit/kanban-routes.test.ts`
- Context logic: `/tests/unit/kanban-context.test.ts`

### Integration Tests
- Full workflows: `/tests/integration/kanban-end-to-end.test.ts`
- Database operations: Integration with SessionInfoService
- Real-time updates: StreamManager integration

### Test Commands
```bash
npm test -- kanban-service.test.ts
npm run unit-tests -- --glob="**/kanban*"
npm run integration-tests
npm test:coverage
```

## Implementation Estimation

### Phase 1: Foundation (3-5 days)
- Database schema and migration
- KanbanService implementation
- Kanban API routes
- Unit tests

### Phase 2: Frontend (3-5 days)
- KanbanContext and hooks
- UI Components (Board, Column, Card)
- Drag-drop integration
- Real-time updates
- Component tests

### Phase 3: Advanced (3-7 days depending on features)
- Task execution linking
- Subtasks support
- Dependencies
- Automation rules
- Templates

**Total Estimate**: 1-2 weeks for full Phase 2 implementation

## Performance Considerations

### Database
- SessionInfoService uses prepared statements (good)
- Consider indexing on `session_id` and `kanban_column`
- Pagination for large boards (1000+ tasks)

### API
- Optimize bulk operations for multiple task updates
- Consider caching board metadata
- Rate limit reordering operations

### Frontend
- Virtual scrolling for large task lists
- Lazy load board details
- Debounce drag-drop save operations
- Memoize card components

## Security Checklist

- Input validation on all Kanban endpoints
- Sanitize board/task names (XSS prevention)
- Authorization checks (if multi-user support)
- Audit logging for modifications
- SQL injection prevention (use parameterized queries)

## Next Steps

1. **Review Architecture** (1-2 hours)
   - Read KANBAN_INTEGRATION_ANALYSIS.md sections 1-3
   - Run existing tests to understand patterns
   - Explore conversation routes code

2. **Design Database Schema** (1-2 hours)
   - Review current SessionInfoService schema
   - Design Kanban extensions
   - Plan migration strategy

3. **Implement Foundation** (3-5 days)
   - Follow Phase 1 checklist in KANBAN_IMPLEMENTATION_CHECKLIST.md
   - Use patterns from KANBAN_QUICK_REFERENCE.md

4. **Build Frontend** (3-5 days)
   - Follow Phase 2 checklist
   - Reference React patterns in quick reference

5. **Test & Deploy** (ongoing)
   - Follow testing strategy
   - Continuous integration
   - Performance monitoring

## Questions to Ask

When implementing, refer to these documents:

**"How do I create a new service?"** 
→ See KANBAN_QUICK_REFERENCE.md "Service Injection Pattern"

**"How do I add a new API route?"**
→ See KANBAN_QUICK_REFERENCE.md "API Patterns to Follow"

**"How do I manage state in React?"**
→ See KANBAN_QUICK_REFERENCE.md "Frontend Context Pattern"

**"What's the database schema?"**
→ See KANBAN_QUICK_REFERENCE.md "Database Schema"

**"How does real-time updating work?"**
→ See KANBAN_INTEGRATION_ANALYSIS.md section 4 + KANBAN_QUICK_REFERENCE.md "Real-Time Integration"

**"What error handling pattern should I follow?"**
→ See KANBAN_QUICK_REFERENCE.md "Error Handling Pattern"

**"How do I structure tests?"**
→ See KANBAN_INTEGRATION_ANALYSIS.md section 8 or KANBAN_IMPLEMENTATION_CHECKLIST.md "Testing"

## Additional Resources

- **Main Project**: CUI Server at `/home/user/claude-ui-done`
- **Tests**: See `/tests` directory for examples
- **Configuration**: See `CLAUDE.md` for testing architecture
- **Dependencies**: Check `package.json` for frameworks (React 18+, Express.js, TypeScript)

## Document Maintenance

These analysis documents should be updated when:
- Architecture changes significantly
- New services are added
- Route patterns change
- Database schema is modified
- New testing patterns are established

## Conclusion

The CUI Server has a well-structured, extensible architecture that provides excellent patterns for Kanban integration. The existing task management system (conversations) can be seamlessly extended with Kanban boards while maintaining compatibility and leveraging the established service injection, context-based state management, and SSE real-time update patterns.

Start with the foundation phase (database and service layer), move to frontend implementation, and progressively add advanced features based on requirements.

---

**Last Updated**: November 10, 2024
**Analysis Scope**: CUI Server v0.6.3
**Frontend**: React 18+, TypeScript
**Backend**: Express.js, TypeScript
**Database**: SQLite (better-sqlite3)
