/**
 * AssignmentConfirmationDialog Component
 *
 * Enhanced confirmation dialog for Kanban task assignment with detailed information
 * and options to either go to chat or run assignment in background.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  Bot,
  Clock,
  FolderOpen,
  Shield,
  MessageCircle,
  Monitor,
  CheckCircle,
  Loader2,
  Zap,
  Timer
} from 'lucide-react';

interface AssignmentConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  task: {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    tags: string[];
    workingDirectory?: string;
    model?: string;
    permissionMode?: string;
  };
  onSuccess?: (sessionId: string) => void;
}

interface AssignmentDetails {
  estimatedTime: string;
  complexity: 'simple' | 'moderate' | 'complex';
  agentCapabilities: string[];
  confidence: number;
}

export function AssignmentConfirmationDialog({
  open,
  onClose,
  task,
  onSuccess
}: AssignmentConfirmationDialogProps) {
  const navigate = useNavigate();
  const { assignTaskToAgent } = useKanban();
  const [assignmentDetails, setAssignmentDetails] = useState<AssignmentDetails | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignmentMode, setAssignmentMode] = useState<'chat' | 'background'>('chat');

  // Analyze task complexity and estimate time
  useEffect(() => {
    if (!open || !task) {
      setAssignmentDetails(null);
      setIsAnalyzing(false);
      return;
    }

    setIsAnalyzing(true);

    // Simulate task analysis (in real implementation, this could call an AI service)
    const analyzeTask = async () => {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate analysis

      const description = task.description || '';
      const priority = task.priority;
      const tagCount = task.tags.length;

      // Calculate complexity based on description length, priority, and tags
      let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
      let estimatedTime = '5-10 min';
      let confidence = 95;

      if (description.length > 500 || priority === 'high' || tagCount > 5) {
        complexity = 'complex';
        estimatedTime = '20-30 min';
        confidence = 85;
      } else if (description.length > 200 || priority === 'medium' || tagCount > 2) {
        complexity = 'moderate';
        estimatedTime = '10-20 min';
        confidence = 90;
      }

      // Determine agent capabilities based on task
      const capabilities = ['Code Generation', 'Problem Solving', 'File Operations'];
      if (task.workingDirectory) {
        capabilities.push('Directory Navigation');
      }
      if (task.model === 'opus') {
        capabilities.push('Advanced Reasoning');
      }
      if (task.permissionMode !== 'default') {
        capabilities.push('Autonomous Operations');
      }

      setAssignmentDetails({
        estimatedTime,
        complexity,
        agentCapabilities: capabilities,
        confidence
      });

      setIsAnalyzing(false);
    };

    analyzeTask();
  }, [open, task]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getModelLabel = (model?: string) => {
    switch (model) {
      case 'opus': return 'Claude Opus (Most Capable)';
      case 'sonnet': return 'Claude Sonnet (Balanced)';
      default: return 'Default Model';
    }
  };

  const getPermissionModeLabel = (mode?: string) => {
    switch (mode) {
      case 'acceptEdits': return 'Accept Edits (Semi-autonomous)';
      case 'bypassPermissions': return 'Bypass Permissions (Full autonomy)';
      case 'plan': return 'Plan Mode (Planning only)';
      default: return 'Default (Ask for permission)';
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'complex': return 'bg-red-100 text-red-800';
      case 'moderate': return 'bg-yellow-100 text-yellow-800';
      case 'simple': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleAssignTask = async () => {
    if (!task) return;

    setIsAssigning(true);

    try {
      const sessionId = await assignTaskToAgent(task.id);

      if (assignmentMode === 'chat') {
        // Navigate directly to chat
        navigate(`/c/${sessionId}`);
        onClose();

        // Call success callback only for chat mode
        if (onSuccess) {
          onSuccess(sessionId);
        }
      } else {
        // Run in background - close dialog and let user monitor in Kanban board
        onClose();
        // Do NOT call onSuccess for background mode - stay on Kanban board
      }
    } catch (error) {
      console.error('Failed to assign task:', error);
      // Could show error toast here
    } finally {
      setIsAssigning(false);
    }
  };

  const handleClose = () => {
    if (!isAssigning) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            Assign Task to Agent
          </DialogTitle>
          <DialogDescription>
            Review the assignment details and choose how you want to proceed.
          </DialogDescription>
        </DialogHeader>

        {/* Task Details */}
        <div className="space-y-6 py-4">
          {/* Task Overview */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">{task.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {task.description}
                    </p>
                  </div>
                  <Badge className={getPriorityColor(task.priority)}>
                    {task.priority.toUpperCase()}
                  </Badge>
                </div>

                {task.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {task.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Assignment Analysis */}
          {isAnalyzing ? (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-6">
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Analyzing task requirements...</span>
                  </div>
                </div>
              </div>
            </div>
          ) : assignmentDetails ? (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="p-6">
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Assignment Analysis
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Timer className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">Estimated Time:</span>
                      <span className="font-medium">{assignmentDetails.estimatedTime}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">Complexity:</span>
                      <Badge className={getComplexityColor(assignmentDetails.complexity)}>
                        {assignmentDetails.complexity}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium">Agent Capabilities:</span>
                      <span className="text-xs text-muted-foreground">
                        ({assignmentDetails.confidence}% confidence)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {assignmentDetails.agentCapabilities.map((capability, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {capability}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Agent Configuration */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-6">
              <div className="space-y-4">
                <h4 className="font-medium">Agent Configuration</h4>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Bot className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Model:</span>
                    <span className="font-medium">{getModelLabel(task.model)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Permission Mode:</span>
                    <span className="font-medium">{getPermissionModeLabel(task.permissionMode)}</span>
                  </div>

                  {task.workingDirectory && (
                    <div className="flex items-center gap-3">
                      <FolderOpen className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">Working Directory:</span>
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {task.workingDirectory}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Assignment Mode Selection */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="p-6">
              <div className="space-y-4">
                <h4 className="font-medium">Choose Assignment Mode</h4>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setAssignmentMode('chat')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      assignmentMode === 'chat'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <MessageCircle className="w-6 h-6 mb-2 mx-auto text-blue-600" />
                    <div className="text-sm font-medium">Go to Chat</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Watch the agent work in real-time
                    </div>
                  </button>

                  <button
                    onClick={() => setAssignmentMode('background')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      assignmentMode === 'background'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Monitor className="w-6 h-6 mb-2 mx-auto text-green-600" />
                    <div className="text-sm font-medium">Run in Background</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Monitor progress and check results later
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isAssigning}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAssignTask}
            disabled={isAssigning || isAnalyzing}
            className="min-w-[140px]"
          >
            {isAssigning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              <>
                <Bot className="w-4 h-4 mr-2" />
                {assignmentMode === 'chat' ? 'Start Chat' : 'Run in Background'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}