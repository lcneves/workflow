'use client';

import {
  AlertTriangle,
  Clock,
  Database,
  Folder,
  Plus,
  Server,
  Trash2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ConfigForm } from '@/components/config-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { buildUrlWithConfig, useQueryParamConfig } from '@/lib/config';
import type { WorldConfig } from '@/lib/config-world';
import { useWorldsAvailability } from '@/lib/hooks';
import {
  getBackendType,
  getRecentConfigs,
  migrateRecentConfigs,
  type RecentConfig,
  removeRecentConfig,
  saveRecentConfig,
} from '@/lib/recent-configs';
import { cn } from '@/lib/utils';

function getBackendIcon(config: WorldConfig) {
  const type = getBackendType(config);
  switch (type) {
    case 'local':
      return <Folder className="h-4 w-4" />;
    case 'postgres':
      return <Database className="h-4 w-4" />;
    case 'vercel':
      return <Server className="h-4 w-4" />;
    default:
      return <Server className="h-4 w-4" />;
  }
}

function getBackendLabel(config: WorldConfig) {
  const type = getBackendType(config);
  switch (type) {
    case 'local':
      return 'Local';
    case 'postgres':
      return 'PostgreSQL';
    case 'vercel':
      return 'Vercel';
    default:
      return config.backend || 'Unknown';
  }
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

interface RecentProjectCardProps {
  recent: RecentConfig;
  url: string;
  onSelect: () => void;
  onRemove: () => void;
}

function RecentProjectCard({
  recent,
  onSelect,
  onRemove,
  url,
}: RecentProjectCardProps) {
  return (
    <a
      className={cn(
        'block w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors group cursor-pointer',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
      )}
      href={url}
      onClick={(e) => {
        e.preventDefault();
        onSelect();
      }}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-muted text-muted-foreground shrink-0">
          {getBackendIcon(recent.config)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{recent.name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            <span>{getBackendLabel(recent.config)}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(recent.lastUsed)}
            </span>
          </div>
          {recent.config.dataDir && (
            <div className="text-xs text-muted-foreground truncate mt-1 font-mono">
              {recent.config.dataDir}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-opacity shrink-0"
          title="Remove from history"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </a>
  );
}

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const config = useQueryParamConfig();

  const [recentConfigs, setRecentConfigs] = useState<RecentConfig[]>([]);

  const { data: worldsAvailability = [], isLoading: isLoadingWorlds } =
    useWorldsAvailability();

  // Load recent configs on mount (and migrate any with relative paths)
  useEffect(() => {
    const loadConfigs = async () => {
      // First migrate any configs with relative paths to absolute
      await migrateRecentConfigs();
      // Then load the (potentially updated) configs
      setRecentConfigs(getRecentConfigs());
    };
    loadConfigs();
  }, []);

  // Get the original destination from query params
  const redirectTo = searchParams.get('redirectTo') || '/';
  const needsConfig = searchParams.get('needsConfig') === '1';

  // Show new project form if no recent configs or explicitly requested
  const hasRecentConfigs = recentConfigs.length > 0;

  const buildConfigUrl = (config: WorldConfig) => {
    return buildUrlWithConfig(redirectTo, config);
  };

  const handleApply = async (newConfig: WorldConfig) => {
    // Save to recent configs (normalizes paths)
    await saveRecentConfig(newConfig);
    setRecentConfigs(getRecentConfigs());

    // Navigate to the intended destination with the new config in URL
    router.push(buildConfigUrl(newConfig));
  };

  const handleSelectRecent = async (recent: RecentConfig) => {
    // Update last used time
    await saveRecentConfig(recent.config);
    setRecentConfigs(getRecentConfigs());

    // Navigate to the intended destination with the selected config in URL
    router.push(buildConfigUrl(recent.config));
  };

  const handleRemoveRecent = (id: string) => {
    removeRecentConfig(id);
    setRecentConfigs(getRecentConfigs());
  };

  return (
    <div className="flex-1">
      <div className="max-w-5xl mx-auto">
        {/* Warning banner if opened due to config error */}
        {needsConfig && (
          <div className="flex items-start gap-3 p-4 mb-6 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Configuration Required</p>
              <p className="mt-1 text-amber-600 dark:text-amber-500">
                Could not find a valid data source. Please select a recent
                project or configure a new connection to a World.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left pane: Recent Projects */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Projects
              </CardTitle>
              <CardDescription>
                {hasRecentConfigs
                  ? 'Select a previously connected project'
                  : 'No recent projects found'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasRecentConfigs ? (
                <div className="space-y-2">
                  {recentConfigs.map((recent) => (
                    <RecentProjectCard
                      key={recent.id}
                      recent={recent}
                      url={buildConfigUrl(recent.config)}
                      onSelect={() => handleSelectRecent(recent)}
                      onRemove={() => handleRemoveRecent(recent.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Folder className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    Connect to a project to get started.
                    <br />
                    It will appear here for quick access.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right pane: Connect to a project */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                New Project
              </CardTitle>
              <CardDescription>
                Tell us how to connect to and configure your World
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigForm
                config={config}
                worldsAvailability={worldsAvailability}
                isLoadingWorlds={isLoadingWorlds}
                onApply={handleApply}
                applyButtonText="Connect"
                showCancel={hasRecentConfigs}
                cancelButtonText="Cancel"
              />

              {/* Help text */}
              <div className="mt-6 pt-4 border-t">
                <p className="text-xs text-muted-foreground text-center">
                  Need help?{' '}
                  <a
                    href="https://useworkflow.dev/docs/getting-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Read the documentation
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <SetupContent />
    </Suspense>
  );
}
