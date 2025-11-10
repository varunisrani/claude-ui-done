/**
 * AssignTaskDialog Component
 *
 * Confirmation dialog for assigning a task to a Claude agent.
 * Shows full task details and what the agent will do.
 */

import React, { useState } from 'react';
import { useKanban } from '../../contexts/KanbanContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { KanbanTask } from '../../types/kanban';
import { Loader2, AlertCircle, Sparkles } from 'lucide-react';

interface AssignTaskDialogProps {
  task: KanbanTask | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: (sessionId: string) => void;
}

export function AssignTaskDialog({ task, open, onClose, onSuccess }: AssignTaskDialogProps) {
  const { assignTaskToAgent } = useKanban();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAssign = async () => {
    console.log('🚀 [AssignTaskDialog] User clicked Assign button');
    console.log('📋 [AssignTaskDialog] Task details:', {
      id: task?.id,
      title: task?.title,
      description: task?.description?.substring(0, 100) + '...',
      priority: task?.priority,
      workingDirectory: task?.workingDirectory,
      tags: task?.tags
    });

    if (!task) {
      console.error('❌ [AssignTaskDialog] No task provided');
      return;
    }

    console.log('⏳ [AssignTaskDialog] Starting assignment process...');
    setLoading(true);
    setError(null);

    try {
      console.log('🔄 [AssignTaskDialog] Calling assignTaskToAgent with task ID:', task.id);
      // assignTaskToAgent now returns the sessionId
      const sessionId = await assignTaskToAgent(task.id);

      console.log('✅ [AssignTaskDialog] Task assigned successfully! Session ID:', sessionId);

      // Success - close dialog
      console.log('🔒 [AssignTaskDialog] Closing dialog...');
      onClose();

      // Call success callback with the sessionId
      if (onSuccess) {
        console.log('📞 [AssignTaskDialog] Calling success callback with session ID:', sessionId);
        onSuccess(sessionId);
      }
    } catch (err) {
      console.error('❌ [AssignTaskDialog] Failed to assign task:', err);
      console.error('🔍 [AssignTaskDialog] Error details:', {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : 'No stack trace'
      });
      setError(err instanceof Error ? err.message : 'Failed to assign task');
    } finally {
      console.log('🏁 [AssignTaskDialog] Assignment process completed, setting loading to false');
      setLoading(false);
    }
  };

  if (!task) return null;

  const priorityColors = {
    low: 'bg-green-100 text-green-800 border-green-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    high: 'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            Assign Task to Claude Agent
          </DialogTitle>
          <DialogDescription>
            Review the task details before assigning to an AI agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Assignment Failed</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Task Title */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Task</label>
            <h3 className="text-lg font-semibold text-foreground mt-1">{task.title}</h3>
          </div>

          {/* Task Description */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Description</label>
            <p className="text-sm text-foreground whitespace-pre-wrap mt-1 p-3 bg-muted rounded-md">
              {task.description}
            </p>
          </div>

          {/* Priority and Working Directory */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Priority</label>
              <div className="mt-1">
                <Badge className={priorityColors[task.priority]}>
                  {task.priority.toUpperCase()}
                </Badge>
              </div>
            </div>

            {task.workingDirectory && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Working Directory</label>
                <p className="text-sm font-mono text-foreground mt-1 p-2 bg-muted rounded truncate">
                  {task.workingDirectory}
                </p>
              </div>
            )}
          </div>

          {/* Tags */}
          {task.tags.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Tags</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {task.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Agent Info */}
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-4">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              What the Agent Will Do:
            </h4>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-blue-800 dark:text-blue-200">
              <li>Start working on this task immediately</li>
              <li>Execute necessary tools and actions autonomously</li>
              <li>Stream progress updates in real-time via SSE</li>
              <li>Continue working even if you close the chat window</li>
              <li>Request permission for sensitive operations</li>
              <li>Update task status automatically when completed</li>
            </ul>
          </div>

          {/* Task Metadata */}
          <div className="text-xs text-muted-foreground border-t pt-3">
            <p>Created: {new Date(task.createdAt).toLocaleString()}</p>
            {task.updatedAt !== task.createdAt && (
              <p>Updated: {new Date(task.updatedAt).toLocaleString()}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={loading}
            className="min-w-[120px]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              'Assign Agent'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
