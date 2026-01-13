'use client';

import { type Project, createProject } from '@workflow/utils/project-types';
import {
  worldsManifest,
  getWorldById,
  getEnvVarDisplayName,
  getEnvVarDescription,
  isEnvVarSensitive,
} from '@workflow/utils/worlds-manifest';
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  Clock4,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useProject } from '@/lib/project-context';
import { useProjectDisplayTitle } from '@/lib/use-project-config';

export default function ProjectsPage() {
  const router = useRouter();
  const {
    currentProject,
    recentProjects,
    setCurrentProject,
    deleteRecentProject,
    isSelfHosting,
    validateCurrentProject,
  } = useProject();

  // Redirect to home if in self-hosting mode
  useEffect(() => {
    if (isSelfHosting) {
      router.replace('/');
    }
  }, [isSelfHosting, router]);

  // Local state for new project form
  const [selectedWorldId, setSelectedWorldId] = useState<string>(
    currentProject?.worldId || 'local'
  );
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [projectDir, setProjectDir] = useState<string>(
    currentProject?.projectDir || './'
  );
  const [customEnvPairs, setCustomEnvPairs] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [errors, setErrors] = useState<
    Array<{ field: string; message: string }>
  >([]);
  const [isValidating, setIsValidating] = useState(false);

  // Get selected world definition
  const selectedWorld = getWorldById(selectedWorldId);
  const isKnownWorld = !!selectedWorld;

  // Initialize form from current project
  useEffect(() => {
    if (currentProject) {
      setSelectedWorldId(currentProject.worldId);
      setProjectDir(currentProject.projectDir);

      // Populate env values
      const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(currentProject.envMap)) {
        if (value) values[key] = value;
      }
      setEnvValues(values);

      // For unknown worlds, extract custom env pairs
      if (!getWorldById(currentProject.worldId)) {
        const pairs = Object.entries(currentProject.envMap)
          .filter(([_, v]) => v)
          .map(([key, value]) => ({ key, value: value! }));
        setCustomEnvPairs(pairs);
      }
    }
  }, [currentProject]);

  const handleWorldChange = (worldId: string) => {
    setSelectedWorldId(worldId);
    setErrors([]);

    // Reset env values when changing world
    const world = getWorldById(worldId);
    if (world) {
      // Initialize with defaults from world manifest
      const defaults: Record<string, string> = {};
      for (const [key, value] of Object.entries(world.env)) {
        defaults[key] = value;
      }
      setEnvValues(defaults);
      setCustomEnvPairs([]);
    } else if (worldId === 'custom') {
      // For 'custom' selection, start with empty env pairs
      setEnvValues({});
      setCustomEnvPairs([{ key: 'WORKFLOW_TARGET_WORLD', value: '' }]);
    } else {
      // For unknown world IDs (e.g., entered package name)
      setEnvValues({});
      setCustomEnvPairs([{ key: 'WORKFLOW_TARGET_WORLD', value: worldId }]);
    }
  };

  const handleEnvChange = (key: string, value: string) => {
    setEnvValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => prev.filter((e) => e.field !== key));
  };

  const handleAddCustomEnv = () => {
    setCustomEnvPairs((prev) => [...prev, { key: '', value: '' }]);
  };

  const handleCustomEnvChange = (
    index: number,
    field: 'key' | 'value',
    value: string
  ) => {
    setCustomEnvPairs((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveCustomEnv = (index: number) => {
    setCustomEnvPairs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveProject = async () => {
    setIsValidating(true);
    setErrors([]);

    try {
      // Build env map
      const envMap: Record<string, string | undefined> = {};

      if (isKnownWorld) {
        // For known worlds, use the form values
        for (const envVar of [
          ...(selectedWorld?.requiredEnv || []),
          ...(selectedWorld?.optionalEnv || []),
        ]) {
          if (envValues[envVar]) {
            envMap[envVar] = envValues[envVar];
          }
        }
      } else {
        // For custom worlds, use custom env pairs
        for (const pair of customEnvPairs) {
          if (pair.key && pair.value) {
            envMap[pair.key] = pair.value;
          }
        }
      }

      // Create the project
      const newProject = createProject(selectedWorldId, projectDir, envMap);

      // Set as current project
      setCurrentProject(newProject);

      // Validate
      await validateCurrentProject();

      // Navigate back to main view
      router.push('/');
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
  };

  const handleSelectRecent = (project: Project) => {
    setCurrentProject(project);
    router.push('/');
  };

  const handleDeleteRecent = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteRecentProject(projectId);
  };

  // Don't render anything if in self-hosting mode (will redirect)
  if (isSelfHosting) {
    return null;
  }

  return (
    <div className="container max-w-6xl mx-auto py-6">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Project Configuration</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Pane: Recent Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 && !currentProject ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No recent projects. Create a new project to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {/* Current project */}
                {currentProject && (
                  <CurrentProjectItem project={currentProject} />
                )}

                {/* Recent projects */}
                {recentProjects.map((project) => (
                  <RecentProjectItem
                    key={project.id}
                    project={project}
                    onSelect={() => handleSelectRecent(project)}
                    onDelete={(e) => handleDeleteRecent(project.id, e)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Pane: New/Edit Project */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              {currentProject ? 'Edit Project' : 'New Project'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* World Selection */}
            <div className="space-y-2">
              <Label htmlFor="world">World</Label>
              <Select value={selectedWorldId} onValueChange={handleWorldChange}>
                <SelectTrigger id="world">
                  <SelectValue placeholder="Select a world" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom-header" disabled>
                    — Official Worlds —
                  </SelectItem>
                  {worldsManifest.worlds
                    .filter((w) => w.type === 'official')
                    .map((world) => (
                      <SelectItem key={world.id} value={world.id}>
                        {world.name}
                      </SelectItem>
                    ))}
                  <SelectItem value="community-header" disabled>
                    — Community Worlds —
                  </SelectItem>
                  {worldsManifest.worlds
                    .filter((w) => w.type === 'community')
                    .map((world) => (
                      <SelectItem key={world.id} value={world.id}>
                        {world.name}
                      </SelectItem>
                    ))}
                  <SelectItem value="custom">
                    Custom (enter package name)
                  </SelectItem>
                </SelectContent>
              </Select>
              {selectedWorld?.description && (
                <p className="text-xs text-muted-foreground">
                  {selectedWorld.description}
                </p>
              )}
            </div>

            {/* Custom world package name input */}
            {selectedWorldId === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="customWorld">Package Name</Label>
                <Input
                  id="customWorld"
                  value={
                    customEnvPairs.find(
                      (p) => p.key === 'WORKFLOW_TARGET_WORLD'
                    )?.value || ''
                  }
                  onChange={(e) => {
                    const newWorldId = e.target.value;
                    // Update the WORKFLOW_TARGET_WORLD entry or add it
                    setCustomEnvPairs((prev) => {
                      const existing = prev.findIndex(
                        (p) => p.key === 'WORKFLOW_TARGET_WORLD'
                      );
                      if (existing >= 0) {
                        const updated = [...prev];
                        updated[existing] = {
                          key: 'WORKFLOW_TARGET_WORLD',
                          value: newWorldId,
                        };
                        return updated;
                      }
                      return [
                        { key: 'WORKFLOW_TARGET_WORLD', value: newWorldId },
                        ...prev,
                      ];
                    });
                  }}
                  placeholder="@my-org/my-world"
                />
              </div>
            )}

            {/* Known world env vars */}
            {isKnownWorld && selectedWorld && (
              <div className="space-y-4 pt-4 border-t">
                {/* Required env vars */}
                {selectedWorld.requiredEnv.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">
                      Required Configuration
                    </h4>
                    {selectedWorld.requiredEnv.map((envVar) => (
                      <EnvVarInput
                        key={envVar}
                        envVar={envVar}
                        value={envValues[envVar] || ''}
                        onChange={(value) => handleEnvChange(envVar, value)}
                        error={errors.find((e) => e.field === envVar)?.message}
                      />
                    ))}
                  </div>
                )}

                {/* Optional env vars - include Project Directory for non-local worlds */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">
                    Optional Configuration
                  </h4>
                  {selectedWorld.optionalEnv.map((envVar) => (
                    <EnvVarInput
                      key={envVar}
                      envVar={envVar}
                      value={envValues[envVar] || ''}
                      onChange={(value) => handleEnvChange(envVar, value)}
                      error={errors.find((e) => e.field === envVar)?.message}
                    />
                  ))}
                  {/* Project Directory - only shown for non-local worlds in optional section */}
                  {selectedWorldId !== 'local' && (
                    <div className="space-y-1">
                      <Label htmlFor="projectDir">Project Directory</Label>
                      <Input
                        id="projectDir"
                        value={projectDir}
                        onChange={(e) => setProjectDir(e.target.value)}
                        placeholder="./"
                      />
                      <p className="text-xs text-muted-foreground">
                        Path to associate with this project (helps identify
                        source folders)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Custom world env vars - show for 'custom' or any unknown world */}
            {!isKnownWorld && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Environment Variables</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustomEnv}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                {customEnvPairs.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Add environment variables required by your custom world.
                  </p>
                )}
                {customEnvPairs.map((pair, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="KEY"
                      value={pair.key}
                      onChange={(e) =>
                        handleCustomEnvChange(index, 'key', e.target.value)
                      }
                      className="font-mono text-sm"
                    />
                    <Input
                      placeholder="value"
                      value={pair.value}
                      onChange={(e) =>
                        handleCustomEnvChange(index, 'value', e.target.value)
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCustomEnv(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {/* Project Directory for custom worlds */}
                <div className="space-y-1 pt-2">
                  <Label htmlFor="projectDir">Project Directory</Label>
                  <Input
                    id="projectDir"
                    value={projectDir}
                    onChange={(e) => setProjectDir(e.target.value)}
                    placeholder="./"
                  />
                  <p className="text-xs text-muted-foreground">
                    Path to associate with this project (helps identify source
                    folders)
                  </p>
                </div>
              </div>
            )}

            {/* Errors */}
            {errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Configuration Error</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1">
                    {errors.map((error, idx) => (
                      <li key={idx}>
                        {error.field !== 'general' && (
                          <strong>{error.field}:</strong>
                        )}{' '}
                        {error.message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Save Button */}
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSaveProject}
                disabled={isValidating}
                className="flex-1"
              >
                {isValidating ? 'Saving...' : 'Save & Apply'}
              </Button>
              <Link href="/">
                <Button variant="outline">Cancel</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface EnvVarInputProps {
  envVar: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function EnvVarInput({ envVar, value, onChange, error }: EnvVarInputProps) {
  const displayName = getEnvVarDisplayName(envVar);
  const description = getEnvVarDescription(envVar);
  const isSensitive = isEnvVarSensitive(envVar);

  return (
    <div className="space-y-1">
      <Label htmlFor={envVar}>{displayName}</Label>
      <Input
        id={envVar}
        type={isSensitive ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={envVar}
        className={error ? 'border-destructive' : ''}
      />
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Shared project info display
 */
function ProjectInfo({ project }: { project: Project }) {
  const { worldName, relativeTime, title, details } =
    useProjectDisplayTitle(project);

  return (
    <div className="flex-1 min-w-0 space-y-0.5">
      <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
        {worldName}
        {relativeTime && (
          <>
            {' - '}
            <Clock4 className="h-3 w-3" />
            {relativeTime}
          </>
        )}
      </div>
      <div className="font-medium truncate">{title}</div>
      {details && (
        <div className="text-xs text-muted-foreground truncate font-mono">
          {details}
        </div>
      )}
    </div>
  );
}

/**
 * Display the current project with config summary as main title
 */
function CurrentProjectItem({ project }: { project: Project }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
      <ProjectInfo project={project} />
      <span className="text-xs text-primary shrink-0">Current</span>
    </div>
  );
}

/**
 * Display a recent project item with config summary as main title
 */
function RecentProjectItem({
  project,
  onSelect,
  onDelete,
}: {
  project: Project;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="relative w-full flex items-center gap-2 p-3 rounded-lg border hover:bg-accent transition-colors text-left">
      {/* Invisible button overlay for selection - avoids nested button a11y issue */}
      <button
        type="button"
        onClick={onSelect}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Select project"
      />
      <ProjectInfo project={project} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative z-10 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Forget this project</TooltipContent>
      </Tooltip>
    </div>
  );
}
