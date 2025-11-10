/**
 * BackgroundTaskMonitor Component
 *
 * Component for monitoring background tasks that are running without user supervision.
 * Shows real-time status updates and allows users to view tasks in chat.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKanban } from '../../contexts/KanbanContext';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Bot,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  RefreshCw,
  Activity,
  AlertCircle
} from 'lucide-react';
import type { KanbanTask } from '../../types/kanban';

interface BackgroundTaskMonitorProps {
  className?: string;
}

export function BackgroundTaskMonitor({ className }: BackgroundTaskMonitorProps) {
  const navigate = useNavigate();
  const { getBackgroundTasks, monitorBackgroundTask, stopBackgroundMonitoring } = useKanban();
  const [backgroundTasks, setBackgroundTasks] = useState<KanbanTask[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Load background tasks on mount and set up periodic refresh
  useEffect(() => {
    loadBackgroundTasks();

    // Set up periodic refresh every 30 seconds
    const refreshInterval = setInterval(() => {
      loadBackgroundTasks();
    }, 30000);

    return () => clearInterval(refreshInterval);
  }, []);

  const loadBackgroundTasks = async () => {
    setIsRefreshing(true);
    try {
      const tasks = getBackgroundTasks();

      // Monitor each background task to get latest status
      for (const task of tasks) {
        if (task.sessionId) {
          await monitorBackgroundTask(task.sessionId);
        }
      }

      // Get updated tasks after monitoring
      const updatedTasks = getBackgroundTasks();
      setBackgroundTasks(updatedTasks);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load background tasks:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewInChat = (task: KanbanTask) => {
    if (task.sessionId) {
      navigate(`/c/${task.sessionId}`);
    }
  };

  const handleStopMonitoring = (task: KanbanTask) => {
    if (task.sessionId) {
      stopBackgroundMonitoring(task.sessionId);
      loadBackgroundTasks(); // Refresh the list
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'active':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-600" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'paused':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-100 text-blue-800">Active</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800">Error</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-100 text-yellow-800">Paused</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatDuration = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just started';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m`;
  };

  if (backgroundTasks.length === 0) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            Background Tasks
          </h3>
        </div>
        <div className="p-6">
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No background tasks running</p>
            <p className="text-sm mt-1">
              Tasks assigned to agents will appear here when running in background mode
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            Background Tasks
            <Badge variant="secondary" className="text-xs">
              {backgroundTasks.length}
            </Badge>
          </h3>

          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-xs text-muted-foreground">
                Updated {formatDuration(lastRefresh.toISOString())} ago
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={loadBackgroundTasks}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {backgroundTasks.map((task) => (
          <div
            key={`background-${task.id}`}
            className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 transition-colors"
          >
            {/* Task Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getStatusIcon(task.agentStatus)}
                  <h4 className="font-medium truncate">{task.title}</h4>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {task.description}
                </p>
              </div>

              <div className="flex items-center gap-2 ml-4">
                {getStatusBadge(task.agentStatus)}
                {task.priority && (
                  <Badge
                    variant="outline"
                    className={
                      task.priority === 'high'
                        ? 'border-red-200 text-red-700'
                        : task.priority === 'medium'
                        ? 'border-yellow-200 text-yellow-700'
                        : 'border-green-200 text-green-700'
                    }
                  >
                    {task.priority}
                  </Badge>
                )}
              </div>
            </div>

            {/* Progress */}
            {task.progress !== undefined && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{task.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Status Message */}
            {task.statusMessage && (
              <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                <div className="flex items-start gap-2">
                  <Activity className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{task.statusMessage}</span>
                </div>
              </div>
            )}

            {/* Task Details */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Started {formatDuration(task.assignedAt || task.createdAt)}</span>
                </div>

                {task.model && (
                  <span>Model: {task.model}</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleViewInChat(task)}
                className="flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                View in Chat
              </Button>

              {task.agentStatus === 'active' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStopMonitoring(task)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Stop Monitoring
                </Button>
              )}
            </div>
          </div>
        ))}

        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-3 h-3" />
            <span className="font-medium">Background Task Info</span>
          </div>
          <p>
            Background tasks continue running even when you're not watching.
            You can check their progress here or join the chat at any time.
          </p>
        </div>
      </div>
    </div>
  );
}