/**
 * CreateTaskDialog Component
 *
 * Dialog for creating new Kanban tasks.
 */

import React, { useState, useEffect } from 'react';
import { useKanban } from '../../contexts/KanbanContext';
import { api } from '../../services/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { DropdownSelector, DropdownOption } from '../DropdownSelector';
import { FolderOpen, Sparkles } from 'lucide-react';

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateTaskDialog({ open, onClose }: CreateTaskDialogProps) {
  const { createTask } = useKanban();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [tags, setTags] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [model, setModel] = useState('default');
  const [permissionMode, setPermissionMode] = useState('default');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Directory selection state
  const [recentDirectories, setRecentDirectories] = useState<Record<string, { lastDate: string; shortname: string }>>({});
  const [directoryOptions, setDirectoryOptions] = useState<DropdownOption<string>[]>([]);
  const [isDirectoryLoading, setIsDirectoryLoading] = useState(false);

  // Model options
  const modelOptions = ['default', 'opus', 'sonnet'];

  // Permission mode options
  const permissionModeOptions = [
    { value: 'default', label: 'Default (Ask for permission)' },
    { value: 'acceptEdits', label: 'Accept Edits' },
    { value: 'bypassPermissions', label: 'Bypass Permissions' },
    { value: 'plan', label: 'Plan Mode' }
  ];

  // Load recent directories on mount
  useEffect(() => {
    const loadRecentDirectories = async () => {
      try {
        setIsDirectoryLoading(true);
        const conversations = await api.getConversations({ limit: 50 });
        const directoryMap: Record<string, { lastDate: string; shortname: string }> = {};

        conversations.conversations.forEach(conv => {
          if (conv.projectPath) {
            if (!directoryMap[conv.projectPath] ||
                new Date(conv.createdAt) > new Date(directoryMap[conv.projectPath].lastDate)) {
              const shortname = conv.projectPath.split('/').pop() || conv.projectPath.split('\\').pop() || conv.projectPath;
              directoryMap[conv.projectPath] = {
                lastDate: conv.createdAt,
                shortname
              };
            }
          }
        });

        setRecentDirectories(directoryMap);

        // Convert to dropdown options
        const options: DropdownOption<string>[] = Object.entries(directoryMap)
          .map(([path, data]) => ({
            value: path,
            label: data.shortname,
            description: path
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        setDirectoryOptions(options);
      } catch (err) {
        console.error('Failed to load recent directories:', err);
      } finally {
        setIsDirectoryLoading(false);
      }
    };

    if (open) {
      loadRecentDirectories();
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double submission
    if (loading) {
      return;
    }

    if (!title.trim() || !description.trim()) {
      setError('Title and description are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      createTask({
        title: title.trim(),
        description: description.trim(),
        priority,
        tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
        working_directory: workingDirectory.trim() || undefined,
        column_name: 'todo',
        // Set default values for required fields
        status: 'todo',
        agent_status: 'idle',
        model_permission_level: permissionMode === 'default' ? 'standard' :
          permissionMode === 'elevated' ? 'elevated' : 'restricted',
        task_type: 'general',
        complexity_level: 'medium',
        retry_count: 0,
        max_retries: 3,
        timeout_minutes: 60,
        completion_percentage: 0,
        environment: 'development',
        archived: false,
        compliance_requirements: [],
        notification_preferences: { email: true, slack: false },
        custom_fields: {},
        integration_links: {},
        external_references: [],
        approval_chain: [],
        resource_allocation: {},
        performance_metrics: {},
        user_stories: [],
        acceptance_criteria: [],
        definition_of_done: {},
        model_access_requirements: model === 'default' ? {} : {
          min_model_version: model,
          requires_special_permissions: permissionMode !== 'default',
          access_level: permissionMode
        },
        system_prompt: systemPrompt.trim() || undefined,
        logs: [],
      });

      // Reset form
      setTitle('');
      setDescription('');
      setPriority('medium');
      setTags('');
      setWorkingDirectory('');
      setModel('default');
      setPermissionMode('default');
      setSystemPrompt('');
      setShowSystemPrompt(false);

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setTags('');
      setWorkingDirectory('');
      setModel('default');
      setPermissionMode('default');
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>
            Create a new task for your Kanban board. You can assign it to an agent later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter task title"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the task in detail"
                rows={4}
                required
              />
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(value: any) => setPriority(value)}>
                <SelectTrigger id="priority" className="w-full">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="model" className="w-full">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((modelOption) => (
                    <SelectItem key={modelOption} value={modelOption}>
                      {modelOption === 'default' ? 'Default Model' : modelOption.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Permission Mode */}
            <div className="space-y-2">
              <Label htmlFor="permissionMode">Permission Mode</Label>
              <Select value={permissionMode} onValueChange={setPermissionMode}>
                <SelectTrigger id="permissionMode" className="w-full">
                  <SelectValue placeholder="Select permission mode" />
                </SelectTrigger>
                <SelectContent>
                  {permissionModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="systemPrompt">System Prompt (Optional)</Label>
                <Button
                  type="button"
                  variant={showSystemPrompt ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                  className="h-7 px-2 text-xs"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  {showSystemPrompt ? 'Hide' : 'Show'}
                </Button>
              </div>
              {showSystemPrompt && (
                <Textarea
                  id="systemPrompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="You are an expert assistant. Always provide detailed and helpful responses..."
                  rows={3}
                  className="w-full"
                />
              )}
            </div>

            {/* Working Directory */}
            <div className="space-y-2">
              <Label htmlFor="workingDirectory">Working Directory</Label>
              <div className="relative">
                {isDirectoryLoading ? (
                  <div className="relative">
                    <Input
                      id="workingDirectory"
                      value="Loading directories..."
                      disabled
                      className="pr-10 text-muted-foreground"
                    />
                    <FolderOpen className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                ) : (
                  <DropdownSelector
                    options={directoryOptions}
                    value={workingDirectory}
                    onChange={setWorkingDirectory}
                    placeholder="Select directory or type path..."
                    showFilterInput={true}
                    className="w-full"
                    renderTrigger={({ isOpen, onClick }) => (
                      <div className="relative">
                        <Input
                          id="workingDirectory"
                          value={workingDirectory}
                          onChange={(e) => setWorkingDirectory(e.target.value)}
                          placeholder="Select directory or type path..."
                          className="pr-10"
                          onClick={onClick}
                        />
                        <FolderOpen className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    )}
                  />
                )}
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="bug, feature, urgent (comma-separated)"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
