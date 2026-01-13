'use client';

import { getWorldById } from '@workflow/utils/worlds-manifest';
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Loader2,
  Settings,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useProject } from '@/lib/project-context';
import { useDataDirInfo } from '@/lib/hooks';

/**
 * Connection status display with project info and navigation to project settings.
 * The entire component is clickable to navigate to/from the projects page.
 */
export function ConnectionStatus() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    currentProject,
    validationStatus,
    validateCurrentProject,
    isSelfHosting,
  } = useProject();

  // Check if we're on the projects page
  const isOnProjectsPage = pathname === '/projects';

  // Get world info
  const world = currentProject?.worldId
    ? getWorldById(currentProject.worldId)
    : null;
  const worldName = world?.name || currentProject?.worldId || 'Local';
  const isLocal =
    currentProject?.worldId === 'local' || !currentProject?.worldId;
  const dataDir = currentProject?.envMap.WORKFLOW_LOCAL_DATA_DIR;

  // Get data dir info for local world
  // IMPORTANT: All hooks must be called before any conditional returns (Rules of Hooks)
  const { data: dataDirInfo } = useDataDirInfo(isLocal ? dataDir || './' : '');

  // Validate project on mount and when it changes
  useEffect(() => {
    if (
      currentProject &&
      !validationStatus.loading &&
      !validationStatus.lastChecked
    ) {
      validateCurrentProject();
    }
  }, [
    currentProject,
    validationStatus.loading,
    validationStatus.lastChecked,
    validateCurrentProject,
  ]);

  // Revalidate on focus
  useEffect(() => {
    const handleFocus = () => {
      if (currentProject) {
        validateCurrentProject();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentProject, validateCurrentProject]);

  // In self-hosting mode, don't show the connection status
  // IMPORTANT: This return must come AFTER all hooks are called
  if (isSelfHosting) {
    return null;
  }

  // Determine status
  const isValid = validationStatus.valid;
  const isLoading = validationStatus.loading;
  const hasErrors = validationStatus.errors.length > 0;
  const criticalErrors = validationStatus.errors.filter((e) => e.critical);

  // Build display info
  const displayInfo = getDisplayInfo(
    worldName,
    currentProject,
    dataDirInfo,
    isLocal
  );

  const handleClick = () => {
    if (isOnProjectsPage) {
      router.push('/');
    } else {
      router.push('/projects');
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-background hover:bg-accent transition-colors cursor-pointer"
        >
          {/* Status indicator */}
          <div className="flex items-center gap-1.5 text-sm">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : isValid ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive" />
            )}

            <span className="font-medium">{displayInfo.title}</span>

            {displayInfo.subtitle && (
              <span className="text-muted-foreground">
                ({displayInfo.subtitle})
              </span>
            )}
          </div>

          {/* Settings/chevron icon */}
          {isOnProjectsPage ? (
            <ChevronRight className="w-4 h-4 text-muted-foreground rotate-180" />
          ) : (
            <Settings className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-2">
          <div className="font-medium">
            {isOnProjectsPage ? 'Back to runs' : 'Project Settings'}
          </div>
          <div className="text-xs text-muted-foreground">
            {displayInfo.title}
            {displayInfo.subtitle && ` (${displayInfo.subtitle})`}
          </div>
          {displayInfo.details.map((detail, i) => (
            <div key={i} className="text-xs text-muted-foreground">
              {detail}
            </div>
          ))}
          {hasErrors && (
            <div className="pt-2 border-t">
              <div className="text-xs font-medium text-destructive">
                {criticalErrors.length > 0
                  ? `${criticalErrors.length} critical error(s)`
                  : `${validationStatus.errors.length} warning(s)`}
              </div>
              {validationStatus.errors.slice(0, 3).map((error, i) => (
                <div
                  key={i}
                  className={`text-xs ${error.critical ? 'text-destructive' : 'text-amber-600'}`}
                >
                  • {error.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface DisplayInfo {
  title: string;
  subtitle: string | null;
  details: string[];
}

function getDisplayInfo(
  worldName: string,
  project: ReturnType<typeof useProject>['currentProject'],
  dataDirInfo: { shortName?: string; projectDir?: string } | undefined,
  isLocal: boolean
): DisplayInfo {
  const details: string[] = [];

  if (!project) {
    return {
      title: 'No project configured',
      subtitle: null,
      details: ['Configure a project to view workflow data'],
    };
  }

  if (isLocal) {
    const subtitle = dataDirInfo?.shortName || null;
    if (dataDirInfo?.projectDir) {
      details.push(`Project: ${dataDirInfo.projectDir}`);
    }
    if (project.envMap.PORT) {
      details.push(`Port: ${project.envMap.PORT}`);
    }
    return {
      title: 'Local Dev',
      subtitle,
      details,
    };
  }

  if (project.worldId === 'vercel') {
    const team = project.envMap.WORKFLOW_VERCEL_TEAM;
    const proj = project.envMap.WORKFLOW_VERCEL_PROJECT;
    const envName = project.envMap.WORKFLOW_VERCEL_ENV || 'production';

    // Build title: Vercel (team/project) or Vercel (project) or just Vercel
    let title = 'Vercel';
    if (team && proj) {
      title = `Vercel (${team}/${proj})`;
    } else if (proj) {
      title = `Vercel (${proj})`;
    }

    details.push(`Environment: ${envName}`);

    return {
      title,
      subtitle: null,
      details,
    };
  }

  if (project.worldId === 'postgres') {
    return {
      title: 'PostgreSQL',
      subtitle: null,
      details: project.envMap.WORKFLOW_POSTGRES_URL
        ? ['Connection configured']
        : ['Connection URL not set'],
    };
  }

  // Generic world
  return {
    title: worldName,
    subtitle: null,
    details: [`World: ${project.worldId}`],
  };
}
