/**
 * KanbanSettings Component
 *
 * Settings dialog for Kanban board preferences.
 * Phase 3 feature.
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

interface KanbanSettingsProps {
  open: boolean;
  onClose: () => void;
  showCompletedTasks: boolean;
  onShowCompletedTasksChange: (value: boolean) => void;
}

export function KanbanSettings({
  open,
  onClose,
  showCompletedTasks,
  onShowCompletedTasksChange,
}: KanbanSettingsProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kanban Settings</DialogTitle>
          <DialogDescription>
            Configure your Kanban board preferences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Show Completed Tasks */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="show-completed">Show Completed Tasks</Label>
              <p className="text-sm text-gray-500">
                Display tasks with completed status in the board
              </p>
            </div>
            <Switch
              id="show-completed"
              checked={showCompletedTasks}
              onCheckedChange={onShowCompletedTasksChange}
            />
          </div>

          {/* Future Settings */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Coming Soon</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between opacity-50">
                <div className="space-y-1">
                  <Label>Default Priority</Label>
                  <p className="text-sm text-gray-500">
                    Default priority for new tasks
                  </p>
                </div>
                <Switch disabled />
              </div>

              <div className="flex items-center justify-between opacity-50">
                <div className="space-y-1">
                  <Label>Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Desktop notifications for task events
                  </p>
                </div>
                <Switch disabled />
              </div>

              <div className="flex items-center justify-between opacity-50">
                <div className="space-y-1">
                  <Label>Auto-Archive</Label>
                  <p className="text-sm text-gray-500">
                    Automatically archive completed tasks after 30 days
                  </p>
                </div>
                <Switch disabled />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
