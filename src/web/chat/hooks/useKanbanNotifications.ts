/**
 * useKanbanNotifications Hook
 *
 * Manages desktop notifications for Kanban task events.
 * Requests notification permission and shows notifications for:
 * - Task completion
 * - Task errors
 * - Tasks waiting for permission
 *
 * Phase 3 feature.
 */

import { useEffect, useState, useCallback } from 'react';
import type { KanbanTask } from '../types/kanban';

interface NotificationOptions {
  enabled: boolean;
  onComplete?: boolean;
  onError?: boolean;
  onWaiting?: boolean;
}

export function useKanbanNotifications(
  tasks: KanbanTask[],
  options: NotificationOptions = {
    enabled: true,
    onComplete: true,
    onError: true,
    onWaiting: true,
  }
) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [previousTaskStates, setPreviousTaskStates] = useState<Map<string, string>>(new Map());

  // Request notification permission on mount
  useEffect(() => {
    if (!options.enabled) return;

    if ('Notification' in window) {
      setPermission(Notification.permission);

      if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => {
          setPermission(p);
        });
      }
    }
  }, [options.enabled]);

  // Send notification
  const sendNotification = useCallback((title: string, body: string, icon?: string) => {
    if (!options.enabled || permission !== 'granted') return;

    try {
      const notification = new Notification(title, {
        body,
        icon: icon || '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'kanban-task',
        requireInteraction: false,
      });

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }, [options.enabled, permission]);

  // Monitor task status changes
  useEffect(() => {
    if (!options.enabled || permission !== 'granted') return;

    tasks.forEach(task => {
      const previousStatus = previousTaskStates.get(task.id);
      const currentStatus = task.agentStatus;

      // Task just completed
      if (
        options.onComplete &&
        currentStatus === 'completed' &&
        previousStatus !== 'completed'
      ) {
        sendNotification(
          '✅ Task Completed',
          `"${task.title}" has been completed successfully!`,
          '✅'
        );
      }

      // Task encountered error
      if (
        options.onError &&
        currentStatus === 'error' &&
        previousStatus !== 'error'
      ) {
        sendNotification(
          '❌ Task Error',
          `"${task.title}" encountered an error: ${task.statusMessage || 'Unknown error'}`,
          '❌'
        );
      }

      // Task waiting for permission
      if (
        options.onWaiting &&
        currentStatus === 'waiting' &&
        previousStatus !== 'waiting'
      ) {
        sendNotification(
          '⏸️ Task Waiting',
          `"${task.title}" is waiting for your approval`,
          '⏸️'
        );
      }
    });

    // Update previous states
    const newStates = new Map<string, string>();
    tasks.forEach(task => {
      if (task.agentStatus) {
        newStates.set(task.id, task.agentStatus);
      }
    });
    setPreviousTaskStates(newStates);
  }, [tasks, options, permission, sendNotification, previousTaskStates]);

  // Request permission manually
  const requestPermission = useCallback(async () => {
    if ('Notification' in window) {
      const p = await Notification.requestPermission();
      setPermission(p);
      return p === 'granted';
    }
    return false;
  }, []);

  return {
    permission,
    requestPermission,
    canNotify: permission === 'granted',
    sendNotification,
  };
}
