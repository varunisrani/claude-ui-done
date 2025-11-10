/**
 * KanbanBoard Component
 *
 * Main Kanban board interface with task columns.
 * Phase 2: Added AssignTaskDialog and real-time SSE monitoring.
 * Phase 3: Added drag-and-drop, filters, search, bulk operations, and enhancements.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useKanban } from '../../contexts/KanbanContext';
import { useKanbanTaskMonitor } from '../../hooks/useKanbanTaskMonitor';
import { KanbanColumn } from './KanbanColumn';
import { CreateTaskDialog } from './CreateTaskDialog';
import { AssignTaskDialog } from './AssignTaskDialog';
import { TaskDetailsDialog } from './TaskDetailsDialog';
import { TaskFilters } from './TaskFilters';
import { TaskSearch } from './TaskSearch';
import { KanbanSettings } from './KanbanSettings';
import { TaskCard } from './TaskCard';
import { Button } from '../ui/button';
import { Settings, Download, Upload } from 'lucide-react';
import type { KanbanTask } from '../../types/kanban';

export function KanbanBoard() {
  const navigate = useNavigate();
  const { activeBoard, getTasksByColumn, loading, error, tasks, refreshTasks, moveTask, deleteTask, markTaskAsDone } = useKanban();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [assignDialogState, setAssignDialogState] = useState<{
    open: boolean;
    task: KanbanTask | null;
  }>({ open: false, task: null });
  const [detailsDialogState, setDetailsDialogState] = useState<{
    open: boolean;
    task: KanbanTask | null;
  }>({ open: false, task: null });
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Drag and drop state
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);

  // Filters and search state
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [columnFilters, setColumnFilters] = useState<string[]>([]);

  // Bulk selection state
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Settings preferences
  const [showCompletedTasks, setShowCompletedTasks] = useState(true);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Filter tasks based on search and filters
  const filteredTasks = useMemo(() => {
    let filtered = tasks;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        task =>
          task.title.toLowerCase().includes(query) ||
          task.description.toLowerCase().includes(query) ||
          task.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply priority filters
    if (priorityFilters.length > 0) {
      filtered = filtered.filter(task => priorityFilters.includes(task.priority));
    }

    // Apply status filters
    if (statusFilters.length > 0) {
      filtered = filtered.filter(task => task.agentStatus && statusFilters.includes(task.agentStatus));
    }

    // Apply tag filters
    if (tagFilters.length > 0) {
      filtered = filtered.filter(task => tagFilters.some(tag => task.tags.includes(tag)));
    }

    // Apply column filters
    if (columnFilters.length > 0) {
      filtered = filtered.filter(task => columnFilters.includes(task.column));
    }

    // Apply show completed tasks setting
    if (!showCompletedTasks) {
      filtered = filtered.filter(task => task.agentStatus !== 'completed');
    }

    return filtered;
  }, [tasks, searchQuery, priorityFilters, statusFilters, tagFilters, columnFilters, showCompletedTasks]);

  // Get all unique tags from tasks
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    tasks.forEach(task => task.tags.forEach(tag => tagsSet.add(tag)));
    return Array.from(tagsSet).sort();
  }, [tasks]);

  // Monitor active tasks for real-time status updates
  const { monitorCount } = useKanbanTaskMonitor(tasks, (taskId, updates) => {
    console.log('[KanbanBoard] Task updated:', taskId, updates);
    refreshTasks();
  });

  // Drag and drop handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    setActiveTask(task || null);
  }, [tasks]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    // Optional: Add visual feedback during drag over
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveTask(null);
      return;
    }

    const taskId = active.id as string;
    const overId = over.id as string;

    // Check if dropped over a column
    if (overId === 'new' || overId === 'inprogress' || overId === 'done') {
      const task = tasks.find(t => t.id === taskId);
      if (task && task.column !== overId) {
        const targetColumnTasks = filteredTasks.filter(t => t.column === overId);
        moveTask(taskId, overId, targetColumnTasks.length);
      }
    } else {
      // Dropped over another task - reorder within column
      const task = tasks.find(t => t.id === taskId);
      const targetTask = tasks.find(t => t.id === overId);

      if (task && targetTask && task.column === targetTask.column) {
        moveTask(taskId, task.column, targetTask.position);
      }
    }

    setActiveTask(null);
  }, [tasks, filteredTasks, moveTask]);

  // Bulk operations handlers
  const handleSelectTask = useCallback((taskId: string, selected: boolean) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(taskId);
      } else {
        newSet.delete(taskId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedTaskIds(new Set(filteredTasks.map(t => t.id)));
  }, [filteredTasks]);

  const handleDeselectAll = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);

  const handleBulkMove = useCallback((targetColumn: string) => {
    selectedTaskIds.forEach(taskId => {
      const task = tasks.find(t => t.id === taskId);
      if (task && task.column !== targetColumn) {
        const targetColumnTasks = tasks.filter(t => t.column === targetColumn);
        moveTask(taskId, targetColumn, targetColumnTasks.length);
      }
    });
    setSelectedTaskIds(new Set());
  }, [selectedTaskIds, tasks, moveTask]);

  const handleBulkDelete = useCallback(() => {
    if (confirm(`Delete ${selectedTaskIds.size} selected tasks?`)) {
      selectedTaskIds.forEach(taskId => {
        deleteTask(taskId);
      });
      setSelectedTaskIds(new Set());
    }
  }, [selectedTaskIds, deleteTask]);

  // Export/Import handlers
  const handleExportJSON = useCallback(() => {
    const dataStr = JSON.stringify(tasks, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kanban-tasks-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [tasks]);

  const handleExportCSV = useCallback(() => {
    const headers = ['ID', 'Title', 'Description', 'Column', 'Priority', 'Status', 'Tags', 'Created', 'Completed'];
    const rows = tasks.map(task => [
      task.id,
      task.title,
      task.description,
      task.column,
      task.priority,
      task.agentStatus || 'idle',
      task.tags.join(';'),
      task.createdAt,
      task.completedAt || '',
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kanban-tasks-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [tasks]);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setPriorityFilters([]);
    setStatusFilters([]);
    setTagFilters([]);
    setColumnFilters([]);
  }, []);

  const activeFilterCount = useMemo(() => {
    return (
      priorityFilters.length +
      statusFilters.length +
      tagFilters.length +
      columnFilters.length +
      (searchQuery ? 1 : 0)
    );
  }, [priorityFilters, statusFilters, tagFilters, columnFilters, searchQuery]);

  if (!activeBoard) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">No board found</h2>
          <p className="text-gray-500">Creating default board...</p>
        </div>
      </div>
    );
  }

  const handleTaskClick = (task: KanbanTask) => {
    setDetailsDialogState({ open: true, task });
  };

  const handleAssignClick = (task: KanbanTask) => {
    setAssignDialogState({ open: true, task });
  };

  const handleAssignSuccess = (sessionId: string) => {
    navigate(`/c/${sessionId}`);
  };

  const handleDoneClick = (task: KanbanTask) => {
    markTaskAsDone(task.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-screen bg-background">
        {/* Header */}
        <div className="flex flex-col gap-4 p-6 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{activeBoard.name}</h1>
                <p className="text-sm text-gray-500">
                  {filteredTasks.length} of {tasks.length} tasks
                  {selectedTaskIds.size > 0 && ` · ${selectedTaskIds.size} selected`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportJSON}>
                <Download className="w-4 h-4 mr-2" />
                JSON
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
              <Button onClick={() => setCreateDialogOpen(true)}>Create Task</Button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-4">
            <TaskSearch value={searchQuery} onChange={setSearchQuery} />
            <TaskFilters
              priorities={priorityFilters}
              statuses={statusFilters}
              tags={tagFilters}
              columns={columnFilters}
              allTags={allTags}
              onPrioritiesChange={setPriorityFilters}
              onStatusesChange={setStatusFilters}
              onTagsChange={setTagFilters}
              onColumnsChange={setColumnFilters}
              onClearAll={handleClearFilters}
              activeCount={activeFilterCount}
            />
          </div>

          {/* Bulk Operations Bar */}
          {selectedTaskIds.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-blue-900">
                  {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleBulkMove('new')}>
                    Move to New
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBulkMove('inprogress')}>
                    Move to In Progress
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBulkMove('done')}>
                    Move to Done
                  </Button>
                  <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                    Delete
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleSelectAll}>
                  Select All
                </Button>
                <Button size="sm" variant="outline" onClick={handleDeselectAll}>
                  Deselect All
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Kanban Columns */}
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-6 h-full min-w-max">
            {activeBoard.columns
              .sort((a, b) => a.position - b.position)
              .map(column => {
                const columnTasks = filteredTasks.filter(t => t.column === column.id);
                return (
                  <SortableContext
                    key={column.id}
                    id={column.id}
                    items={columnTasks.map(t => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <KanbanColumn
                      id={column.id}
                      name={column.name}
                      tasks={columnTasks}
                      onTaskClick={handleTaskClick}
                      onAssignClick={handleAssignClick}
                      onDoneClick={handleDoneClick}
                      selectedTaskIds={selectedTaskIds}
                      onSelectTask={handleSelectTask}
                    />
                  </SortableContext>
                );
              })}
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
        </DragOverlay>

        {/* Dialogs */}
        <CreateTaskDialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} />
        <AssignTaskDialog
          task={assignDialogState.task}
          open={assignDialogState.open}
          onClose={() => setAssignDialogState({ open: false, task: null })}
          onSuccess={handleAssignSuccess}
        />
        <TaskDetailsDialog
          task={detailsDialogState.task}
          open={detailsDialogState.open}
          onClose={() => setDetailsDialogState({ open: false, task: null })}
        />
        <KanbanSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          showCompletedTasks={showCompletedTasks}
          onShowCompletedTasksChange={setShowCompletedTasks}
        />
      </div>
    </DndContext>
  );
}
