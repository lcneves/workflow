'use client';

import { getProjectDisplayName } from '@workflow/utils/project';
import { getWorldById } from '@workflow/utils/worlds-manifest';
import { AlertCircle, CheckCircle, InfoIcon, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { ProjectSelection } from '@/components/project-selection';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  WorkflowDataDirInfo,
  WorldConfig,
} from '@/lib/config-world-types';
import { useDataDirInfo } from '@/lib/hooks';
import { useProject } from '@/lib/project-context';

interface ConnectionStatusProps {
  config: WorldConfig;
}

const getConnectionInfo = (
  backend: string,
  config: WorldConfig,
  dataDirInfo: WorkflowDataDirInfo | null | undefined
): { provider: string; parts: string[] } => {
  if (backend === 'vercel') {
    const parts: string[] = [];
    if (config.env) parts.push(`env: ${config.env}`);
    if (config.project) parts.push(`project: ${config.project}`);
    if (config.team) parts.push(`team: ${config.team}`);

    return { provider: 'Connected to Vercel', parts };
  }

  if (backend === 'local') {
    // Local backend - show projectDir instead of raw dataDir
    const parts: string[] = [];
    if (dataDirInfo?.projectDir) {
      parts.push(`project: ${dataDirInfo.projectDir}`);
    }
    if (config.port) parts.push(`port: ${config.port}`);

    return { provider: 'Local Dev', parts };
  }

  return {
    provider: config.backend
      ? `Connected to ${config.backend}`
      : 'Unknown connection',
    parts: [],
  };
};

export function ConnectionStatus({ config }: ConnectionStatusProps) {
  const { currentProject, validationResult, isSelfHosted } = useProject();
  const [isOpen, setIsOpen] = useState(false);

  const backend = config.backend || 'local';
  const { data: dataDirInfo } = useDataDirInfo(config.dataDir);
  const { provider, parts } = getConnectionInfo(backend, config, dataDirInfo);

  // Determine display info from project context or config
  const displayName = currentProject
    ? getProjectDisplayName(currentProject)
    : dataDirInfo?.shortName || (backend === 'vercel' ? config.env : undefined);

  const world = currentProject
    ? getWorldById(currentProject.worldId)
    : undefined;
  const worldName = world?.name || currentProject?.worldId || provider;

  // Validation status
  const isValid = validationResult?.valid ?? true;
  const hasWarnings =
    validationResult?.warnings && validationResult.warnings.length > 0;

  // Don't show project selector button in self-hosted mode
  if (isSelfHosted) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <span className="font-medium">
          {worldName} {displayName ? `(${displayName})` : ''}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="w-4 h-4" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Self-hosted mode</p>
            <p className="text-xs text-muted-foreground">
              Configuration is managed server-side.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Validation indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center">
              {!isValid ? (
                <AlertCircle className="w-4 h-4 text-destructive" />
              ) : hasWarnings ? (
                <AlertCircle className="w-4 h-4 text-amber-500" />
              ) : (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {!isValid ? (
              <div>
                <p className="font-medium">Configuration Error</p>
                <ul className="text-xs mt-1">
                  {validationResult?.errors.map((e, i) => (
                    <li key={i}>
                      {e.field}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : hasWarnings ? (
              <div>
                <p className="font-medium">Configuration Warnings</p>
                <ul className="text-xs mt-1">
                  {validationResult?.warnings.map((e, i) => (
                    <li key={i}>
                      {e.field}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>Configuration is valid</p>
            )}
          </TooltipContent>
        </Tooltip>

        {/* Connection info */}
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span className="font-medium">
            {worldName} {displayName ? `(${displayName})` : ''}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="w-4 h-4 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-1">
                {parts.map((part) => (
                  <span key={part}>{part}</span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Project selector button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setIsOpen(true)}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Project selection sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="right" className="w-[800px] sm:max-w-[800px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Project Selection</SheetTitle>
          </SheetHeader>
          <ProjectSelection onClose={() => setIsOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
