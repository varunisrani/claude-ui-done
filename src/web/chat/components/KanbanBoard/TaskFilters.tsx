/**
 * TaskFilters Component
 *
 * Multi-filter dropdown for Kanban tasks with priority, status, tags, and columns.
 * Phase 3 feature.
 */

import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { Filter, X } from 'lucide-react';

interface TaskFiltersProps {
  priorities: string[];
  statuses: string[];
  tags: string[];
  columns: string[];
  allTags: string[];
  onPrioritiesChange: (priorities: string[]) => void;
  onStatusesChange: (statuses: string[]) => void;
  onTagsChange: (tags: string[]) => void;
  onColumnsChange: (columns: string[]) => void;
  onClearAll: () => void;
  activeCount: number;
}

export function TaskFilters({
  priorities,
  statuses,
  tags,
  columns,
  allTags,
  onPrioritiesChange,
  onStatusesChange,
  onTagsChange,
  onColumnsChange,
  onClearAll,
  activeCount,
}: TaskFiltersProps) {
  const [open, setOpen] = useState(false);

  const priorityOptions = ['low', 'medium', 'high'];
  const statusOptions = ['idle', 'active', 'paused', 'waiting', 'completed', 'error'];
  const columnOptions = [
    { id: 'new', label: 'New' },
    { id: 'inprogress', label: 'In Progress' },
    { id: 'done', label: 'Done' },
  ];

  const togglePriority = (priority: string) => {
    if (priorities.includes(priority)) {
      onPrioritiesChange(priorities.filter(p => p !== priority));
    } else {
      onPrioritiesChange([...priorities, priority]);
    }
  };

  const toggleStatus = (status: string) => {
    if (statuses.includes(status)) {
      onStatusesChange(statuses.filter(s => s !== status));
    } else {
      onStatusesChange([...statuses, status]);
    }
  };

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      onTagsChange(tags.filter(t => t !== tag));
    } else {
      onTagsChange([...tags, tag]);
    }
  };

  const toggleColumn = (column: string) => {
    if (columns.includes(column)) {
      onColumnsChange(columns.filter(c => c !== column));
    } else {
      onColumnsChange([...columns, column]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="w-4 h-4" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Filter Tasks</h4>
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearAll}
                className="h-auto p-1 text-xs"
              >
                Clear all
              </Button>
            )}
          </div>

          {/* Priority Filters */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">Priority</label>
            <div className="space-y-2">
              {priorityOptions.map(priority => (
                <div key={priority} className="flex items-center gap-2">
                  <Checkbox
                    checked={priorities.includes(priority)}
                    onCheckedChange={() => togglePriority(priority)}
                  />
                  <span className="text-sm capitalize">{priority}</span>
                  <span className="text-lg ml-auto">
                    {priority === 'low' && '🟢'}
                    {priority === 'medium' && '🟡'}
                    {priority === 'high' && '🔴'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Filters */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">Status</label>
            <div className="space-y-2">
              {statusOptions.map(status => (
                <div key={status} className="flex items-center gap-2">
                  <Checkbox
                    checked={statuses.includes(status)}
                    onCheckedChange={() => toggleStatus(status)}
                  />
                  <span className="text-sm capitalize">{status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Column Filters */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-2 block">Column</label>
            <div className="space-y-2">
              {columnOptions.map(column => (
                <div key={column.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={columns.includes(column.id)}
                    onCheckedChange={() => toggleColumn(column.id)}
                  />
                  <span className="text-sm">{column.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tag Filters */}
          {allTags.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Tags</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {allTags.map(tag => (
                  <div key={tag} className="flex items-center gap-2">
                    <Checkbox
                      checked={tags.includes(tag)}
                      onCheckedChange={() => toggleTag(tag)}
                    />
                    <span className="text-sm">{tag}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
