'use client';

import type { EnvMap, Project } from '@workflow/utils/project';
import {
  createProject,
  generateProjectId,
  getProjectDisplayName,
} from '@workflow/utils/project';
import {
  getEnvDisplayInfo,
  isEnvSensitive,
} from '@workflow/utils/env-display-names';
import {
  getWorldById,
  worldsManifest,
  type WorldManifestEntry,
} from '@workflow/utils/worlds-manifest';
import { AlertCircle, Plus, Trash2, Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProject } from '@/lib/project-context';

interface ProjectFormState {
  name: string;
  worldId: string;
  envMap: EnvMap;
  projectDir: string;
}

function createInitialFormState(project?: Project | null): ProjectFormState {
  if (project) {
    return {
      name: project.name,
      worldId: project.worldId,
      envMap: { ...project.envMap },
      projectDir: project.projectDir || '',
    };
  }
  return {
    name: '',
    worldId: 'local',
    envMap: {},
    projectDir: '',
  };
}

/**
 * Recent projects list pane
 */
function RecentProjectsPane({
  projects,
  currentProjectId,
  onSelect,
  onDelete,
}: {
  projects: Project[];
  currentProjectId?: string;
  onSelect: (project: Project) => void;
  onDelete: (projectId: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground p-8 text-center">
        <div>
          <p className="text-sm">No recent projects</p>
          <p className="text-xs mt-1">Create a new project to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-2 p-4">
        {projects.map((project) => {
          const isActive = project.id === currentProjectId;
          const world = getWorldById(project.worldId);
          const displayName = getProjectDisplayName(project);

          return (
            <div
              key={project.id}
              className={`group relative rounded-lg border p-3 cursor-pointer transition-colors ${
                isActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-accent/50'
              }`}
              onClick={() => onSelect(project)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{displayName}</span>
                    {isActive && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {world?.name || project.worldId}
                  </div>
                  {project.projectDir && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {project.projectDir}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(project.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Project configuration form pane
 */
function ProjectConfigPane({
  formState,
  onChange,
  onSave,
  onCancel,
  isNew,
  errors,
  isValidating,
}: {
  formState: ProjectFormState;
  onChange: (updates: Partial<ProjectFormState>) => void;
  onSave: () => void;
  onCancel?: () => void;
  isNew: boolean;
  errors: Array<{ field: string; message: string }>;
  isValidating: boolean;
}) {
  const world = getWorldById(formState.worldId);
  const allWorlds = worldsManifest.worlds;

  // Get all env vars for this world
  const envVars = world
    ? [...world.requiredEnv, ...world.optionalEnv]
    : Object.keys(formState.envMap);

  const handleEnvChange = (key: string, value: string) => {
    onChange({
      envMap: { ...formState.envMap, [key]: value },
    });
  };

  const getFieldError = (field: string) => {
    return errors.find((e) => e.field === field)?.message;
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="worldId">World</Label>
          <Select
            value={formState.worldId}
            onValueChange={(value) => onChange({ worldId: value })}
          >
            <SelectTrigger id="worldId">
              <SelectValue placeholder="Select a world" />
            </SelectTrigger>
            <SelectContent>
              {allWorlds.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  <div className="flex flex-col">
                    <span>{w.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {w.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
              <SelectItem value="custom">
                <span className="text-muted-foreground">Custom world...</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formState.worldId === 'custom' && (
          <div className="space-y-2">
            <Label htmlFor="customWorld">Custom World Package</Label>
            <Input
              id="customWorld"
              value={formState.envMap.WORKFLOW_TARGET_WORLD || ''}
              onChange={(e) =>
                handleEnvChange('WORKFLOW_TARGET_WORLD', e.target.value)
              }
              placeholder="@my-org/my-world"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">Project Name</Label>
          <Input
            id="name"
            value={formState.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={world?.name ? `${world.name} Project` : 'My Project'}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="projectDir">Project Directory</Label>
          <Input
            id="projectDir"
            value={formState.projectDir}
            onChange={(e) => onChange({ projectDir: e.target.value })}
            placeholder="/path/to/project"
          />
          <p className="text-xs text-muted-foreground">
            Optional. Associates this config with a source folder for debugging.
          </p>
        </div>

        {/* World-specific env vars */}
        {envVars.length > 0 && (
          <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-medium">Configuration</h4>
            {envVars.map((envName) => {
              const info = getEnvDisplayInfo(envName);
              const isSensitive = isEnvSensitive(envName);
              const isRequired = world?.requiredEnv.includes(envName);
              const fieldError = getFieldError(envName);

              return (
                <div key={envName} className="space-y-2">
                  <Label htmlFor={envName}>
                    {info.label}
                    {isRequired && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                  <Input
                    id={envName}
                    type={isSensitive ? 'password' : 'text'}
                    value={formState.envMap[envName] || ''}
                    onChange={(e) => handleEnvChange(envName, e.target.value)}
                    placeholder={info.placeholder}
                    className={fieldError ? 'border-destructive' : ''}
                  />
                  {info.description && (
                    <p className="text-xs text-muted-foreground">
                      {info.description}
                    </p>
                  )}
                  {fieldError && (
                    <p className="text-xs text-destructive">{fieldError}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Unknown world - custom env var input */}
        {!world && formState.worldId !== 'custom' && (
          <div className="space-y-4 pt-4 border-t">
            <h4 className="text-sm font-medium">Environment Variables</h4>
            <p className="text-xs text-muted-foreground">
              Add custom environment variables for your world.
            </p>
            {/* TODO: Add dynamic key-value input for custom env vars */}
          </div>
        )}

        {errors.length > 0 && errors.some((e) => e.field === 'general') && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {errors.find((e) => e.field === 'general')?.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2 pt-4">
          <Button onClick={onSave} disabled={isValidating} className="flex-1">
            {isValidating
              ? 'Validating...'
              : isNew
                ? 'Create Project'
                : 'Save Changes'}
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Main Project Selection view component
 */
export function ProjectSelection({ onClose }: { onClose?: () => void }) {
  const {
    currentProject,
    recentProjects,
    setCurrentProject,
    removeRecentProject,
  } = useProject();

  const [formState, setFormState] = useState<ProjectFormState>(() =>
    createInitialFormState(currentProject)
  );
  const [errors, setErrors] = useState<
    Array<{ field: string; message: string }>
  >([]);
  const [isValidating, setIsValidating] = useState(false);

  // Update form when switching to a project
  const handleSelectProject = useCallback(
    (project: Project) => {
      setCurrentProject(project);
      setFormState(createInitialFormState(project));
      setErrors([]);
      onClose?.();
    },
    [setCurrentProject, onClose]
  );

  // Update form when current project changes externally
  useEffect(() => {
    if (currentProject) {
      setFormState(createInitialFormState(currentProject));
    }
  }, [currentProject?.id]);

  const handleFormChange = useCallback((updates: Partial<ProjectFormState>) => {
    setFormState((prev) => ({ ...prev, ...updates }));
    // Clear errors for changed fields
    if (updates.envMap) {
      const changedKeys = Object.keys(updates.envMap);
      setErrors((prev) => prev.filter((e) => !changedKeys.includes(e.field)));
    }
  }, []);

  const handleSave = useCallback(async () => {
    setIsValidating(true);
    setErrors([]);

    try {
      // Create or update project
      const project: Project = currentProject
        ? {
            ...currentProject,
            name:
              formState.name ||
              `${getWorldById(formState.worldId)?.name || formState.worldId} Project`,
            worldId: formState.worldId,
            envMap: formState.envMap,
            projectDir: formState.projectDir || undefined,
          }
        : createProject(formState.worldId, formState.envMap, {
            name: formState.name,
            projectDir: formState.projectDir || undefined,
          });

      // TODO: Call validateProjectConfig server action here
      // For now, just set the project
      setCurrentProject(project);
      onClose?.();
    } catch (error) {
      setErrors([
        {
          field: 'general',
          message:
            error instanceof Error ? error.message : 'Failed to save project',
        },
      ]);
    } finally {
      setIsValidating(false);
    }
  }, [currentProject, formState, setCurrentProject, onClose]);

  const handleCreateNew = useCallback(() => {
    setFormState(createInitialFormState());
    setErrors([]);
  }, []);

  const isEditing = currentProject !== null;
  const formHasChanges =
    formState.name !== (currentProject?.name || '') ||
    formState.worldId !== (currentProject?.worldId || 'local') ||
    formState.projectDir !== (currentProject?.projectDir || '') ||
    JSON.stringify(formState.envMap) !==
      JSON.stringify(currentProject?.envMap || {});

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold">Projects</h2>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left pane - Recent Projects */}
        <div className="w-1/2 border-r flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Recent Projects
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateNew}
              className="h-7"
            >
              <Plus className="h-3 w-3 mr-1" />
              New
            </Button>
          </div>
          <RecentProjectsPane
            projects={recentProjects}
            currentProjectId={currentProject?.id}
            onSelect={handleSelectProject}
            onDelete={removeRecentProject}
          />
        </div>

        {/* Right pane - Configuration */}
        <div className="w-1/2 flex flex-col">
          <div className="p-4 border-b">
            <h3 className="text-sm font-medium text-muted-foreground">
              {isEditing ? 'Edit Project' : 'New Project'}
            </h3>
          </div>
          <ProjectConfigPane
            formState={formState}
            onChange={handleFormChange}
            onSave={handleSave}
            onCancel={
              formHasChanges
                ? () => setFormState(createInitialFormState(currentProject))
                : undefined
            }
            isNew={!isEditing}
            errors={errors}
            isValidating={isValidating}
          />
        </div>
      </div>
    </div>
  );
}
