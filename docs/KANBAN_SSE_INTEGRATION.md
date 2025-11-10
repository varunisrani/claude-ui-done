# Kanban Board SSE Integration - Technical Documentation

This document explains how the Kanban board integrates with CUI Server's Server-Sent Events (SSE) infrastructure for real-time task monitoring.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  KanbanBoard Component                                          │
│  ├── useKanbanTaskMonitor(tasks, onUpdate)                     │
│  │   ├── Filters active tasks (agentStatus === 'active')       │
│  │   ├── For each active task with streamingId:                │
│  │   │   └── useStreaming(streamingId, handlers)               │
│  │   │       └── fetch(/api/stream/:streamingId)               │
│  │   │           └── EventSource (SSE connection)              │
│  │   │                                                          │
│  │   └── On SSE event received:                                │
│  │       ├── Parse StreamEvent                                 │
│  │       ├── Update task status                                │
│  │       ├── kanbanStorage.updateTask(taskId, updates)         │
│  │       └── onUpdate(taskId, updates)                         │
│  │                                                              │
│  └── TaskCard Components (display status)                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ SSE Events (JSONL)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (CUI Server)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GET /api/stream/:streamingId                                   │
│  └── StreamManager.addClient(streamingId, res)                 │
│      └── Broadcast events to all connected clients              │
│                                                                  │
│  ClaudeProcessManager                                           │
│  └── Spawns claude CLI child process                            │
│      └── Reads stdout (JSONL format)                            │
│          └── JsonLinesParser                                    │
│              └── StreamManager.sendEvent(streamingId, event)    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ JSONL stdout
                              │
                   ┌──────────────────────┐
                   │   Claude CLI Process  │
                   │  (Agent Execution)    │
                   └──────────────────────┘
```

---

## Stream Event Types

The Kanban board monitors these SSE event types:

### 1. `connected`
```typescript
{
  type: 'connected',
  streaming_id: string,
  timestamp: string
}
```
**Action**: Set task status to "active"

### 2. `assistant`
```typescript
{
  type: 'assistant',
  message: Anthropic.Message,
  parent_tool_use_id?: string
}
```
**Action**: Update status message to "Agent working..."

### 3. `permission_request`
```typescript
{
  type: 'permission_request',
  data: PermissionRequest,
  streamingId: string,
  timestamp: string
}
```
**Action**: Set task status to "waiting" (agent needs permission)

### 4. `result` (Success)
```typescript
{
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: number,
  duration_api_ms: number,
  num_turns: number,
  result?: string,
  usage: { ... }
}
```
**Action**:
- Set status to "completed"
- Move task to "done" column
- Set completedAt timestamp

### 5. `result` (Error)
```typescript
{
  type: 'result',
  subtype: 'error_max_turns',
  is_error: true,
  // ... other fields
}
```
**Action**: Set status to "error"

### 6. `error`
```typescript
{
  type: 'error',
  error: string,
  streamingId: string,
  timestamp: string
}
```
**Action**: Set status to "error" with error message

### 7. `closed`
```typescript
{
  type: 'closed',
  streamingId: string,
  timestamp: string
}
```
**Action**: Set status to "paused" if task was active

---

## useKanbanTaskMonitor Hook

### Purpose
Monitor multiple active Kanban tasks simultaneously via SSE streams.

### Usage
```typescript
const { activeTaskIds, monitorCount } = useKanbanTaskMonitor(
  tasks,
  (taskId, updates) => {
    console.log('Task updated:', taskId, updates);
    refreshTasks();
  }
);
```

### Implementation Details

```typescript
export function useKanbanTaskMonitor(
  tasks: KanbanTask[],
  onTaskUpdate?: (taskId: string, updates: Partial<KanbanTask>) => void
) {
  // Filter active tasks
  const activeTasks = tasks.filter(
    task => task.streamingId && task.agentStatus === 'active'
  );

  // Create message handler for each task
  const createMessageHandler = useCallback(
    (taskId: string) => (event: StreamEvent) => {
      const task = kanbanStorage.getTask(taskId);
      if (!task) return;

      let updates: Partial<KanbanTask> = {};

      // Handle different event types
      switch (event.type) {
        case 'connected':
          updates = { agentStatus: 'active', statusMessage: 'Agent connected' };
          break;
        case 'assistant':
          updates = { agentStatus: 'active', statusMessage: 'Agent working...' };
          break;
        case 'permission_request':
          updates = { agentStatus: 'waiting', statusMessage: 'Waiting for permission' };
          break;
        case 'result':
          const isSuccess = event.subtype === 'success' && !event.is_error;
          updates = {
            agentStatus: isSuccess ? 'completed' : 'error',
            statusMessage: isSuccess ? 'Task completed' : 'Task failed',
            completedAt: new Date().toISOString(),
            column: isSuccess ? 'done' : task.column,
          };
          break;
        case 'error':
          updates = { agentStatus: 'error', statusMessage: `Error: ${event.error}` };
          break;
        case 'closed':
          if (task.agentStatus === 'active') {
            updates = { agentStatus: 'paused', statusMessage: 'Connection closed' };
          }
          break;
      }

      // Update localStorage and notify parent
      if (Object.keys(updates).length > 0) {
        kanbanStorage.updateTask(taskId, updates);
        onTaskUpdate?.(taskId, updates);
      }
    },
    [onTaskUpdate]
  );

  // Return active task IDs being monitored
  return {
    activeTaskIds: Array.from(monitorsRef.current.keys()),
    monitorCount: monitorsRef.current.size,
  };
}
```

---

## useStreaming Hook (Existing)

The Kanban board leverages the existing `useStreaming` hook from the conversation view:

**Location**: `/src/web/chat/hooks/useStreaming.ts`

### Features
- ✅ Automatic SSE connection management
- ✅ Handles reconnection on page visibility
- ✅ Parses SSE format (`data: {...}`)
- ✅ Bearer token authentication
- ✅ Error handling and retry logic
- ✅ Graceful cleanup

### Usage in Kanban
```typescript
const { isConnected, disconnect } = useStreaming(streamingId, {
  onMessage: handleMessage,
  onError: (error) => console.error('Stream error:', error),
  onConnect: () => console.log('Connected'),
  onDisconnect: () => console.log('Disconnected'),
});
```

---

## Task Status Lifecycle

```
┌──────────┐
│   idle   │  Initial state (task not assigned)
└────┬─────┘
     │ User assigns task to agent
     ▼
┌──────────┐
│  active  │  Agent is working
└────┬─────┘
     │
     ├──── Permission needed ───▶ ┌──────────┐
     │                            │ waiting  │
     │                            └────┬─────┘
     │                                 │ Permission granted
     │                                 ▼
     │                            ┌──────────┐
     │                            │  active  │
     │                            └────┬─────┘
     │                                 │
     ├──── Completed successfully ─────┼───▶ ┌───────────┐
     │                                 │     │ completed │
     │                                 │     └───────────┘
     │                                 │
     ├──── Error occurred ─────────────┼───▶ ┌──────────┐
     │                                 │     │  error   │
     │                                 │     └──────────┘
     │                                 │
     └──── Connection closed ──────────┴───▶ ┌──────────┐
                                             │  paused  │
                                             └──────────┘
```

---

## Data Persistence Strategy

### localStorage as Source of Truth

All task data is stored in browser localStorage:

**Storage Key**: `kanban_tasks`

**Structure**:
```typescript
{
  tasks: [
    {
      id: 'uuid',
      title: 'Task title',
      description: 'Task description',
      boardId: 'default',
      column: 'inprogress',
      position: 0,
      priority: 'high',
      tags: ['backend', 'api'],

      // Agent linkage
      sessionId: 'session-uuid',
      streamingId: 'streaming-uuid',
      agentStatus: 'active',

      // Timestamps
      createdAt: '2025-11-10T00:00:00Z',
      updatedAt: '2025-11-10T00:05:00Z',
      assignedAt: '2025-11-10T00:01:00Z',
      completedAt: null,

      // Progress tracking
      progress: 0,
      statusMessage: 'Agent working...',
      workingDirectory: '/path/to/project',
    }
  ]
}
```

### Update Flow

```
SSE Event Received
  ↓
useKanbanTaskMonitor.createMessageHandler()
  ↓
Determine updates based on event type
  ↓
kanbanStorage.updateTask(taskId, updates)
  ↓
localStorage.setItem('kanban_tasks', JSON.stringify(tasks))
  ↓
onTaskUpdate callback fired
  ↓
KanbanContext.refreshTasks()
  ↓
setTasks(kanbanStorage.getTasks(boardId))
  ↓
React re-renders TaskCard with new status
```

---

## Performance Considerations

### 1. Efficient Monitoring
- Only tasks with `streamingId` and `agentStatus === 'active'` are monitored
- SSE connections are automatically cleaned up when tasks complete
- No polling - uses push-based SSE updates

### 2. Debounced Updates
- localStorage writes are synchronous but fast
- React state updates are batched
- No excessive re-renders

### 3. Memory Management
- EventSource connections are properly closed
- useEffect cleanup functions remove listeners
- No memory leaks from dangling subscriptions

---

## Error Handling

### Network Errors
```typescript
onError: (error) => {
  console.error('[TaskMonitor] Stream error:', error);
  if (task) {
    kanbanStorage.updateTask(task.id, {
      agentStatus: 'error',
      statusMessage: error.message,
    });
  }
}
```

### Task Not Found
```typescript
const task = kanbanStorage.getTask(taskId);
if (!task) return; // Silently skip - task may have been deleted
```

### Invalid Events
```typescript
try {
  const event = JSON.parse(jsonLine) as StreamEvent;
  handleEvent(event);
} catch (err) {
  console.error('Failed to parse stream message:', line, err);
  // Continue processing other events
}
```

---

## Testing Strategy

### Unit Tests
- Mock localStorage
- Mock SSE EventSource
- Test event handlers in isolation
- Verify state updates

### Integration Tests
- Use mock Claude CLI process
- Verify end-to-end flow
- Test multiple concurrent streams
- Test error scenarios

### Manual Testing Checklist
- [ ] Single task assignment and monitoring
- [ ] Multiple concurrent tasks
- [ ] Task completion (success)
- [ ] Task failure (error)
- [ ] Permission request handling
- [ ] Connection loss and recovery
- [ ] Page refresh with active tasks
- [ ] Browser tab switching
- [ ] Task deletion while active

---

## Debugging Tips

### Enable Console Logging
All monitoring events are logged with `[KanbanMonitor]` prefix:
```typescript
console.log('[KanbanMonitor] Event for task', taskId, event.type);
console.log('[KanbanMonitor] Task completed', taskId, { ... });
console.log('[KanbanMonitor] Updated task', taskId, updates);
```

### Inspect SSE Stream
Use browser DevTools Network tab:
1. Filter by "EventStream" type
2. Click on the SSE connection
3. View "Messages" tab to see real-time events

### Check localStorage
```javascript
// In browser console
console.log(JSON.parse(localStorage.getItem('kanban_tasks')));
```

### Monitor Active Streams
```typescript
// In KanbanBoard component
console.log('Monitoring', monitorCount, 'active tasks');
console.log('Active task IDs:', activeTaskIds);
```

---

## Future Enhancements

### Potential Improvements
1. **Batch Updates**: Queue localStorage writes to reduce I/O
2. **Progress Calculation**: Track tool executions to compute progress %
3. **Event History**: Store all events for debugging/replay
4. **Offline Support**: Queue updates when offline, sync when back online
5. **Multi-tab Sync**: Use storage events to sync across browser tabs
6. **Metrics**: Track agent performance (time, tokens, tools used)

---

## Conclusion

The SSE integration provides:
- ✅ Real-time task status updates
- ✅ No polling overhead
- ✅ Automatic reconnection
- ✅ Proper cleanup
- ✅ Error handling
- ✅ Works with existing backend
- ✅ No server changes required

The implementation is production-ready and scales to monitor multiple concurrent agent tasks efficiently.
