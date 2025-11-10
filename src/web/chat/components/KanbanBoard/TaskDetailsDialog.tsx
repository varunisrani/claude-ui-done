/**
 * TaskDetailsDialog Component
 *
 * Shows full task information and actions.
 * Displays conversation history if task is assigned to an agent.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKanban } from '../../contexts/KanbanContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { KanbanTask } from '../../types/kanban';
import {
  Clock,
  Activity,
  AlertCircle,
  CheckCircle2,
  Pause,
  Loader2,
  Trash2,
  MessageSquare,
  StopCircle,
  Calendar,
  FolderOpen,
} from 'lucide-react';
import { api } from '../../services/api';

interface TaskDetailsDialogProps {
  task: KanbanTask | null;
  open: boolean;
  onClose: () => void;
}

export function TaskDetailsDialog({ task, open, onClose }: TaskDetailsDialogProps) {
  const navigate = useNavigate();
  const { deleteTask } = useKanban();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  if (!task) return null;

  const priorityColors = {
    low: 'bg-green-100 text-green-800 border-green-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    high: 'bg-red-100 text-red-800 border-red-300',
  };

  const statusConfig = {
    idle: {
      color: 'bg-gray-100 text-gray-800',
      icon: Clock,
      label: 'Idle',
    },
    active: {
      color: 'bg-blue-100 text-blue-800',
      icon: Activity,
      label: 'Active',
    },
    paused: {
      color: 'bg-orange-100 text-orange-800',
      icon: Pause,
      label: 'Paused',
    },
    waiting: {
      color: 'bg-yellow-100 text-yellow-800',
      icon: Loader2,
      label: 'Waiting',
    },
    completed: {
      color: 'bg-green-100 text-green-800',
      icon: CheckCircle2,
      label: 'Completed',
    },
    error: {
      color: 'bg-red-100 text-red-800',
      icon: AlertCircle,
      label: 'Error',
    },
  };

  const handleViewConversation = () => {
    if (task.sessionId) {
      onClose();
      navigate(`/c/${task.sessionId}`);
    }
  };

  const handleStopAgent = async () => {
    if (!task.streamingId) return;

    setIsStopping(true);
    try {
      await api.stopConversation(task.streamingId);
      onClose();
    } catch (err) {
      console.error('Failed to stop agent:', err);
      alert('Failed to stop agent');
    } finally {
      setIsStopping(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }

    setIsDeleting(true);
    try {
      // Stop agent if active
      if (task.streamingId && task.agentStatus === 'active') {
        await api.stopConversation(task.streamingId);
      }

      deleteTask(task.id);
      onClose();
    } catch (err) {
      console.error('Failed to delete task:', err);
      alert('Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  };

  const statusInfo = task.agentStatus ? statusConfig[task.agentStatus] : statusConfig.idle;
  const StatusIcon = statusInfo.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StatusIcon className="w-5 h-5" />
            {task.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Status Banner */}
          {task.agentStatus && task.agentStatus !== 'idle' && (
            <div className={`flex items-center gap-3 p-4 rounded-md ${statusInfo.color}`}>
              <StatusIcon className="w-6 h-6" />
              <div className="flex-1">
                <p className="font-semibold">{statusInfo.label}</p>
                {task.statusMessage && (
                  <p className="text-sm opacity-90 mt-1">{task.statusMessage}</p>
                )}
              </div>
            </div>
          )}

          {/* Task Description */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
            <p className="text-foreground whitespace-pre-wrap p-4 bg-muted rounded-md">
              {task.description}
            </p>
          </div>

          {/* Task Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Priority</h3>
              <Badge className={priorityColors[task.priority]}>
                {task.priority.toUpperCase()}
              </Badge>
            </div>

            {/* Status */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Status</h3>
              <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
            </div>

            {/* Column */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Column</h3>
              <Badge variant="outline">
                {task.column === 'new'
                  ? 'New'
                  : task.column === 'inprogress'
                  ? 'In Progress'
                  : 'Done'}
              </Badge>
            </div>

            {/* Progress */}
            {task.progress !== undefined && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Progress</h3>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{task.progress}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Tags */}
          {task.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {task.tags.map(tag => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Working Directory */}
          {task.workingDirectory && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Working Directory
              </h3>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm">
                <FolderOpen className="w-4 h-4" />
                <span className="truncate">{task.workingDirectory}</span>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="border-t pt-4 space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
            </div>

            {task.assignedAt && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span>Assigned: {new Date(task.assignedAt).toLocaleString()}</span>
              </div>
            )}

            {task.completedAt && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-green-600">
                  Completed: {new Date(task.completedAt).toLocaleString()}
                </span>
              </div>
            )}

            {task.updatedAt !== task.createdAt && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>Updated: {new Date(task.updatedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Conversation Info */}
          {task.sessionId && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-4">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Agent Conversation
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                This task is linked to an active agent conversation. You can view the full
                conversation history and interact with the agent.
              </p>
              <Button
                onClick={handleViewConversation}
                size="sm"
                className="w-full"
                variant="outline"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                View Conversation
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            {/* Stop Agent */}
            {task.streamingId && task.agentStatus === 'active' && (
              <Button
                variant="destructive"
                onClick={handleStopAgent}
                disabled={isStopping}
                size="sm"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                {isStopping ? 'Stopping...' : 'Stop Agent'}
              </Button>
            )}

            {/* Delete Task */}
            <Button
              variant="destructive"
              onClick={handleDeleteTask}
              disabled={isDeleting}
              size="sm"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Deleting...' : 'Delete Task'}
            </Button>
          </div>

          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
