/**
 * TaskCard Component
 *
 * Displays a single task card on the Kanban board.
 * Phase 2: Added real-time status indicators and animations.
 * Phase 3: Added drag-and-drop, selection, and enhanced visuals.
 */

import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../services/supabase';
import { Badge } from '../ui/badge';
import { Clock, Activity, AlertCircle, CheckCircle2, Pause, Loader2, Circle, CheckCircle, MessageSquare } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';

interface TaskCardProps {
  task: Task;
  onClick?: (task: Task) => void;
  onAssignClick?: (task: Task) => void;
  onDoneClick?: (task: Task) => void;
  onViewConversation?: (task: Task) => void;
  isDragging?: boolean;
  isSelected?: boolean;
  onSelect?: (selected: boolean) => void;
}

export const TaskCard = memo(function TaskCard({
  task,
  onClick,
  onAssignClick,
  onDoneClick,
  onViewConversation,
  isDragging = false,
  isSelected = false,
  onSelect
}: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityConfig = {
    low: {
      bg: 'bg-green-50',
      border: 'border-l-green-500',
      badge: 'bg-green-100 text-green-800 border-green-300',
      icon: '🟢',
    },
    medium: {
      bg: 'bg-yellow-50',
      border: 'border-l-yellow-500',
      badge: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      icon: '🟡',
    },
    high: {
      bg: 'bg-red-50',
      border: 'border-l-red-500',
      badge: 'bg-red-100 text-red-800 border-red-300',
      icon: '🔴',
    },
    critical: {
      bg: 'bg-purple-50',
      border: 'border-l-purple-500',
      badge: 'bg-purple-100 text-purple-800 border-purple-300',
      icon: '⚡',
    },
  };

  const statusConfig = {
    idle: {
      color: 'bg-gray-100 text-gray-800',
      icon: Clock,
      label: 'Idle',
    },
    working: {
      color: 'bg-blue-100 text-blue-800',
      icon: Activity,
      label: 'Working',
      animated: true,
    },
    paused: {
      color: 'bg-orange-100 text-orange-800',
      icon: Pause,
      label: 'Paused',
    },
    success: {
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

  const priority = priorityConfig[task.priority] || priorityConfig.medium;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 p-4 mb-3
        hover:shadow-md transition-all cursor-pointer
        ${priority.bg} ${priority.border}
        ${isDragging || isSortableDragging ? 'opacity-50 scale-95' : ''}
        ${isSelected ? 'ring-2 ring-blue-500' : ''}
      `}
      onClick={(e) => {
        if (!e.defaultPrevented) {
          onClick?.(task);
        }
      }}
    >
      {/* Selection Checkbox */}
      {onSelect && (
        <div className="absolute top-2 left-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => {
              onSelect(checked as boolean);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Task Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-lg">{priority.icon}</span>
          <h3 className="font-semibold text-gray-900 flex-1">{task.title}</h3>
        </div>
        <Badge className={priority.badge}>
          {task.priority}
        </Badge>
      </div>

      {/* Task Description */}
      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
        {task.description}
      </p>

      {/* Progress Bar */}
      {task.completion_percentage !== undefined && task.completion_percentage > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>Progress</span>
            <span className="font-medium">{task.completion_percentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${task.completion_percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tags.map(tag => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Agent Status Indicator */}
      {task.agent_status && task.agent_status !== 'idle' && (
        <div className="mb-3">
          {(() => {
            const config = statusConfig[task.agent_status];
            const StatusIcon = config.icon;

            return (
              <div className={`flex items-center gap-2 p-2 rounded-md ${config.color}`}>
                <StatusIcon
                  className={`w-4 h-4 ${config.animated ? 'animate-pulse' : ''}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{config.label}</p>
                  {task.agent_response && (
                    <p className="text-xs opacity-80 truncate">
                      {task.agent_response}
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Assign Button (only for new tasks) */}
      {task.column_name === 'todo' && task.agent_status === 'idle' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAssignClick?.(task);
          }}
          className="mt-3 w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          Assign to Agent
        </button>
      )}

      {/* Mark as Done Button (for in-progress tasks that can be manually completed) */}
      {task.column === 'inprogress' && task.agentStatus !== 'idle' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDoneClick?.(task);
          }}
          className="mt-3 w-full px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Mark as Done
        </button>
      )}

      {/* Manual Complete Button (for tasks without active agents) */}
      {task.column === 'inprogress' && task.agentStatus === 'idle' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDoneClick?.(task);
          }}
          className="mt-3 w-full px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Mark as Done
        </button>
      )}

      {/* View Conversation Button (for tasks with associated conversations) */}
      {task.agent_conversation_id && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewConversation?.(task);
          }}
          className="mt-2 w-full px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
        >
          <MessageSquare className="w-4 h-4" />
          View Conversation
        </button>
      )}

      {/* Task Footer */}
      <div className="pt-2 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          {/* Creation Time */}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>
              {new Date(task.createdAt).toLocaleDateString()}
            </span>
          </div>

          {/* Completion Time */}
          {task.completedAt && (
            <div className="text-green-600 font-medium">
              Completed {new Date(task.completedAt).toLocaleDateString()}
            </div>
          )}

          {/* Dynamic Status Indicator */}
          {(() => {
            if (task.column === 'done') {
              return (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="w-3 h-3" />
                  <span className="font-medium">Done</span>
                </div>
              );
            } else if (task.agentStatus === 'active') {
              return (
                <div className="flex items-center gap-1 text-blue-600">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                  <span className="font-medium">Working</span>
                </div>
              );
            } else if (task.agentStatus === 'completed') {
              return (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="w-3 h-3" />
                  <span className="font-medium">Completed</span>
                </div>
              );
            } else if (task.agentStatus === 'error') {
              return (
                <div className="flex items-center gap-1 text-red-600">
                  <AlertCircle className="w-3 h-3" />
                  <span className="font-medium">Error</span>
                </div>
              );
            } else if (task.agentStatus === 'paused') {
              return (
                <div className="flex items-center gap-1 text-orange-600">
                  <Pause className="w-3 h-3" />
                  <span className="font-medium">Paused</span>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Working Directory */}
        {task.workingDirectory && (
          <div className="mt-1 text-xs text-gray-500 font-mono truncate">
            {task.workingDirectory}
          </div>
        )}
      </div>
    </div>
  );
});
