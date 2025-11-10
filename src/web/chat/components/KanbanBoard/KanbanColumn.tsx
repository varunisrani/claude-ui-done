/**
 * KanbanColumn Component
 *
 * Displays a column on the Kanban board with tasks.
 * Phase 3: Added drag-and-drop support and selection handling.
 */

import React, { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { KanbanTask } from '../../types/kanban';
import { TaskCard } from './TaskCard';
import { Badge } from '../ui/badge';

interface KanbanColumnProps {
  id: string;
  name: string;
  tasks: KanbanTask[];
  onTaskClick?: (task: KanbanTask) => void;
  onAssignClick?: (task: KanbanTask) => void;
  onDoneClick?: (task: KanbanTask) => void;
  selectedTaskIds?: Set<string>;
  onSelectTask?: (taskId: string, selected: boolean) => void;
}

export const KanbanColumn = memo(function KanbanColumn({
  id,
  name,
  tasks,
  onTaskClick,
  onAssignClick,
  onDoneClick,
  selectedTaskIds = new Set(),
  onSelectTask,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const getColumnColor = (columnId: string) => {
    switch (columnId) {
      case 'new':
        return 'bg-gray-100 border-gray-300';
      case 'inprogress':
        return 'bg-blue-50 border-blue-300';
      case 'done':
        return 'bg-green-50 border-green-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  return (
    <div className="flex flex-col flex-shrink-0 w-80">
      {/* Column Header */}
      <div className={`flex items-center justify-between p-4 rounded-t-lg border-t-4 ${getColumnColor(id)}`}>
        <h2 className="font-semibold text-gray-900">{name}</h2>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>

      {/* Column Content */}
      <div
        ref={setNodeRef}
        className={`
          flex-1 bg-gray-50 p-4 rounded-b-lg border border-t-0 border-gray-200 overflow-y-auto
          min-h-[500px] max-h-[calc(100vh-300px)] transition-colors
          ${isOver ? 'bg-blue-100 border-blue-400' : ''}
        `}
      >
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            {isOver ? 'Drop task here' : 'No tasks'}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={onTaskClick}
                onAssignClick={onAssignClick}
                onDoneClick={onDoneClick}
                isSelected={selectedTaskIds.has(task.id)}
                onSelect={onSelectTask ? (selected) => onSelectTask(task.id, selected) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
