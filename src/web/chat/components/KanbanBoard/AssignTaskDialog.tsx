/**
 * AssignTaskDialog Component
 *
 * Dialog for assigning a task to a Claude agent.
 * Shows a quick overview and opens the detailed confirmation dialog.
 */

import React, { useState } from 'react';
import { AssignmentConfirmationDialog } from './AssignmentConfirmationDialog';
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
import { Sparkles, Bot } from 'lucide-react';

interface AssignTaskDialogProps {
  task: KanbanTask | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: (sessionId: string) => void;
}

export function AssignTaskDialog({ task, open, onClose, onSuccess }: AssignTaskDialogProps) {
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);

  const handleProceedToAssignment = () => {
    setShowConfirmationDialog(true);
  };

  const handleCloseConfirmationDialog = () => {
    setShowConfirmationDialog(false);
  };

  const handleAssignmentSuccess = (sessionId: string) => {
    setShowConfirmationDialog(false);
    onClose();
    if (onSuccess) {
      onSuccess(sessionId);
    }
  };

  if (!task) return null;

  const priorityColors = {
    low: 'bg-green-100 text-green-800 border-green-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    high: 'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-600" />
              Assign Task to Agent
            </DialogTitle>
            <DialogDescription>
              Ready to assign this task to an AI agent? Review the details below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Task Overview */}
            <div>
              <h3 className="font-semibold text-lg mb-2">{task.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {task.description}
              </p>
            </div>

            {/* Quick Details */}
            <div className="flex items-center gap-4">
              <Badge className={priorityColors[task.priority]}>
                {task.priority.toUpperCase()}
              </Badge>
              {task.workingDirectory && (
                <span className="text-xs text-muted-foreground truncate">
                  📁 {task.workingDirectory.split(/[/\\]/).pop()}
                </span>
              )}
            </div>

            {/* Tags */}
            {task.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {task.tags.slice(0, 3).map((tag, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {task.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{task.tags.length - 3} more
                  </Badge>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleProceedToAssignment}>
              <Sparkles className="w-4 h-4 mr-2" />
              Review Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detailed Assignment Confirmation Dialog */}
      <AssignmentConfirmationDialog
        open={showConfirmationDialog}
        onClose={handleCloseConfirmationDialog}
        task={{
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          tags: task.tags,
          workingDirectory: task.workingDirectory,
          model: task.model,
          permissionMode: task.permissionMode
        }}
        onSuccess={handleAssignmentSuccess}
      />
    </>
  );
}
