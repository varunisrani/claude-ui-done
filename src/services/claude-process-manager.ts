import { ChildProcess, spawn } from 'child_process';
import { ConversationConfig, CUIError, SystemInitMessage, StreamEvent } from '@/types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { JsonLinesParser } from './json-lines-parser.js';
import { createLogger, type Logger } from './logger.js';
import { ClaudeHistoryReader } from './claude-history-reader.js';
import { ConversationStatusManager } from './conversation-status-manager.js';
import { ToolMetricsService } from './ToolMetricsService.js';
import { SessionInfoService } from './session-info-service.js';
import { FileSystemService } from './file-system-service.js';
import { NotificationService } from './notification-service.js';
import path from 'path';
import { ClaudeRouterService } from './claude-router-service.js';

// Get the directory of this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Manages Claude CLI processes and their lifecycle
 */
export class ClaudeProcessManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private outputBuffers: Map<string, string> = new Map();
  private timeouts: Map<string, NodeJS.Timeout[]> = new Map();
  private conversationConfigs: Map<string, ConversationConfig> = new Map();
  private claudeExecutablePath: string;
  private logger: Logger;
  private envOverrides: Record<string, string | undefined>;
  private historyReader: ClaudeHistoryReader;
  private mcpConfigPath?: string;
  private statusTracker: ConversationStatusManager;
  private conversationStatusManager?: ConversationStatusManager;
  private toolMetricsService?: ToolMetricsService;
  private sessionInfoService?: SessionInfoService;
  private fileSystemService?: FileSystemService;
  private notificationService?: NotificationService;
  private routerService?: ClaudeRouterService;

  constructor(historyReader: ClaudeHistoryReader, statusTracker: ConversationStatusManager, claudeExecutablePath?: string, envOverrides?: Record<string, string | undefined>, toolMetricsService?: ToolMetricsService, sessionInfoService?: SessionInfoService, fileSystemService?: FileSystemService) {
    super();
    this.historyReader = historyReader;
    this.statusTracker = statusTracker;
    this.claudeExecutablePath = claudeExecutablePath || this.findClaudeExecutable();
    this.logger = createLogger('ClaudeProcessManager');
    this.envOverrides = envOverrides || {};
    this.toolMetricsService = toolMetricsService;
    this.sessionInfoService = sessionInfoService;
    this.fileSystemService = fileSystemService;
  }

  setRouterService(service?: ClaudeRouterService): void {
    this.routerService = service;
  }

  /**
   * Find the Claude executable from node_modules
   * Since @anthropic-ai/claude-code is a dependency, claude should be in node_modules/.bin
   */
  private findClaudeExecutable(): string {
    const isWindows = process.platform === 'win32';
    const claudeExeName = isWindows ? 'claude.cmd' : 'claude';

    // When running as an npm package, find claude relative to this module
    // __dirname will be something like /path/to/node_modules/cui-server/dist/services
    const packageRoot = path.resolve(__dirname, '..', '..');
    const claudePath = path.join(packageRoot, 'node_modules', '.bin', claudeExeName);

    if (existsSync(claudePath)) {
      return claudePath;
    }

    // Try from the parent node_modules (when cui-server is installed as a dependency)
    // packageRoot -> /node_modules/cui-server
    // parent -> /node_modules, so /node_modules/.bin/claude
    const parentModulesPath = path.resolve(packageRoot, '..', '.bin', claudeExeName);
    if (existsSync(parentModulesPath)) {
      return parentModulesPath;
    }

    // Fallback: try from current working directory (for local development)
    const cwdPath = path.join(process.cwd(), 'node_modules', '.bin', claudeExeName);
    if (existsSync(cwdPath)) {
      return cwdPath;
    }

    // Final fallback: try to locate on PATH
    const pathEnv = process.env.PATH || '';
    const pathDirs = pathEnv.split(path.delimiter);
    for (const dir of pathDirs) {
      const candidate = path.join(dir, claudeExeName);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error('Claude executable not found in node_modules. Ensure @anthropic-ai/claude-code is installed.');
  }

  /**
   * Set the MCP config path to be used for all conversations
   */
  setMCPConfigPath(path: string): void {
    this.mcpConfigPath = path;
    this.logger.debug('MCP config path set', { path });
  }

  /**
   * Set the optimistic conversation service
   */
  setConversationStatusManager(service: ConversationStatusManager): void {
    this.conversationStatusManager = service;
    this.logger.debug('Conversation status manager set');
  }

  /**
   * Set the notification service
   */
  setNotificationService(service: NotificationService): void {
    this.notificationService = service;
    this.logger.debug('Notification service set');
  }



  /**
   * Start a new Claude conversation (or resume if resumedSessionId is provided)
   */
  async startConversation(config: ConversationConfig & { resumedSessionId?: string }): Promise<{streamingId: string; systemInit: SystemInitMessage}> {
    const isResume = !!config.resumedSessionId;
    
    this.logger.debug('Start conversation requested', { 
      hasInitialPrompt: !!config.initialPrompt,
      promptLength: config.initialPrompt?.length,
      workingDirectory: config.workingDirectory,
      model: config.model,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      hasSystemPrompt: !!config.systemPrompt,
      claudePath: config.claudeExecutablePath || this.claudeExecutablePath,
      isResume,
      resumedSessionId: config.resumedSessionId,
      previousMessageCount: config.previousMessages?.length || 0
    });
    
    // If resuming and no working directory provided, fetch from original session
    let workingDirectory = config.workingDirectory;
    if (isResume && !workingDirectory && config.resumedSessionId) {
      const fetchedWorkingDirectory = await this.historyReader.getConversationWorkingDirectory(config.resumedSessionId);
      
      if (!fetchedWorkingDirectory) {
        throw new CUIError(
          'CONVERSATION_NOT_FOUND',
          `Could not find working directory for session ${config.resumedSessionId}`,
          404
        );
      }
      
      workingDirectory = fetchedWorkingDirectory;
      
      this.logger.debug('Found working directory for resume session', {
        sessionId: config.resumedSessionId,
        workingDirectory
      });
    }
    
    const args = isResume && config.resumedSessionId
      ? this.buildResumeArgs({ sessionId: config.resumedSessionId, message: config.initialPrompt, permissionMode: config.permissionMode })
      : this.buildStartArgs(config);
      
    const spawnConfig = {
      executablePath: config.claudeExecutablePath || this.claudeExecutablePath,
      cwd: workingDirectory || config.workingDirectory || process.cwd(),
      env: { ...process.env, ...this.envOverrides } as NodeJS.ProcessEnv
    };
    
    this.logger.debug('Spawn config prepared', {
      executablePath: spawnConfig.executablePath,
      cwd: spawnConfig.cwd,
      hasEnvOverrides: Object.keys(this.envOverrides).length > 0,
      envOverrideKeys: Object.keys(this.envOverrides),
      isResume
    });
    
    return this.executeConversationFlow(
      isResume ? 'resuming' : 'starting',
      isResume && config.resumedSessionId ? { resumeSessionId: config.resumedSessionId } : {},
      config,
      args,
      spawnConfig,
      isResume ? 'PROCESS_RESUME_FAILED' : 'PROCESS_START_FAILED',
      isResume ? 'Failed to resume Claude process' : 'Failed to start Claude process'
    );
  }


  /**
   * Stop a conversation
   */
  async stopConversation(streamingId: string): Promise<boolean> {
    this.logger.debug('Stopping conversation', { streamingId });
    const process = this.processes.get(streamingId);
    if (!process) {
      this.logger.warn('No process found for conversation', { streamingId });
      return false;
    }

    try {
      // Wait a bit for graceful shutdown
      this.logger.debug('Waiting for graceful shutdown', { streamingId });
      await new Promise(resolve => setTimeout(resolve, 100));

      // Force kill if still running
      if (!process.killed) {
        this.logger.debug('Process still running, sending SIGTERM', { streamingId, pid: process.pid });
        process.kill('SIGTERM');
        
        // If SIGTERM doesn't work, use SIGKILL
        const killTimeout = setTimeout(() => {
          if (!process.killed) {
            this.logger.warn('Process not responding to SIGTERM, sending SIGKILL', { streamingId, pid: process.pid });
            process.kill('SIGKILL');
          }
        }, 5000);
        
        // Track timeout for cleanup
        const sessionTimeouts = this.timeouts.get(streamingId) || [];
        sessionTimeouts.push(killTimeout);
        this.timeouts.set(streamingId, sessionTimeouts);
      }

      // Clean up timeouts
      const sessionTimeouts = this.timeouts.get(streamingId);
      if (sessionTimeouts) {
        sessionTimeouts.forEach(timeout => clearTimeout(timeout));
        this.timeouts.delete(streamingId);
      }

      // Clean up
      this.processes.delete(streamingId);
      this.outputBuffers.delete(streamingId);
      this.conversationConfigs.delete(streamingId);
      
      this.logger.info('Stopped and cleaned up process', { streamingId });
      return true;
    } catch (error) {
      this.logger.error('Error stopping conversation', error, { streamingId });
      return false;
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): string[] {
    const sessions = Array.from(this.processes.keys());
    this.logger.debug('Getting active sessions', { sessionCount: sessions.length });
    return sessions;
  }

  /**
   * Check if a session is active
   */
  isSessionActive(streamingId: string): boolean {
    const active = this.processes.has(streamingId);
    return active;
  }

  /**
   * Wait for the system init message from Claude CLI
   * This should always be the first message in the stream
   */
  async waitForSystemInit(streamingId: string): Promise<SystemInitMessage> {
    this.logger.debug('Waiting for system init message', { streamingId });

    return new Promise<SystemInitMessage>((resolve, reject) => {
      let isResolved = false;
      let stderrOutput = '';
      
      // Set up timeout (1 minute)
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          this.logger.error('Timeout waiting for system init message', {
            streamingId,
            stderrOutput: stderrOutput || '(no stderr output)'
          });
          
          // Include stderr output in error message if available
          let errorMessage = 'Timeout waiting for system initialization from Claude CLI';
          if (stderrOutput) {
            errorMessage += `. Error output: ${stderrOutput}`;
          }
          
          reject(new CUIError('SYSTEM_INIT_TIMEOUT', errorMessage, 500));
        }
      }, 60000);
      
      // Cleanup function to remove all listeners
      const cleanup = () => {
        clearTimeout(timeout);
        this.removeListener('claude-message', messageHandler);
        this.removeListener('process-closed', processClosedHandler);
        this.removeListener('process-error', processErrorHandler);
      };
      
      // Register timeout for cleanup on process termination
      const existingTimeouts = this.timeouts.get(streamingId) || [];
      existingTimeouts.push(timeout);
      this.timeouts.set(streamingId, existingTimeouts);

      // Listen for process exit before system init is received
      const processClosedHandler = ({ streamingId: closedStreamingId, code }: { streamingId: string; code: number | null }) => {
        if (closedStreamingId !== streamingId || isResolved) {
          return; // Not our process or already resolved
        }

        isResolved = true;
        cleanup();
        
        this.logger.error('Claude process exited before system init message', {
          streamingId,
          exitCode: code,
          stderrOutput: stderrOutput || '(no stderr output)'
        });

        // Create error message with Claude CLI output if available
        let errorMessage = 'Claude CLI process exited before sending system initialization message';
        if (stderrOutput) {
          // Extract Claude CLI's actual output from parser errors
          const claudeOutputMatch = stderrOutput.match(/Invalid JSON: (.+)/);
          if (claudeOutputMatch) {
            errorMessage += `. Claude CLI said: "${claudeOutputMatch[1]}"`;
          } else {
            errorMessage += `. Error output: ${stderrOutput}`;
          }
        }
        if (code !== null) {
          errorMessage += `. Exit code: ${code}`;
        }

        reject(new CUIError('CLAUDE_PROCESS_EXITED_EARLY', errorMessage, 500));
      };

      // Listen for process errors (including stderr output)
      const processErrorHandler = ({ streamingId: errorStreamingId, error }: { streamingId: string; error: string }) => {
        if (errorStreamingId !== streamingId) {
          return; // Not our process
        }

        // Capture stderr output for error context
        stderrOutput += error;
        this.logger.debug('Captured stderr output during system init wait', {
          streamingId,
          errorLength: error.length,
          totalStderrLength: stderrOutput.length
        });
      };

      // Listen for the first claude-message event for this streamingId
      const messageHandler = ({ streamingId: msgStreamingId, message }: { streamingId: string; message: StreamEvent }) => {
        if (msgStreamingId !== streamingId) {
          return; // Not for our session
        }

        if (isResolved) {
          return; // Already resolved
        }

        isResolved = true;
        cleanup();

        this.logger.debug('Received first message from Claude CLI', {
          streamingId,
          messageType: message?.type,
          messageSubtype: 'subtype' in message ? message.subtype : undefined,
          hasSessionId: 'session_id' in message ? !!message.session_id : false
        });

        // Validate that the first message is a system init message
        if (!message || message.type !== 'system' || !('subtype' in message) || message.subtype !== 'init') {
          this.logger.error('First message is not system init', {
            streamingId,
            actualType: message?.type,
            actualSubtype: 'subtype' in message ? message.subtype : undefined,
            expectedType: 'system',
            expectedSubtype: 'init'
          });
          reject(new CUIError('INVALID_SYSTEM_INIT', `Expected system init message as first message, but got: ${message?.type}/${'subtype' in message ? message.subtype : 'undefined'}`, 500));
          return;
        }

        // At this point, TypeScript knows message is SystemInitMessage
        const systemInitMessage = message as SystemInitMessage;
        
        // Validate required fields
        const requiredFields = ['session_id', 'cwd', 'tools', 'mcp_servers', 'model', 'permissionMode', 'apiKeySource'] as const;
        const missingFields = requiredFields.filter(field => systemInitMessage[field] === undefined);
        
        if (missingFields.length > 0) {
          this.logger.error('System init message missing required fields', {
            streamingId,
            missingFields,
            availableFields: Object.keys(systemInitMessage)
          });
          reject(new CUIError('INCOMPLETE_SYSTEM_INIT', `System init message missing required fields: ${missingFields.join(', ')}`, 500));
          return;
        }

        this.logger.debug('Successfully received valid system init message', {
          streamingId,
          sessionId: systemInitMessage.session_id,
          cwd: systemInitMessage.cwd,
          model: systemInitMessage.model,
          toolCount: systemInitMessage.tools?.length || 0,
          mcpServerCount: systemInitMessage.mcp_servers?.length || 0
        });

        // Register active session immediately when we have the session_id
        // Include optimistic context if available
        const config = this.conversationConfigs.get(streamingId);
        
        if (this.conversationStatusManager && config) {
          const optimisticContext = {
            initialPrompt: config.initialPrompt || '',
            workingDirectory: config.workingDirectory || process.cwd(),
            model: config.model || 'default',
            timestamp: new Date().toISOString(),
            inheritedMessages: config.previousMessages
          };
          
          this.conversationStatusManager.registerActiveSession(
            streamingId, 
            systemInitMessage.session_id, 
            optimisticContext
          );
          this.logger.debug('Registered conversation context', {
            streamingId,
            claudeSessionId: systemInitMessage.session_id,
            inheritedMessageCount: config.previousMessages?.length || 0
          });
        } else {
          // Fallback to old behavior if service not set
          this.statusTracker.registerActiveSession(streamingId, systemInitMessage.session_id);
          this.logger.debug('Registered active session with status tracker (no optimistic service)', {
            streamingId,
            claudeSessionId: systemInitMessage.session_id
          });
        }

        resolve(systemInitMessage);
      };

      // Set up all event listeners
      this.on('claude-message', messageHandler);
      this.on('process-closed', processClosedHandler);
      this.on('process-error', processErrorHandler);
    });
  }

  /**
   * Execute common conversation flow for both start and resume operations
   */
  private async executeConversationFlow(
    operation: string,
    loggerContext: Record<string, unknown>,
    config: ConversationConfig,
    args: string[],
    spawnConfig: { executablePath: string; cwd: string; env: NodeJS.ProcessEnv },
    errorCode: string,
    errorPrefix: string
  ): Promise<{streamingId: string; systemInit: SystemInitMessage}> {
    const streamingId = uuidv4(); // CUI's internal streaming identifier
    
    // Store config for use in waitForSystemInit
    this.conversationConfigs.set(streamingId, config);
    
    try {
      // Validate Claude executable before proceeding
      if (this.fileSystemService) {
        await this.fileSystemService.validateExecutable(spawnConfig.executablePath);
      }
      
      this.logger.debug(`${operation.charAt(0).toUpperCase() + operation.slice(1)} conversation`, { 
        streamingId,
        operation,
        configKeys: Object.keys(config),
        argCount: args.length,
        ...loggerContext
      });
      this.logger.debug(`Built Claude ${operation} args`, { 
        streamingId,
        args,
        argsString: args.join(' '),
        ...loggerContext
      });
      
      // Set up system init promise before spawning process
      const systemInitPromise = this.waitForSystemInit(streamingId);
      
      // Add streamingId to environment for MCP server to use
      // Filter out debugging-related environment variables that would cause 
      // the VSCode debugger to attach to the Claude CLI child process
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { NODE_OPTIONS, VSCODE_INSPECTOR_OPTIONS, ...cleanEnv } = spawnConfig.env;
      
      // Validate working directory before spawning
      this.logger.debug('Validating working directory', {
        streamingId,
        workingDirectory: spawnConfig.cwd,
        originalWorkingDirectory: config.workingDirectory
      });

      if (!spawnConfig.cwd || typeof spawnConfig.cwd !== 'string') {
        this.logger.error('Invalid working directory provided', {
          streamingId,
          workingDirectory: spawnConfig.cwd,
          type: typeof spawnConfig.cwd
        });
        throw new CUIError('INVALID_WORKING_DIRECTORY', `Invalid working directory: ${spawnConfig.cwd}`, 400);
      }

      // Strip quotes from working directory if present (common issue with frontend)
      const stripQuotes = (pathStr: string): string => {
        // Remove leading and trailing quotes
        if ((pathStr.startsWith('"') && pathStr.endsWith('"')) ||
            (pathStr.startsWith("'") && pathStr.endsWith("'"))) {
          return pathStr.slice(1, -1);
        }
        return pathStr;
      };

      const strippedCwd = stripQuotes(spawnConfig.cwd);
      this.logger.debug('Working directory quote stripping', {
        streamingId,
        originalCwd: spawnConfig.cwd,
        strippedCwd
      });

      // Normalize the working directory path, especially on Windows
      const normalizedCwd = path.resolve(strippedCwd);
      this.logger.debug('Working directory normalized', {
        streamingId,
        originalCwd: spawnConfig.cwd,
        strippedCwd,
        normalizedCwd
      });

      // Validate that the working directory exists
      if (!existsSync(normalizedCwd)) {
        this.logger.error('Working directory does not exist', {
          streamingId,
          originalCwd: spawnConfig.cwd,
          strippedCwd,
          normalizedCwd,
          exists: false
        });
        throw new CUIError('WORKING_DIRECTORY_NOT_FOUND', `Working directory does not exist: ${normalizedCwd}`, 404);
      }

      this.logger.info('Working directory validated', {
        streamingId,
        normalizedCwd,
        exists: true
      });

      const envWithStreamingId = {
        ...cleanEnv,
        CUI_STREAMING_ID: streamingId,
        PWD: normalizedCwd,
        INIT_CWD: normalizedCwd
      };

      // ENHANCED: Intelligent retry logic with error categorization
      let process: any;
      let lastError: Error | null = null;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          this.logger.debug(`Spawn attempt ${attempt}/${maxRetries}`, {
            streamingId,
            executablePath: spawnConfig.executablePath,
            workingDirectory: normalizedCwd
          });

          const spawnStartTime = Date.now();
          process = await this.spawnProcess(
            { ...spawnConfig, cwd: normalizedCwd, env: envWithStreamingId },
            args,
            streamingId,
            attempt,
            maxRetries,
            spawnStartTime
          );

          // Success - break out of retry loop
          this.logger.info(`Spawn succeeded on attempt ${attempt}`, {
            streamingId,
            pid: process.pid,
            timeTaken: Date.now() - spawnStartTime
          });
          break;

        } catch (spawnError: any) {
          lastError = spawnError;
          const timeSinceStart = Date.now() - (spawnError.timeSinceStart || 0);

          // Categorize the error to determine retry strategy
          const isPathRelated = ['ENOENT', 'EACCES', 'EPERM', 'EEXIST'].includes(spawnError.code);
          const isTimingRelated = ['ETIMEDOUT', 'ECONNRESET', 'EPIPE'].includes(spawnError.code);
          const isResourceRelated = ['EMFILE', 'ENFILE', 'ENOMEM'].includes(spawnError.code);
          const isCUIError = spawnError instanceof CUIError;

          this.logger.warn(`Spawn attempt ${attempt} failed`, {
            streamingId,
            errorCode: spawnError.code,
            errorMessage: spawnError.message,
            timeSinceStart,
            isPathRelated,
            isTimingRelated,
            isResourceRelated,
            isCUIError,
            errorType: spawnError.constructor.name
          });

          // Decide whether to retry based on error type
          if (isPathRelated) {
            // Path-related errors should fail fast - no retries needed
            this.logger.error('Path-related error detected - failing fast without retries', {
              streamingId,
              errorCode: spawnError.code,
              errorMessage: spawnError.message
            });
            throw spawnError;
          }

          if (isCUIError && spawnError.code === 'CLAUDE_NOT_FOUND') {
            // Claude not found should fail fast
            this.logger.error('Claude executable not found - failing fast', {
              streamingId,
              attemptedPath: spawnConfig.executablePath
            });
            throw spawnError;
          }

          if (attempt === maxRetries) {
            // Last attempt failed - give up
            this.logger.error(`All ${maxRetries} spawn attempts failed`, {
              streamingId,
              lastErrorCode: spawnError.code,
              lastErrorMessage: spawnError.message,
              totalAttempts: attempt
            });
            throw spawnError;
          }

          // Calculate retry delay based on error type
          let retryDelay = 1000; // Base delay

          if (isTimingRelated) {
            retryDelay = 2000 * attempt; // Exponential backoff for timing issues
          } else if (isResourceRelated) {
            retryDelay = 3000 * attempt; // Longer backoff for resource issues
          } else {
            retryDelay = 1000 * attempt; // Standard backoff for unknown errors
          }

          this.logger.info(`Retrying spawn in ${retryDelay}ms`, {
            streamingId,
            attempt,
            maxRetries,
            retryDelay,
            reason: spawnError.code || 'unknown error'
          });

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

      // Ensure we have a valid process at this point
      if (!process) {
        throw lastError || new Error('Failed to spawn Claude process after retries');
      }
      
      this.processes.set(streamingId, process);
      this.setupProcessHandlers(streamingId, process);
      
      // Handle spawn errors by listening for our custom event
      const spawnErrorPromise = new Promise<never>((_, reject) => {
        this.once('spawn-error', (error) => {
          this.processes.delete(streamingId);
          reject(error);
        });
      });
      
      // Wait a bit to see if spawn fails immediately
      this.logger.debug('Waiting for spawn validation', { streamingId, ...loggerContext });
      const delayPromise = new Promise<string>(resolve => {
        setTimeout(() => {
          this.logger.debug('Spawn validation period passed, process appears stable', { streamingId, ...loggerContext });
          this.removeAllListeners('spawn-error');
          resolve(streamingId);
        }, 100);
      });
      
      await Promise.race([spawnErrorPromise, delayPromise]);
      
      // Now wait for the system init message
      this.logger.debug('Process spawned successfully, waiting for system init message', { streamingId, ...loggerContext });
      const systemInit = await systemInitPromise;
      
      // Check if cwd is a git repository and set initial_commit_head for new session
      if (this.sessionInfoService && this.fileSystemService) {
        try {
          if (await this.fileSystemService.isGitRepository(systemInit.cwd)) {
            const gitHead = await this.fileSystemService.getCurrentGitHead(systemInit.cwd);
            if (gitHead) {
              await this.sessionInfoService.updateSessionInfo(systemInit.session_id, {
                initial_commit_head: gitHead
              });
              this.logger.debug('Set initial commit head for new session', {
                sessionId: systemInit.session_id,
                gitHead
              });
            }
          }
        } catch (error) {
          this.logger.warn('Failed to set initial commit head for new session', {
            sessionId: systemInit.session_id,
            cwd: systemInit.cwd,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      this.logger.debug(`${operation.charAt(0).toUpperCase() + operation.slice(1)} conversation successfully`, {
        streamingId,
        sessionId: systemInit.session_id,
        model: systemInit.model,
        cwd: systemInit.cwd,
        processCount: this.processes.size,
        ...loggerContext
      });
      
      return { streamingId, systemInit };
    } catch (error) {
      this.logger.error(`Error ${operation} conversation`, error, {
        streamingId,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorCode: error instanceof CUIError ? error.code : undefined,
        ...loggerContext
      });
      
      // Clean up any resources if process fails
      const timeouts = this.timeouts.get(streamingId);
      if (timeouts) {
        timeouts.forEach(timeout => clearTimeout(timeout));
        this.timeouts.delete(streamingId);
      }
      this.processes.delete(streamingId);
      this.outputBuffers.delete(streamingId);
      this.conversationConfigs.delete(streamingId);
      
      if (error instanceof CUIError) {
        throw error;
      }
      throw new CUIError(errorCode, `${errorPrefix}: ${error}`, 500);
    }
  }

  private buildBaseArgs(): string[] {
    return [
      // Note: Removed -p flag to allow streaming conversation mode
      // Using conversation mode instead of print mode for proper JSONL output
    ];
  }

  private buildResumeArgs(config: { sessionId: string; message: string; permissionMode?: string }): string[] {
    this.logger.debug('Building Claude resume args', { 
      sessionId: config.sessionId,
      messagePreview: config.message.substring(0, 50) + (config.message.length > 50 ? '...' : '')
    });
    const args = this.buildBaseArgs();
    
    args.push(
      '--resume', config.sessionId, // Resume existing session
      config.message, // Message to continue with
      '--output-format', 'stream-json', // JSONL output format
      '--verbose' // Required when using stream-json with print mode
    );

    // Add permission mode if provided
    if (config.permissionMode) {
      args.push('--permission-mode', config.permissionMode);
    }

    // Add MCP config if available for resume
    if (this.mcpConfigPath) {
      args.push('--mcp-config', this.mcpConfigPath);
      // Add the permission prompt tool flag
      args.push('--permission-prompt-tool', 'mcp__cui-permissions__approval_prompt');
      // Allow the MCP permission tool
      args.push('--allowedTools', 'mcp__cui-permissions__approval_prompt');
    }

    this.logger.debug('Built Claude resume args', { args, hasMCPConfig: !!this.mcpConfigPath });
    return args;
  }

  private buildStartArgs(config: ConversationConfig): string[] {
    this.logger.debug('Building Claude start args', {
      hasInitialPrompt: !!config.initialPrompt,
      promptPreview: config.initialPrompt ? config.initialPrompt.substring(0, 50) + (config.initialPrompt.length > 50 ? '...' : '') : null,
      workingDirectory: config.workingDirectory,
      model: config.model
    });
    const args = this.buildBaseArgs();

    // In conversation mode, we add the output format first
    args.push(
      '--output-format', 'stream-json', // JSONL output format
      '--verbose' // Required for stream-json format
    );

    // Add initial prompt as a message argument in conversation mode
    if (config.initialPrompt) {
      args.push(config.initialPrompt);
    }

    // Add working directory access
    // if (config.workingDirectory) {
    //   args.push('--add-dir', config.workingDirectory);
    // }

    // Add model specification
    if (config.model) {
      args.push('--model', config.model);
    }

    // Add allowed tools
    if (config.allowedTools && config.allowedTools.length > 0) {
      args.push('--allowedTools', config.allowedTools.join(','));
    }

    // Add disallowed tools
    if (config.disallowedTools && config.disallowedTools.length > 0) {
      args.push('--disallowedTools', config.disallowedTools.join(','));
    }

    // Add system prompt
    if (config.systemPrompt) {
      args.push('--system-prompt', config.systemPrompt);
    }

    // Add permission mode if provided
    if (config.permissionMode) {
      args.push('--permission-mode', config.permissionMode);
    }

    // Add MCP config if available
    if (this.mcpConfigPath) {
      args.push('--mcp-config', this.mcpConfigPath);
    }

    this.logger.debug('Built Claude args', { args, hasMCPConfig: !!this.mcpConfigPath });
    return args;
  }

  /**
   * Consolidated method to spawn Claude processes for both start and resume operations
   */
  private async spawnProcess(
    spawnConfig: { executablePath: string; cwd: string; env: NodeJS.ProcessEnv },
    args: string[],
    streamingId: string,
    attempt: number = 1,
    maxRetries: number = 3,
    spawnStartTime?: number
  ): Promise<ChildProcess> {
    const { executablePath, cwd } = spawnConfig;
    let { env } = spawnConfig;

    // Inject router proxy if enabled
    if (this.routerService?.isEnabled()) {
      env = {
        ...env,
        ANTHROPIC_BASE_URL: this.routerService.getProxyUrl(),
        ANTHROPIC_API_KEY: 'router-managed'
      };

      this.logger.info('Using router proxy', {
        streamingId,
        proxyUrl: this.routerService.getProxyUrl()
      });
    }
    
    // Check if MCP config is in args and validate it
    const mcpConfigIndex = args.indexOf('--mcp-config');
    if (mcpConfigIndex !== -1 && mcpConfigIndex + 1 < args.length) {
      const mcpConfigPath = args[mcpConfigIndex + 1];
      this.logger.debug('MCP config specified', { 
        streamingId,
        mcpConfigPath,
        exists: existsSync(mcpConfigPath)
      });
      
      // Try to read and log the MCP config content
      try {
        const mcpConfigContent = readFileSync(mcpConfigPath, 'utf-8');
        this.logger.debug('MCP config content', { 
          streamingId,
          mcpConfig: JSON.parse(mcpConfigContent) 
        });
      } catch (error) {
        this.logger.error('Failed to read MCP config', { streamingId, error });
      }
    }
    
    this.logger.info('Starting Claude process spawn', {
      streamingId,
      executablePath,
      args,
      cwd,
      PATH: env.PATH ? 'SET' : 'NOT_SET',
      nodeVersion: process.version,
      platform: process.platform,
      processArch: process.arch,
      isWindows: process.platform === 'win32'
    });

    try {
      this.logger.debug('Configuring spawn parameters', {
        streamingId,
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'pipe',
        shell: process.platform === 'win32'
      });

      // Log the exact command for debugging
      const fullCommand = `${executablePath} ${args.join(' ')}`;
      this.logger.info('SPAWNING CLAUDE COMMAND: ' + fullCommand, {
        streamingId,
        fullCommand,
        executablePath,
        args,
        cwd,
        envKeys: Object.keys(env).filter(key => !key.includes('KEY') && !key.includes('TOKEN')),
        argsCount: args.length
      });

      // On Windows, use shell option to handle .cmd files and paths with spaces
      const isWindows = process.platform === 'win32';

      // Enhanced Windows path handling
      let finalExecutablePath = executablePath;
      if (isWindows) {
        // Handle different Windows executable types
        if (executablePath.endsWith('.cmd') || executablePath.endsWith('.bat')) {
          // For batch files, we need the shell
          this.logger.debug('Using Windows batch file execution', {
            streamingId,
            executableType: 'batch',
            executablePath
          });
        }

        // Quote the executable path if it contains spaces and isn't already quoted
        if (executablePath.includes(' ') && !executablePath.startsWith('"') && !executablePath.endsWith('"')) {
          finalExecutablePath = `"${executablePath}"`;
          this.logger.debug('Quoted executable path for Windows', {
            streamingId,
            originalPath: executablePath,
            quotedPath: finalExecutablePath
          });
        }
      }

      // Determine shell usage based on executable type and path characteristics
      const needsShell = isWindows && (
        executablePath.endsWith('.cmd') ||
        executablePath.endsWith('.bat') ||
        finalExecutablePath !== executablePath || // Path was quoted
        args.some(arg => arg.includes(' ')) // Args contain spaces
      );

      this.logger.debug('Spawn configuration', {
        streamingId,
        executablePath,
        finalExecutablePath,
        needsShell,
        isWindows,
        hasSpacesInPath: executablePath.includes(' ') || finalExecutablePath.includes(' '),
        hasSpacesInArgs: args.some(arg => arg.includes(' '))
      });

      this.logger.info('Attempting to spawn Claude process', {
        streamingId,
        command: `${finalExecutablePath} ${args.join(' ')}`,
        cwd: cwd,
        envKeys: Object.keys(env).slice(0, 10), // Show first 10 env keys
        envCount: Object.keys(env).length,
        needsShell,
        stdioConfig: { stdin: 'inherit', stdout: 'pipe', stderr: 'pipe' }
      });

      const claudeProcess = spawn(finalExecutablePath, args, {
        cwd,
        env,
        stdio: ['inherit', 'pipe', 'pipe'], // stdin inherited, stdout/stderr piped for capture
        shell: needsShell
      });
      
      // Handle spawn errors (like ENOENT when claude is not found)
      claudeProcess.on('error', (error: Error & NodeJS.ErrnoException) => {
        const actualSpawnStartTime = spawnStartTime || Date.now();
    const timeSinceStart = Date.now() - actualSpawnStartTime;

        // Enhanced error categorization and diagnostics
        const errorContext = {
          streamingId,
          errorCode: error.code,
          errorErrno: error.errno,
          errorSyscall: error.syscall,
          errorPath: error.path,
          errorSpawnargs: (error as Error & NodeJS.ErrnoException & { spawnargs?: string[] }).spawnargs,
          timeSinceStart,
          attempt,
          maxRetries,
          executablePath,
          workingDirectory: cwd,
          platform: process.platform,
          isWindows,
          needsShell
        };

        this.logger.error('Claude process spawn error', error, errorContext);

        // Log immediate post-spawn diagnostics with error categorization
        console.error('🔍 [IMMEDIATE POST-SPAWN DIAGNOSTICS]');
        console.error('   Error type:', error.constructor.name);

        if (error.code) {
          console.error('   Error code:', error.code);
          const errorMeaning = this.getErrorMeaning(error.code);
          console.error('   Error meaning:', errorMeaning);

          // Categorize error for retry decision
          const isPathRelated = ['ENOENT', 'EACCES', 'EPERM', 'EEXIST'].includes(error.code);
          const isTimingRelated = ['ETIMEDOUT', 'ECONNRESET', 'EPIPE'].includes(error.code);
          const isResourceRelated = ['EMFILE', 'ENFILE', 'ENOMEM'].includes(error.code);

          if (isPathRelated) {
            console.error('   🚫 PATH-RELATED ERROR (should fail fast)');
          } else if (isTimingRelated) {
            console.error('   ⏰ TIMING-RELATED ERROR (should retry)');
          } else if (isResourceRelated) {
            console.error('   💾 RESOURCE-RELATED ERROR (should retry with delay)');
          } else {
            console.error('   ❓ UNKNOWN ERROR TYPE (will retry cautiously)');
          }
        }

        if (error.errno) {
          console.error('   System errno:', error.errno);
          console.error('   Errno description:', error.errno);
        }

        if (error.path) {
          console.error('   Executable path:', error.path);
          console.error('   Path exists check:', fs.existsSync(error.path) ? '✅ EXISTS' : '❌ MISSING');
        }

        if (error.spawnargs) {
          console.error('   Spawn args:', error.spawnargs.map(arg =>
            arg.includes(' ') ? `"${arg}"` : arg
          ).join(' '));
        }

        if (error.signal) {
          console.error('   Signal received:', error.signal);
          console.error('   Signal meaning:', this.getSignalMeaning(error.signal));
        }

        if (error.status) {
          console.error('   Exit status:', error.status);
          console.error('   Exit status meaning:', this.getExitStatusMeaning(error.status));
        }

        // Log timing context
        console.error('   ⏱️ Time to failure:', `${timeSinceStart}ms`);
        console.error('   🔄 Retry count:', `${attempt}/${maxRetries}`);

        // Suggest next action based on error analysis
        if (timeSinceStart < 100) {
          console.error('   💡 SUGGESTION: Failed very quickly - likely path/configuration issue');
        } else if (timeSinceStart > 5000) {
          console.error('   💡 SUGGESTION: Took time to fail - might be timeout or resource issue');
        }

        // Emit appropriate error based on analysis
        if (error.code === 'ENOENT') {
          this.logger.error('Claude executable not found', {
            streamingId,
            attemptedPath: executablePath,
            PATH: env.PATH,
            workingDirectory: cwd
          });
          this.emit('spawn-error', new CUIError('CLAUDE_NOT_FOUND', 'Claude CLI not found. Please ensure Claude is installed and in PATH.', 500));
        } else if (['EACCES', 'EPERM'].includes(error.code || '')) {
          this.emit('spawn-error', new CUIError('PERMISSION_DENIED', `Permission denied accessing Claude executable: ${error.message}`, 500));
        } else {
          this.emit('spawn-error', new CUIError('PROCESS_SPAWN_FAILED', `Failed to spawn Claude process: ${error.message}`, 500));
        }
      });
      
      // Enhanced PID assignment with retry logic for Windows
      let retryCount = 0;
      const maxRetries = isWindows ? 10 : 5; // More retries on Windows
      const retryDelay = isWindows ? 200 : 100; // Longer delays on Windows

      while (!claudeProcess.pid && retryCount < maxRetries) {
        this.logger.debug(`Waiting for PID assignment (attempt ${retryCount + 1}/${maxRetries})`, {
          streamingId,
          killed: claudeProcess.killed,
          exitCode: claudeProcess.exitCode,
          signalCode: claudeProcess.signalCode,
          platform: process.platform
        });

        // Wait for PID assignment with exponential backoff
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(1.5, retryCount)));
        retryCount++;
      }

      if (!claudeProcess.pid) {
        this.logger.error('Failed to spawn Claude process - no PID assigned after retries', {
          streamingId,
          retryCount,
          maxRetries,
          killed: claudeProcess.killed,
          exitCode: claudeProcess.exitCode,
          signalCode: claudeProcess.signalCode,
          spawnfile: claudeProcess.spawnfile,
          spawnargs: claudeProcess.spawnargs,
          platform: process.platform,
          isWindows,
          executablePath,
          cwd
        });

        // On Windows, try alternative spawning approach
        if (isWindows) {
          this.logger.warn('Attempting alternative Windows spawn approach', { streamingId });
          try {
            // Try without shell first
            const altProcess = spawn(executablePath, args, {
              cwd,
              env,
              stdio: ['inherit', 'pipe', 'pipe']
            });

            // Wait a bit for the alternative approach
            await new Promise(resolve => setTimeout(resolve, 500));

            if (altProcess.pid) {
              this.logger.info('Alternative Windows spawn approach succeeded', {
                streamingId,
                pid: altProcess.pid,
                spawnfile: altProcess.spawnfile
              });
              return altProcess;
            } else {
              altProcess.kill(); // Clean up the failed alternative process
            }
          } catch (altError) {
            this.logger.error('Alternative Windows spawn approach also failed', {
              streamingId,
              error: altError instanceof Error ? altError.message : String(altError)
            });
          }
        }

        throw new Error(`Failed to spawn Claude process - no PID assigned after ${retryCount} retries${isWindows ? ' (including Windows alternative approach)' : ''}`);
      }
      
      this.logger.info('Claude process spawned successfully', { 
        streamingId,
        pid: claudeProcess.pid,
        spawnfile: claudeProcess.spawnfile,
        spawnargs: claudeProcess.spawnargs
      });
      return claudeProcess;
    } catch (error) {
      this.logger.error('Error in spawnProcess', error, { streamingId });
      if (error instanceof CUIError) {
        throw error;
      }
      throw new CUIError('PROCESS_SPAWN_FAILED', `Failed to spawn Claude process: ${error}`, 500);
    }
  }

  private setupProcessHandlers(streamingId: string, process: ChildProcess): void {
    this.logger.debug('Setting up process handlers', { streamingId, pid: process.pid });
    
    // Create JSONL parser for Claude output
    const parser = new JsonLinesParser();
    
    // Initialize output buffer for this session
    this.outputBuffers.set(streamingId, '');

    // Handle stdout - pipe through JSONL parser
    if (process.stdout) {
      this.logger.debug('Setting up stdout handler', { streamingId });
      process.stdout.setEncoding('utf8');
      process.stdout.pipe(parser);

      // Handle parsed JSONL messages from Claude
      parser.on('data', (message) => {
        this.logger.debug('Received Claude message', { 
          streamingId,
          messageType: message?.type,
          hasContent: !!message?.content,
          contentLength: message?.content?.length,
          messageKeys: message ? Object.keys(message) : [],
          timestamp: new Date().toISOString()
        });
        this.handleClaudeMessage(streamingId, message);
      });

      parser.on('error', (error) => {
        this.logger.error('Parser error', error, {
          streamingId,
          errorType: error.name,
          errorMessage: error.message,
          bufferState: this.outputBuffers.get(streamingId)?.length || 0
        });
        this.handleProcessError(streamingId, error);
      });
    } else {
      this.logger.warn('No stdout stream available', { streamingId });
    }

    // Handle stderr output
    if (process.stderr) {
      this.logger.debug('Setting up stderr handler', { streamingId });
      process.stderr.setEncoding('utf8');
      let stderrBuffer = '';
      
      process.stderr.on('data', (data) => {
        const stderrContent = data.toString();
        stderrBuffer += stderrContent;
        
        // ALWAYS log stderr content at error level for visibility
        this.logger.error('Process stderr output received', { 
          streamingId,
          stderr: stderrContent,
          dataLength: stderrContent.length,
          fullStderr: stderrBuffer,
          containsMCP: stderrContent.toLowerCase().includes('mcp'),
          containsPermission: stderrContent.toLowerCase().includes('permission'),
          containsError: stderrContent.toLowerCase().includes('error')
        });
        
        // Store stderr for debugging
        const existingBuffer = this.outputBuffers.get(streamingId) || '';
        this.outputBuffers.set(streamingId, existingBuffer + '\n[STDERR]: ' + stderrContent);
        
        // Emit stderr for error tracking
        this.emit('process-error', { streamingId, error: stderrContent });
      });
    } else {
      this.logger.warn('No stderr stream available', { streamingId });
    }

    // Handle process termination
    process.on('close', (code, _signal) => {
      this.handleProcessClose(streamingId, code);
    });

    process.on('error', (error) => {
      this.logger.error('Process error', error, { streamingId });
      this.handleProcessError(streamingId, error);
    });

    // Handle process exit
    process.on('exit', (code, signal) => {
      this.logger.debug('Process exited', { 
        streamingId,
        exitCode: code,
        signal: signal,
        normalExit: code === 0,
        timestamp: new Date().toISOString(),
        outputBuffer: this.outputBuffers.get(streamingId) || 'No output captured'
      });
      this.handleProcessClose(streamingId, code);
    });
  }

  private handleClaudeMessage(streamingId: string, message: StreamEvent): void {
    this.logger.debug('Handling Claude message', { 
      streamingId, 
      messageType: message?.type,
      isError: message?.type === 'error',
      isResult: message?.type === 'result'
    });
    this.emit('claude-message', { streamingId, message });
  }

  private handleProcessClose(streamingId: string, code: number | null): void {
    
    // Clear any pending timeouts for this session
    const timeouts = this.timeouts.get(streamingId);
    if (timeouts) {
      timeouts.forEach(timeout => clearTimeout(timeout));
      this.timeouts.delete(streamingId);
    }
    
    this.processes.delete(streamingId);
    this.outputBuffers.delete(streamingId);
    const config = this.conversationConfigs.get(streamingId);
    this.conversationConfigs.delete(streamingId);
    
    // Send notification if service is available
    if (this.notificationService && config) {
      // Get session ID from conversation status or config
      const sessionId = this.statusTracker.getSessionId(streamingId) || 'unknown';
      
      // Try to get conversation metadata for summary
      this.historyReader.getConversationMetadata(sessionId)
        .then((metadata) => {
          if (this.notificationService && metadata) {
            return this.notificationService.sendConversationEndNotification(
              streamingId,
              sessionId,
              metadata.summary
            );
          }
        })
        .catch((error: Error) => {
          this.logger.error('Failed to send conversation end notification', error);
        });
    }
    
    this.emit('process-closed', { streamingId, code });
  }

  private handleProcessError(streamingId: string, error: Error | Buffer): void {
    const errorMessage = error.toString();
    const isBuffer = Buffer.isBuffer(error);

    this.logger.error('Process error occurred', {
      streamingId,
      error: errorMessage,
      errorType: isBuffer ? 'stderr-output' : error.constructor.name,
      errorLength: errorMessage.length,
      processStillActive: this.processes.has(streamingId),
      timestamp: new Date().toISOString()
    });

    this.emit('process-error', { streamingId, error: errorMessage });
  }

  // Helper methods for enhanced error diagnostics
  private getErrorMeaning(errorCode: string): string {
    const errorMeanings: Record<string, string> = {
      'ENOENT': 'File or directory not found',
      'EACCES': 'Permission denied',
      'EPERM': 'Operation not permitted',
      'EEXIST': 'File already exists',
      'ETIMEDOUT': 'Operation timed out',
      'ECONNRESET': 'Connection reset by peer',
      'EPIPE': 'Broken pipe',
      'EMFILE': 'Too many open files',
      'ENFILE': 'System limit on open files reached',
      'ENOMEM': 'Not enough memory'
    };
    return errorMeanings[errorCode] || 'Unknown error code';
  }

  private getSignalMeaning(signal: string): string {
    const signalMeanings: Record<string, string> = {
      'SIGTERM': 'Termination signal',
      'SIGINT': 'Interrupt signal (Ctrl+C)',
      'SIGKILL': 'Kill signal (cannot be caught)',
      'SIGSEGV': 'Segmentation violation',
      'SIGABRT': 'Abort signal',
      'SIGFPE': 'Floating point exception',
      'SIGILL': 'Illegal instruction',
      'SIGBUS': 'Bus error'
    };
    return signalMeanings[signal] || 'Unknown signal';
  }

  private getExitStatusMeaning(status: number): string {
    if (status === 0) return 'Normal exit';
    if (status === 1) return 'General error';
    if (status === 2) return 'Misuse of shell builtins';
    if (status === 126) return 'Command invoked cannot execute';
    if (status === 127) return 'Command not found';
    if (status === 128) return 'Invalid exit argument';
    if (status >= 129 && status <= 192) return `Fatal error signal (${status - 128})`;
    return `Unknown exit status (${status})`;
  }
}