/**
 * useKanbanTaskMonitor Hook
 *
 * Monitors active Kanban tasks and subscribes to their SSE streams.
 * Updates task status in real-time based on agent activity.
 *
 * Usage:
 *   const { activeTaskIds } = useKanbanTaskMonitor(tasks);
 */

import { useEffect, useRef, useCallback } from 'react';
import { useStreaming } from './useStreaming';
import { kanbanStorage } from '../services/kanban-storage';
import type { KanbanTask } from '../types/kanban';
import type { StreamEvent, ResultStreamMessage } from '../types';

interface TaskMonitor {
  taskId: string;
  streamingId: string;
  isConnected: boolean;
}

/**
 * Hook to monitor multiple active Kanban tasks via SSE
 */
export function useKanbanTaskMonitor(
  tasks: KanbanTask[],
  onTaskUpdate?: (taskId: string, updates: Partial<KanbanTask>) => void
) {
  const monitorsRef = useRef<Map<string, TaskMonitor>>(new Map());

  // Get active tasks that need monitoring - include active and waiting tasks
  const activeTasks = tasks.filter(
    task => task.streamingId &&
    (task.agentStatus === 'active' || task.agentStatus === 'waiting')
  );

  // Handle stream events for a specific task
  const createMessageHandler = useCallback(
    (taskId: string) => (event: StreamEvent) => {
      const task = kanbanStorage.getTask(taskId);
      if (!task) return;

      console.log('[KanbanMonitor] Event for task', taskId, event.type);

      let updates: Partial<KanbanTask> = {};

      switch (event.type) {
        case 'connected':
          updates = {
            agentStatus: 'active',
            statusMessage: 'Agent connected',
          };
          break;

        case 'assistant':
          // Agent is actively working - update progress based on conversation activity
          const currentProgress = task.progress || 0;
          const newProgress = Math.min(currentProgress + 5, 90); // Incrementally increase progress, max 90% until completion

          updates = {
            agentStatus: 'active',
            statusMessage: 'Agent working...',
            progress: newProgress,
          };
          break;

        case 'permission_request':
          // Agent is waiting for permission
          updates = {
            agentStatus: 'waiting',
            statusMessage: 'Waiting for permission',
          };
          break;

        case 'result':
          // Conversation completed
          const resultEvent = event as ResultStreamMessage;
          const isSuccess = resultEvent.subtype === 'success' && !resultEvent.is_error;

          updates = {
            agentStatus: isSuccess ? 'completed' : 'error',
            statusMessage: isSuccess
              ? `Task completed successfully (${resultEvent.num_turns} turns, ${Math.round(resultEvent.duration_ms / 1000)}s)`
              : `Task failed: ${resultEvent.error || 'Unknown error'}`,
            completedAt: new Date().toISOString(),
            column: isSuccess ? 'done' : task.column, // Move to done if successful
            progress: isSuccess ? 100 : task.progress, // Set progress to 100% on success
          };

          console.log('[KanbanMonitor] Task completion detected', taskId, {
            isSuccess,
            duration: resultEvent.duration_ms,
            turns: resultEvent.num_turns,
            finalStatus: isSuccess ? 'completed' : 'error',
          });
          break;

        case 'error':
          // Stream error
          updates = {
            agentStatus: 'error',
            statusMessage: `Error: ${event.error}`,
          };
          break;

        case 'closed':
          // Stream closed - check if task was completed or just disconnected
          if (task.agentStatus === 'active') {
            updates = {
              agentStatus: 'paused',
              statusMessage: 'Agent disconnected - may resume automatically',
            };
            console.log('[KanbanMonitor] Task disconnected while active', taskId);
          } else if (task.agentStatus === 'waiting') {
            updates = {
              agentStatus: 'paused',
              statusMessage: 'Permission request timed out',
            };
          }
          break;
      }

      // Update task if we have changes
      if (Object.keys(updates).length > 0) {
        try {
          const updatedTask = kanbanStorage.updateTask(taskId, updates);
          console.log('[KanbanMonitor] Updated task', taskId, updates);

          // Notify parent component
          onTaskUpdate?.(taskId, updates);

          // If task is completed or error, we can stop monitoring it
          if (updates.agentStatus === 'completed' || updates.agentStatus === 'error') {
            console.log('[KanbanMonitor] Task finished, stopping monitoring', taskId);
            // Remove from active monitors after a short delay to allow final UI updates
            setTimeout(() => {
              monitorsRef.current.delete(taskId);
            }, 1000);
          }
        } catch (err) {
          console.error('[KanbanMonitor] Failed to update task:', err);
        }
      }
    },
    [onTaskUpdate]
  );

  // Monitor each active task
  useEffect(() => {
    const newMonitors = new Map<string, TaskMonitor>();

    activeTasks.forEach(task => {
      if (!task.streamingId) return;

      const existingMonitor = monitorsRef.current.get(task.id);
      if (existingMonitor?.streamingId === task.streamingId) {
        // Already monitoring this task
        newMonitors.set(task.id, existingMonitor);
        return;
      }

      // Create new monitor
      newMonitors.set(task.id, {
        taskId: task.id,
        streamingId: task.streamingId,
        isConnected: false,
      });
    });

    monitorsRef.current = newMonitors;
  }, [activeTasks.map(t => t.id).join(',')]);

  // Get active task IDs being monitored
  const activeTaskIds = Array.from(monitorsRef.current.keys());

  return {
    activeTaskIds,
    monitorCount: monitorsRef.current.size,
  };
}

/**
 * Hook to monitor a single task's SSE stream
 */
export function useTaskStreamMonitor(
  task: KanbanTask | null,
  onUpdate?: (updates: Partial<KanbanTask>) => void
) {
  const streamingId = task?.streamingId || null;

  const handleMessage = useCallback(
    (event: StreamEvent) => {
      if (!task) return;

      let updates: Partial<KanbanTask> = {};

      switch (event.type) {
        case 'connected':
          updates = {
            agentStatus: 'active',
            statusMessage: 'Agent connected',
          };
          break;

        case 'assistant':
          updates = {
            agentStatus: 'active',
            statusMessage: 'Agent working...',
          };
          break;

        case 'permission_request':
          updates = {
            agentStatus: 'waiting',
            statusMessage: 'Waiting for permission',
          };
          break;

        case 'result':
          const resultEvent = event as ResultStreamMessage;
          const isSuccess = resultEvent.subtype === 'success' && !resultEvent.is_error;

          updates = {
            agentStatus: isSuccess ? 'completed' : 'error',
            statusMessage: isSuccess ? 'Task completed' : 'Task failed',
            completedAt: new Date().toISOString(),
            column: isSuccess ? 'done' : task.column,
          };
          break;

        case 'error':
          updates = {
            agentStatus: 'error',
            statusMessage: `Error: ${event.error}`,
          };
          break;

        case 'closed':
          if (task.agentStatus === 'active') {
            updates = {
              agentStatus: 'paused',
              statusMessage: 'Connection closed',
            };
          }
          break;
      }

      if (Object.keys(updates).length > 0) {
        try {
          kanbanStorage.updateTask(task.id, updates);
          onUpdate?.(updates);
        } catch (err) {
          console.error('[TaskMonitor] Failed to update task:', err);
        }
      }
    },
    [task, onUpdate]
  );

  const { isConnected, disconnect } = useStreaming(streamingId, {
    onMessage: handleMessage,
    onError: (error) => {
      console.error('[TaskMonitor] Stream error:', error);
      if (task) {
        kanbanStorage.updateTask(task.id, {
          agentStatus: 'error',
          statusMessage: error.message,
        });
      }
    },
    onConnect: () => {
      console.log('[TaskMonitor] Connected to stream:', streamingId);
    },
    onDisconnect: () => {
      console.log('[TaskMonitor] Disconnected from stream:', streamingId);
    },
  });

  return {
    isConnected,
    disconnect,
  };
}
