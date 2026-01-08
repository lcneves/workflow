'use client';

import { Info, Lock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorldConfig } from '@/lib/world-config-context';

/**
 * Displays the current connection status and configuration mode.
 * Shows which backend is being used and where the config comes from.
 */
export function ConnectionStatus() {
  const { mode, isLoading, effectiveConfig, dataDirInfo } = useWorldConfig();

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <span className="animate-pulse">Loading...</span>
      </div>
    );
  }

  const backend = effectiveConfig.backend.value || 'local';
  const backendSource = effectiveConfig.backend.source;
  const isFromEnv = backendSource === 'env';

  // Determine display name for backend
  const backendDisplayNames: Record<string, string> = {
    local: 'Local development',
    vercel: 'Connected to Vercel',
    postgres: 'Connected to PostgreSQL',
    '@workflow/world-local': 'Local development',
    '@workflow/world-vercel': 'Connected to Vercel',
    '@workflow/world-postgres': 'Connected to Postgres',
  };
  const backendName = backendDisplayNames[backend] || backend;

  // Build subtitle based on backend type
  let subtitle = '';
  if (backend === 'local' || backend === '@workflow/world-local') {
    subtitle = dataDirInfo?.shortName || '';
  } else if (backend === 'vercel' || backend === '@workflow/world-vercel') {
    subtitle = effectiveConfig.vercelEnv.value || '';
  }

  // Build tooltip parts
  const parts: string[] = [];

  if (backend === 'local' || backend === '@workflow/world-local') {
    if (dataDirInfo?.projectDir) {
      parts.push(`Project: ${dataDirInfo.projectDir}`);
    }
    if (effectiveConfig.port.value) {
      parts.push(`Port: ${effectiveConfig.port.value}`);
    }
  } else if (backend === 'vercel' || backend === '@workflow/world-vercel') {
    if (effectiveConfig.vercelEnv.value) {
      parts.push(`Environment: ${effectiveConfig.vercelEnv.value}`);
    }
    if (effectiveConfig.vercelProject.value) {
      parts.push(`Project: ${effectiveConfig.vercelProject.value}`);
    }
    if (effectiveConfig.vercelTeam.value) {
      parts.push(`Team: ${effectiveConfig.vercelTeam.value}`);
    }
  } else if (backend === 'postgres' || backend === '@workflow/world-postgres') {
    if (effectiveConfig.postgresUrl.value) {
      // Only show host part of connection string for security
      try {
        const url = new URL(effectiveConfig.postgresUrl.value);
        parts.push(`Host: ${url.hostname}`);
        if (url.pathname) {
          parts.push(`Database: ${url.pathname.slice(1)}`);
        }
      } catch {
        parts.push('Connection configured');
      }
    }
  }

  // Add config source info
  const modeLabels: Record<string, string> = {
    'self-hosted': 'Self-hosted (env vars)',
    cli: 'CLI',
    standalone: 'Manual configuration',
  };
  parts.push(`Mode: ${modeLabels[mode] || mode}`);

  return (
    <div className="text-sm text-muted-foreground flex items-center gap-2">
      <span className="font-medium flex items-center gap-1.5">
        {isFromEnv && <Lock className="w-3 h-3 text-blue-500" />}
        {backendName}
        {subtitle && (
          <span className="text-muted-foreground">({subtitle})</span>
        )}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-4 h-4 cursor-help" />
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-1 text-xs">
            {parts.map((part) => (
              <span key={part}>{part}</span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
