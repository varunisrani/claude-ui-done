# CUI Server - Project Documentation

> **CUI Server** is a Web UI Agent Platform built on Claude Code, providing a modern web interface for AI-assisted development with real-time streaming, tool execution, and conversation management.

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Core Technologies](#core-technologies)
- [Key Services](#key-services)
- [API Reference](#api-reference)
- [Frontend Architecture](#frontend-architecture)
- [Development Guidelines](#development-guidelines)
- [Testing Architecture](#testing-architecture)
- [Configuration](#configuration)
- [Build & Deployment](#build--deployment)
- [Security & Permissions](#security--permissions)

---

## Project Overview

**CUI Server** bridges Claude Code CLI with a web-based interface, enabling:
- Real-time AI conversations with streaming responses
- Tool execution with permission management
- Multi-client support with Server-Sent Events (SSE)
- Conversation history and session resumption
- File operations and workspace management
- Progressive Web App (PWA) capabilities

**Key Characteristics:**
- Repository: `https://github.com/bmpixel/cui`
- Version: 0.6.3
- License: Apache-2.0
- Node.js: ≥20.19.0
- Type: ES Module

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Web Browsers                        │
│              (React SPA + Service Worker)               │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/SSE
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  CUI Server (Express)                   │
│  ┌──────────────┬──────────────┬──────────────────────┐ │
│  │   Routes     │  Services    │    Middleware        │ │
│  │  (10 groups) │  (22 svcs)   │  (Auth, CORS, etc)   │ │
│  └──────────────┴──────────────┴──────────────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │ Child Process
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Claude CLI (Process Manager)               │
│         Spawns & manages claude CLI instances           │
└─────────────────────────────────────────────────────────┘
```

### Request Flow

1. **Client Request** → Express routes → Service layer
2. **Claude CLI Spawn** → Process manager creates child process
3. **JSONL Streaming** → Parser converts to structured messages
4. **SSE Broadcast** → Stream manager sends to all connected clients
5. **Tool Execution** → Permission tracker handles approvals
6. **Response Rendering** → React components display results

### Design Patterns

- **Singleton:** ConfigService, WebPushService (single instance)
- **EventEmitter:** Process/Stream managers for real-time events
- **Service Layer:** Business logic isolated from routes
- **Context API:** React state management (global/local)
- **Custom Hooks:** Reusable React logic encapsulation
- **Middleware Chain:** Request processing pipeline

---

## Directory Structure

```
claude-ui-done/
├── src/                              # Source code
│   ├── server.ts                     # CLI entry point, signal handling
│   ├── cui-server.ts                 # Main Express app, service initialization
│   ├── cli-parser.ts                 # Command-line argument parsing
│   │
│   ├── services/                     # Backend services (22 files)
│   │   ├── claude-process-manager.ts       # Claude CLI lifecycle
│   │   ├── claude-history-reader.ts        # Conversation history
│   │   ├── stream-manager.ts               # SSE connection management
│   │   ├── config-service.ts               # Configuration singleton
│   │   ├── conversation-status-manager.ts  # Status tracking
│   │   ├── permission-tracker.ts           # Tool permission system
│   │   ├── session-info-service.ts         # Session metadata
│   │   ├── file-system-service.ts          # File operations
│   │   ├── notification-service.ts         # Notifications (ntfy, push)
│   │   ├── web-push-service.ts             # Web Push API
│   │   ├── gemini-service.ts               # Google Gemini integration
│   │   ├── logger.ts                       # Structured logging (Pino)
│   │   ├── mcp-config-generator.ts         # MCP configuration
│   │   └── ...                             # Other services
│   │
│   ├── middleware/                   # Express middleware (5 files)
│   │   ├── auth.ts                   # Token authentication
│   │   ├── cors-setup.ts             # CORS configuration
│   │   ├── error-handler.ts          # Global error handling
│   │   ├── request-logger.ts         # Request logging
│   │   └── query-parser.ts           # Query parameter parsing
│   │
│   ├── routes/                       # API route handlers (10 files)
│   │   ├── conversation.routes.ts    # /api/conversations
│   │   ├── system.routes.ts          # /api/system
│   │   ├── permission.routes.ts      # /api/permissions
│   │   ├── filesystem.routes.ts      # /api/filesystem
│   │   ├── streaming.routes.ts       # /api/stream
│   │   ├── notifications.routes.ts   # /api/notifications
│   │   ├── config.routes.ts          # /api/config
│   │   ├── gemini.routes.ts          # /api/gemini
│   │   ├── log.routes.ts             # /api/logs
│   │   └── working-directories.routes.ts  # /api/working-directories
│   │
│   ├── types/                        # TypeScript type definitions
│   │   ├── index.ts                  # Core types (messages, conversations)
│   │   ├── config.ts                 # Configuration types
│   │   ├── router-config.ts          # Router provider types
│   │   └── express.ts                # Express extension types
│   │
│   ├── utils/                        # Utility functions
│   │   ├── machine-id.ts             # Machine ID generation
│   │   └── server-startup.ts         # Server startup display
│   │
│   ├── mcp-server/                   # Model Context Protocol
│   │   └── index.ts                  # MCP permission tool server
│   │
│   └── web/                          # React frontend (74+ files)
│       ├── App.tsx                   # Root component, routing, auth
│       ├── main.tsx                  # Vite entry point
│       ├── index.html                # HTML template
│       ├── sw.ts                     # Service worker (PWA)
│       │
│       ├── chat/                     # Chat interface
│       │   ├── ChatApp.tsx           # Chat container
│       │   │
│       │   ├── components/           # UI components (16+ directories)
│       │   │   ├── ToolRendering/    # Tool result renderers
│       │   │   │   ├── ToolUseRenderer.tsx
│       │   │   │   └── tools/        # Individual tool components
│       │   │   │       ├── BashTool.tsx, WriteTool.tsx
│       │   │   │       ├── EditTool.tsx, ReadTool.tsx
│       │   │   │       ├── DiffViewer.tsx, WebTool.tsx
│       │   │   │       └── ... (more tools)
│       │   │   ├── MessageList/      # Message display
│       │   │   ├── Composer/         # Message input
│       │   │   ├── ConversationView/ # Conversation UI
│       │   │   ├── Home/             # Landing page
│       │   │   ├── Layout/           # Layout components
│       │   │   ├── CodeHighlight/    # Syntax highlighting
│       │   │   ├── PreferencesModal/ # Settings dialog
│       │   │   ├── PermissionDialog/ # Permission prompts
│       │   │   └── ui/               # shadcn/ui components
│       │   │
│       │   ├── contexts/             # React contexts
│       │   │   ├── ConversationsContext.tsx
│       │   │   ├── StreamStatusContext.tsx
│       │   │   └── PreferencesContext.tsx
│       │   │
│       │   ├── hooks/                # Custom React hooks
│       │   │   ├── useStreaming.ts
│       │   │   ├── useConversationMessages.ts
│       │   │   ├── useMultipleStreams.ts
│       │   │   ├── useAudioRecording.ts
│       │   │   └── usePreferences.ts
│       │   │
│       │   └── services/             # Frontend API client
│       │       └── api.ts
│       │
│       └── inspector/                # Inspector app
│           └── InspectorApp.tsx
│
├── tests/                            # Test suite
│   ├── __mocks__/                    # Mock implementations
│   │   └── claude                    # Mock Claude CLI executable
│   ├── unit/                         # Unit tests
│   ├── integration/                  # Integration tests
│   ├── utils/                        # Test utilities
│   └── setup.ts                      # Test configuration
│
├── public/                           # Static assets (favicon, PWA icons)
├── scripts/                          # Build scripts
├── docs/                             # Documentation
├── .github/                          # GitHub workflows
│
└── Configuration Files:
    ├── package.json                  # Project metadata
    ├── tsconfig.json                 # TypeScript (backend)
    ├── tsconfig.web.json             # TypeScript (frontend)
    ├── vite.config.mts               # Vite bundler
    ├── vitest.config.ts              # Test runner
    ├── tailwind.config.js            # Tailwind CSS
    ├── eslint.config.js              # ESLint
    └── components.json               # shadcn/ui config
```

---

## Core Technologies

### Backend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | ≥20.19.0 | Runtime environment |
| **TypeScript** | 5.3.3 | Type-safe JavaScript |
| **Express.js** | 4.18.2 | Web framework |
| **better-sqlite3** | 12.2.0 | SQLite database for caching |
| **Pino** | 8.17.1 | Structured logging |
| **@anthropic-ai/sdk** | 0.54.0 | Anthropic API client |
| **@modelcontextprotocol/sdk** | 1.17.0 | MCP integration |
| **@google/genai** | 1.11.0 | Google Gemini API |

### Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18.2.0 | UI framework |
| **React Router** | 6.22.0 | Client-side routing |
| **Vite** | 7.0.6 | Build tool & dev server |
| **Tailwind CSS** | 4.1.11 | Utility-first CSS |
| **shadcn/ui** | Latest | UI component library (Radix UI) |
| **Lucide React** | Latest | Icon library |
| **Prism.js** | 1.30.0 | Syntax highlighting |
| **react-markdown** | 10.1.0 | Markdown rendering |

### Development Tools

- **tsx** - TypeScript execution
- **Vitest** - Test runner
- **ESLint** - Code linting
- **Husky** - Git hooks

---

## Key Services

### Process Management

#### ClaudeProcessManager (`claude-process-manager.ts`)
Manages Claude CLI process lifecycle:
- Spawns child processes with `spawn()`
- Monitors stdout/stderr streams
- Handles process termination
- Tracks streaming IDs
- Manages environment variables

**Key Methods:**
- `startConversation(options)` - Start new conversation
- `killProcess(streamingId)` - Terminate process
- `getProcessInfo(streamingId)` - Get process details

#### ClaudeRouterService (`claude-router-service.ts`)
Optional service for routing requests across multiple Claude instances:
- Load balancing
- Provider selection
- Failover handling

### Streaming & Real-time

#### StreamManager (`stream-manager.ts`)
Manages Server-Sent Events (SSE) connections:
- Multiple clients per stream
- Heartbeat mechanism
- Automatic cleanup
- Event broadcasting

**Key Methods:**
- `addClient(streamingId, res)` - Register SSE client
- `removeClient(streamingId, res)` - Unregister client
- `sendEvent(streamingId, data)` - Broadcast to all clients
- `closeStream(streamingId)` - Close all connections

#### JsonLinesParser (`json-lines-parser.ts`)
Parses Claude CLI JSONL output:
- Line-by-line parsing
- Error handling
- Type validation

### Data & Storage

#### ConfigService (`config-service.ts`)
Singleton service managing `~/.cui/config.json`:
- Configuration file I/O
- Auth token generation
- Default values
- Validation

**Configuration Schema:**
```typescript
{
  machine_id: string,
  server: { host: string, port: number },
  authToken: string,
  gemini?: { apiKey: string, model: string },
  router?: RouterConfig,
  interface: {
    colorScheme: 'light' | 'dark' | 'system',
    language: string,
    notifications?: NotificationConfig
  }
}
```

#### ClaudeHistoryReader (`claude-history-reader.ts`)
Reads conversation history from `~/.claude/`:
- Session directory scanning
- Conversation parsing
- Metadata extraction

#### ConversationCache (`conversation-cache.ts`)
SQLite-based in-memory cache:
- Parsed conversation storage
- Performance optimization
- TTL management

### Security & Permissions

#### PermissionTracker (`permission-tracker.ts`)
Manages tool execution permissions:
- Permission request tracking
- Approval/denial workflow
- History storage
- MCP integration

**Key Methods:**
- `requestPermission(details)` - Create permission request
- `approvePermission(id)` - Approve tool execution
- `denyPermission(id)` - Deny tool execution
- `getPendingPermissions()` - Get pending requests

#### AuthMiddleware (`middleware/auth.ts`)
Token-based authentication:
- Bearer token validation
- Request authorization
- Optional auth bypass

### Notifications

#### NotificationService (`notification-service.ts`)
Multi-channel notification system:
- ntfy integration
- Web Push support
- Notification queuing

#### WebPushService (`web-push-service.ts`)
Web Push API integration:
- VAPID key management
- Subscription handling
- Push message delivery

---

## API Reference

### Conversation Management

#### `POST /api/conversations/start`
Start new conversation or resume existing.

**Request:**
```json
{
  "userMessage": "string",
  "sessionId": "string?",
  "workingDirectory": "string?",
  "options": {
    "model": "string?",
    "temperature": "number?"
  }
}
```

**Response:**
```json
{
  "streamingId": "string",
  "sessionId": "string",
  "status": "active" | "pending"
}
```

#### `GET /api/conversations`
List all conversations.

**Query Parameters:**
- `status` - Filter by status (active, completed, error)
- `limit` - Max results (default: 50)
- `offset` - Pagination offset

**Response:**
```json
{
  "conversations": [
    {
      "sessionId": "string",
      "title": "string",
      "status": "string",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ],
  "total": "number"
}
```

#### `GET /api/conversations/:sessionId`
Get conversation details.

**Response:**
```json
{
  "sessionId": "string",
  "title": "string",
  "status": "string",
  "messages": "Message[]",
  "metadata": "object"
}
```

#### `POST /api/conversations/:sessionId/messages`
Add message to conversation.

**Request:**
```json
{
  "content": "string",
  "role": "user" | "assistant"
}
```

### Streaming

#### `GET /api/stream/subscribe/:streamingId`
Subscribe to conversation stream via SSE.

**Response:** Server-Sent Events stream
```
event: message
data: {"type": "text", "content": "..."}

event: tool_use
data: {"type": "tool_use", "tool": "bash", ...}

event: error
data: {"error": "..."}

event: end
data: {"status": "completed"}
```

### Permissions

#### `GET /api/permissions`
List pending and completed permissions.

**Response:**
```json
{
  "pending": [
    {
      "id": "string",
      "toolName": "string",
      "details": "object",
      "timestamp": "string"
    }
  ],
  "completed": "PermissionRequest[]"
}
```

#### `POST /api/permissions/approve/:id`
Approve tool execution.

**Response:**
```json
{
  "success": true,
  "permissionId": "string"
}
```

### Filesystem

#### `GET /api/filesystem/tree`
Get directory tree structure.

**Query Parameters:**
- `path` - Root path (default: current working directory)
- `depth` - Max depth (default: 3)

**Response:**
```json
{
  "path": "string",
  "name": "string",
  "type": "file" | "directory",
  "children": "TreeNode[]"
}
```

#### `POST /api/filesystem/upload`
Upload files (multipart/form-data).

**Request:** File upload via FormData

**Response:**
```json
{
  "success": true,
  "files": ["filename1.txt", "filename2.txt"]
}
```

### System

#### `GET /api/system/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "uptime": "number",
  "version": "string"
}
```

#### `GET /api/system/version`
Get server version.

**Response:**
```json
{
  "version": "0.6.3",
  "nodeVersion": "string"
}
```

---

## Frontend Architecture

### Component Structure

#### Core Components

**App.tsx** - Root component
- Authentication handling
- OAuth token extraction
- Route configuration
- Theme provider

**ChatApp.tsx** - Main chat interface
- Conversation list sidebar
- Active conversation view
- Message composer
- Real-time updates

#### Context Providers

**ConversationsContext**
```typescript
{
  conversations: Conversation[],
  activeConversationId: string | null,
  setActiveConversation: (id: string) => void,
  refreshConversations: () => Promise<void>
}
```

**StreamStatusContext**
```typescript
{
  streamStatus: Map<string, StreamStatus>,
  updateStreamStatus: (id: string, status: StreamStatus) => void
}
```

**PreferencesContext**
```typescript
{
  theme: 'light' | 'dark' | 'system',
  setTheme: (theme: string) => void,
  preferences: Preferences,
  updatePreferences: (prefs: Partial<Preferences>) => void
}
```

### Custom Hooks

#### useStreaming
Manages SSE connection lifecycle:
```typescript
const { messages, status, error } = useStreaming(streamingId, {
  onMessage: (msg) => { /* handle */ },
  onError: (err) => { /* handle */ },
  onEnd: () => { /* handle */ }
});
```

#### useConversationMessages
Fetches and caches conversation messages:
```typescript
const { messages, loading, error, refresh } = useConversationMessages(sessionId);
```

#### useMultipleStreams
Handles multiple concurrent streams:
```typescript
const { streams, addStream, removeStream } = useMultipleStreams();
```

### Tool Renderers

Tool-specific renderers in `src/web/chat/components/ToolRendering/tools/`:

| Tool | Component | Features |
|------|-----------|----------|
| Bash | `BashTool.tsx` | Command output, exit codes, ANSI colors |
| Write | `WriteTool.tsx` | File path, content preview |
| Edit | `EditTool.tsx` | Diff viewer, before/after |
| Read | `ReadTool.tsx` | File path, line numbers, syntax highlighting |
| Diff | `DiffViewer.tsx` | Side-by-side comparison |
| Web Search | `WebTool.tsx` | Search results, snippets |
| Task | `TaskTool.tsx` | Subtask tracking, status |

### Styling

**Tailwind CSS Configuration:**
- Custom color palette
- Dark mode support
- Component variants
- Responsive utilities

**shadcn/ui Components:**
- Button, Input, Textarea
- Dialog, Sheet, Popover
- Command palette
- Toast notifications

---

## Development Guidelines

### Code Style

1. **TypeScript First**
   - Use strict type checking
   - Avoid `any` - prefer `unknown`
   - Define interfaces for all data structures

2. **Functional Programming**
   - Prefer pure functions
   - Minimize side effects
   - Use immutable data patterns

3. **Error Handling**
   - Use try/catch for async operations
   - Return error objects (don't throw in services)
   - Log errors with context

4. **Naming Conventions**
   - PascalCase for classes, types, components
   - camelCase for functions, variables
   - UPPER_CASE for constants
   - kebab-case for file names (except React components)

### Service Development

**Service Pattern:**
```typescript
// services/my-service.ts
import { logger } from './logger';

export class MyService {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  async performOperation(param: string): Promise<Result> {
    try {
      logger.info('Starting operation', { param });
      // Implementation
      return result;
    } catch (error) {
      logger.error('Operation failed', { error, param });
      throw error;
    }
  }
}
```

### React Component Development

**Component Pattern:**
```typescript
// components/MyComponent.tsx
import { useState, useEffect } from 'react';
import { logger } from '@/services/logger';

interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  const [state, setState] = useState<State>(initialState);

  useEffect(() => {
    // Side effects
  }, [dependencies]);

  const handleClick = () => {
    logger.debug('Button clicked', { title });
    onAction?.();
  };

  return (
    <div className="flex flex-col gap-4">
      <h2>{title}</h2>
      <button onClick={handleClick}>Action</button>
    </div>
  );
}
```

### API Route Development

**Route Pattern:**
```typescript
// routes/my.routes.ts
import { Router } from 'express';
import type { CUIServices } from '@/types';

export function createMyRoutes(services: CUIServices): Router {
  const router = Router();

  router.get('/endpoint', async (req, res, next) => {
    try {
      const result = await services.myService.getData();
      res.json(result);
    } catch (error) {
      next(error); // Pass to error handler middleware
    }
  });

  return router;
}
```

### Logging Guidelines

**Log Levels:**
- `debug` - Detailed debugging information
- `info` - General informational messages
- `warn` - Warning messages (non-critical)
- `error` - Error messages (critical)

**Logging Pattern:**
```typescript
import { logger } from '@/services/logger';

// Include context
logger.info('User action', {
  userId: user.id,
  action: 'create_conversation'
});

// Log errors with stack traces
logger.error('Failed to process request', {
  error: error.message,
  stack: error.stack,
  context: { /* relevant data */ }
});
```

### Performance Best Practices

1. **Avoid Blocking Operations**
   - Use async/await for I/O
   - Don't use `readFileSync` in request handlers
   - Prefer streams for large files

2. **Caching Strategy**
   - Cache frequently accessed data
   - Use TTL for time-sensitive data
   - Invalidate on updates

3. **Database Queries**
   - Use prepared statements
   - Limit result sets
   - Index frequently queried columns

4. **Frontend Optimization**
   - Code splitting with React.lazy
   - Memoize expensive computations
   - Virtualize long lists
   - Debounce user input

---

## Testing Architecture

This project maintains comprehensive test coverage for all services and components.

### Testing Philosophy

- **Prefer real implementations** over mocks when testing (per project guidelines)
- **Comprehensive unit test coverage** for all services (90%+ target)
- **Mock Claude CLI** using `tests/__mocks__/claude` script for consistent testing
- **Silent logging** in tests (LOG_LEVEL=silent) to reduce noise

### Test Structure

```
tests/
├── __mocks__
│   └── claude                        # Mock Claude CLI executable
├── integration
│   ├── conversation-status-integration.test.ts
│   ├── real-claude-integration.test.ts
│   └── streaming-integration.test.ts
├── setup.ts                          # Test configuration
├── unit
│   ├── cui-server.test.ts
│   ├── claude-history-reader.test.ts
│   ├── claude-process-long-running.test.ts
│   ├── claude-process-manager.test.ts
│   ├── cli
│   │   ├── get.test.ts
│   │   ├── list.test.ts
│   │   ├── serve.test.ts
│   │   ├── status-simple.test.ts
│   │   ├── status-working.test.ts
│   │   └── status.test.ts
│   ├── conversation-status-tracker.test.ts
│   ├── json-lines-parser.test.ts
│   └── stream-manager.test.ts
└── utils
    └── test-helpers.ts
```

### Mock Claude CLI

The project includes a mock Claude CLI (`tests/__mocks__/claude`) that:
- Simulates real Claude CLI behavior for testing
- Outputs valid JSONL stream format
- Supports various command line arguments
- Enables testing without requiring actual Claude CLI installation

### Testing Patterns

```typescript
// Integration test pattern with mock Claude CLI
function getMockClaudeExecutablePath(): string {
  return path.join(process.cwd(), 'tests', '__mocks__', 'claude');
}

// Server setup with random port to avoid conflicts
const serverPort = 9000 + Math.floor(Math.random() * 1000);
const server = new CUIServer({ port: serverPort });

// Override ProcessManager with mock path
const mockClaudePath = getMockClaudeExecutablePath();
const { ClaudeProcessManager } = await import('@/services/claude-process-manager');
(server as any).processManager = new ClaudeProcessManager(mockClaudePath);
```

### Test Configuration

- **Vitest** for fast and modern testing with TypeScript support
- **Path mapping** using `@/` aliases matching source structure
- **Coverage thresholds:** 75% lines, 80% functions, 60% branches

### Test Commands

```bash
# Run all tests
npm test

# Run specific test files
npm test -- claude-process-manager.test.ts
npm test -- tests/unit/

# Run tests matching a pattern
npm test -- --testNamePattern="should start conversation"

# Run unit tests only
npm run unit-tests

# Run integration tests only
npm run integration-tests

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run with UI
npm run test:ui

# Debug tests
npm run test:debug
```

### Writing Tests

**Unit Test Pattern:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MyService } from '@/services/my-service';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService(config);
  });

  afterEach(() => {
    // Cleanup
  });

  it('should perform operation successfully', async () => {
    const result = await service.performOperation('param');
    expect(result).toBeDefined();
    expect(result.status).toBe('success');
  });

  it('should handle errors gracefully', async () => {
    await expect(
      service.performOperation('invalid')
    ).rejects.toThrow('Expected error');
  });
});
```

**Integration Test Pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { CUIServer } from '@/cui-server';

describe('API Integration', () => {
  it('should start conversation', async () => {
    const server = new CUIServer({ port: 9999 });
    await server.start();

    const response = await request(server.app)
      .post('/api/conversations/start')
      .send({ userMessage: 'Hello' })
      .expect(200);

    expect(response.body.streamingId).toBeDefined();

    await server.stop();
  });
});
```

### Development Practices

- **Meaningful test names** that describe expected behavior
- **Comprehensive test coverage** for all services and routes
- **Silent logging** in tests (LOG_LEVEL=silent) to reduce noise
- **Random ports** for server tests to avoid conflicts
- **Proper cleanup** of resources and processes in tests
- **Test isolation** - each test should be independent

---

## Configuration

### Configuration File

**Location:** `~/.cui/config.json`

**Auto-generation:** Created on first server start if missing

**Schema:**
```typescript
{
  machine_id: string,              // Unique machine identifier (UUID)
  server: {
    host: string,                  // Server host (default: 'localhost')
    port: number                   // Server port (default: 3001)
  },
  authToken: string,               // 32-char hex auth token (auto-generated)
  gemini?: {
    apiKey: string,                // Google API key
    model: string                  // Gemini model name (default: 'gemini-2.0-flash')
  },
  router?: {
    enabled: boolean,
    providers: Provider[],
    defaultProvider: string
  },
  interface: {
    colorScheme: 'light' | 'dark' | 'system',  // Theme preference
    language: string,              // UI language (default: 'en')
    notifications?: {
      enabled: boolean,
      ntfyUrl?: string,            // ntfy server URL
      webPush?: {
        subject: string,           // Contact email
        vapidPublicKey: string,    // VAPID public key
        vapidPrivateKey: string    // VAPID private key
      }
    }
  }
}
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `LOG_LEVEL` | Logging level | `info` |
| `CUI_SERVER_URL` | Server URL for MCP | `http://localhost:3001` |
| `CUI_SERVER_PORT` | Server port override | From config |
| `CUI_STREAMING_ID` | Streaming session ID | Set by ProcessManager |
| `GOOGLE_API_KEY` | Google API key | From config |

### CLI Arguments

```bash
cui-server [OPTIONS]

Options:
  --port <number>          Server port (overrides config, default: 3001)
  --host <string>          Server host (overrides config, default: 'localhost')
  --token <string>         API auth token (overrides config)
  --skip-auth-token        Disable authentication (development only)
  -h, --help              Show help message
  -v, --version           Show version number

Examples:
  cui-server                              # Start with config defaults
  cui-server --port 8080                  # Start on port 8080
  cui-server --skip-auth-token            # Start without auth
  cui-server --token abc123               # Use custom auth token
```

### Configuration Methods

1. **Config File** (highest priority)
   - Edit `~/.cui/config.json` manually
   - Use API: `PUT /api/config`

2. **CLI Arguments** (overrides config file)
   - `--port`, `--host`, `--token`

3. **Environment Variables** (overrides defaults)
   - Set before starting server

**Priority Order:** CLI args > Config file > Environment > Defaults

---

## Build & Deployment

### Development Workflow

```bash
# 1. Install dependencies
npm install

# 2. Start backend dev server (with hot reload)
npm run dev

# 3. Start frontend dev server (in separate terminal)
npm run dev:web

# 4. Access application
# Backend:  http://localhost:3001
# Frontend: http://localhost:5173 (Vite dev server)
```

### Production Build

```bash
# Full build (clean + web + TypeScript + MCP)
npm run build

# Build steps:
# 1. Clean dist/
# 2. Build frontend (Vite) → dist/public/
# 3. Compile TypeScript → dist/
# 4. Resolve path aliases (tsc-alias)
# 5. Set MCP server permissions
```

### Running Production

```bash
# Start production server
npm start
# or
cui-server

# With custom options
cui-server --port 8080 --host 0.0.0.0
```

### Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure `~/.cui/config.json`
- [ ] Set authentication token
- [ ] Configure CORS for allowed origins
- [ ] Set up SSL/TLS (reverse proxy recommended)
- [ ] Configure logging level (`LOG_LEVEL=info`)
- [ ] Set up process manager (PM2, systemd)
- [ ] Configure firewall rules
- [ ] Set up backup for `~/.cui/` directory

### Process Management

**Using PM2:**
```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start npm --name "cui-server" -- start

# View logs
pm2 logs cui-server

# Monitor
pm2 monit

# Auto-restart on system boot
pm2 startup
pm2 save
```

**Using systemd:**
```ini
# /etc/systemd/system/cui-server.service
[Unit]
Description=CUI Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/cui-server
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Build Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run build` | Full production build |
| `npm run build:web` | Build frontend only (Vite) |
| `npm run build:mcp` | Set MCP executable permissions |
| `npm run dev` | Start backend dev server (tsx watch) |
| `npm run dev:web` | Start frontend dev server (Vite) |
| `npm start` | Start production server |
| `npm run lint` | Lint TypeScript files |
| `npm run typecheck` | Type check without building |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage |

---

## Security & Permissions

### Authentication

**Token-based Authentication:**
- Auto-generated 32-character hex token on first run
- Stored in `~/.cui/config.json`
- Required for all API endpoints (except `/health`)
- Sent via `Authorization: Bearer <token>` header

**Disabling Auth (Development Only):**
```bash
cui-server --skip-auth-token
```

### Permission System

**Tool Execution Permissions:**
1. Claude requests tool execution
2. CUI Server creates permission request
3. Frontend displays permission dialog
4. User approves/denies
5. Response sent to Claude CLI

**Permission Types:**
- File operations (read, write, edit)
- Bash command execution
- Web requests
- System commands

**MCP Permission Tool:**
- Implemented in `src/mcp-server/index.ts`
- Provides `approval_prompt` tool to Claude
- Communicates with CUI Server via HTTP

### Security Best Practices

1. **Protect Auth Token**
   - Never commit config files
   - Use environment variables for CI/CD
   - Rotate tokens regularly

2. **CORS Configuration**
   - Restrict allowed origins in production
   - Configure in `src/middleware/cors-setup.ts`

3. **File System Access**
   - Validate file paths
   - Check permissions before operations
   - Sanitize user input

4. **Process Isolation**
   - Claude CLI runs in child process
   - Limited environment variables
   - Controlled working directory

5. **Input Validation**
   - Validate all API inputs
   - Sanitize file paths
   - Check message sizes

6. **Error Handling**
   - Don't expose stack traces to clients
   - Log detailed errors server-side
   - Return generic error messages

### Sensitive Data

**Never Log:**
- Auth tokens
- API keys
- User credentials
- File contents (in full)

**Configuration Security:**
- `~/.cui/config.json` should be readable only by owner
- Set permissions: `chmod 600 ~/.cui/config.json`
- Exclude from version control

### Network Security

**Production Recommendations:**
- Use reverse proxy (nginx, Apache)
- Enable HTTPS/TLS
- Configure firewall rules
- Limit rate limiting
- Enable CSRF protection

**Example nginx config:**
```nginx
server {
    listen 443 ssl http2;
    server_name cui.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE support
    location /api/stream/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

---

## Troubleshooting

### Common Issues

**Server won't start:**
- Check if port is already in use
- Verify Node.js version (≥20.19.0)
- Check `~/.cui/config.json` syntax
- Review logs for errors

**Authentication errors:**
- Verify auth token in config
- Check `Authorization` header format
- Ensure token matches server config

**Streaming not working:**
- Check SSE connection
- Verify browser supports EventSource
- Check firewall/proxy settings
- Review CORS configuration

**Claude CLI not found:**
- Ensure Claude CLI is installed
- Check PATH environment variable
- Verify executable permissions

**Permission requests not appearing:**
- Check MCP server configuration
- Verify permission tracker service
- Review browser console for errors

### Debug Mode

**Enable debug logging:**
```bash
LOG_LEVEL=debug npm run dev
```

**Backend debugging:**
```bash
# Run with Node.js inspector
node --inspect dist/server.js
```

**Frontend debugging:**
- Open browser DevTools
- Check Console for errors
- Use React DevTools extension
- Monitor Network tab for API calls

---

## Contributing

### Development Setup

1. Fork and clone repository
2. Install dependencies: `npm install`
3. Create feature branch: `git checkout -b feature/my-feature`
4. Make changes and add tests
5. Run tests: `npm test`
6. Lint code: `npm run lint`
7. Build: `npm run build`
8. Commit with clear message
9. Push and create pull request

### Code Review Checklist

- [ ] Tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] Code coverage maintained/improved
- [ ] Documentation updated
- [ ] Commit messages are clear
- [ ] No console.log statements
- [ ] Error handling implemented
- [ ] Security considerations addressed

---

## Resources

### Documentation
- **Claude Code:** https://docs.anthropic.com/claude/docs/code
- **Model Context Protocol:** https://modelcontextprotocol.io/
- **React:** https://react.dev/
- **Vite:** https://vitejs.dev/
- **Tailwind CSS:** https://tailwindcss.com/
- **shadcn/ui:** https://ui.shadcn.com/

### Project Links
- **Repository:** https://github.com/bmpixel/cui
- **Issues:** https://github.com/bmpixel/cui/issues
- **License:** Apache-2.0

---

## License

Copyright 2024 Wenbo Pan

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

---

**Last Updated:** 2025-11-09
**Version:** 0.6.3
**Maintainer:** Wenbo Pan
