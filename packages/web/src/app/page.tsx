'use client';

import { ErrorBoundary } from '@workflow/web-shared';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ConfigWarningBanner } from '@/components/config-warning-banner';
import { HooksTable } from '@/components/hooks-table';
import { RunsTable } from '@/components/runs-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowsList } from '@/components/workflows-list';
import { useProject } from '@/lib/project-context';
import { useProjectAsWorldConfig } from '@/lib/use-project-config';
import { useHookIdState, useSidebarState, useTabState } from '@/lib/url-state';

export default function Home() {
  const router = useRouter();
  const config = useProjectAsWorldConfig();
  const { validationStatus, currentProject, isLoading } = useProject();
  const [sidebar] = useSidebarState();
  const [hookId] = useHookIdState();
  const [tab, setTab] = useTabState();

  const selectedHookId = sidebar === 'hook' && hookId ? hookId : undefined;

  // Only show workflows tab for local backend
  const isLocalBackend = !config || config.backend === 'local' || !config.backend;

  const handleRunClick = (runId: string, streamId?: string) => {
    if (!streamId) {
      router.push(`/run/${runId}`);
    } else {
      router.push(`/run/${runId}/streams/${streamId}`);
    }
  };

  const handleHookSelect = (hookId: string, runId?: string) => {
    if (hookId) {
      router.push(`/run/${runId}?sidebar=hook&hookId=${hookId}`);
    } else {
      router.push(`/run/${runId}`);
    }
  };

  // Show loading state while project is being initialized from localStorage/query params
  if (isLoading || !config) {
    return (
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4">
      <ConfigWarningBanner
        hasViewError={false}
        isViewEmpty={!currentProject}
      />
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="hooks">Hooks</TabsTrigger>
          {isLocalBackend && (
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="runs">
          <ErrorBoundary
            title="Runs Error"
            description="Failed to load workflow runs. Please try refreshing the page."
          >
            <RunsTable config={config} onRunClick={handleRunClick} />
          </ErrorBoundary>
        </TabsContent>
        <TabsContent value="hooks">
          <ErrorBoundary
            title="Hooks Error"
            description="Failed to load hooks. Please try refreshing the page."
          >
            <HooksTable
              config={config}
              onHookClick={handleHookSelect}
              selectedHookId={selectedHookId}
            />
          </ErrorBoundary>
        </TabsContent>
        {isLocalBackend && (
          <TabsContent value="workflows">
            <ErrorBoundary
              title="Workflows Error"
              description="Failed to load workflow graph data. Please try refreshing the page."
            >
              <WorkflowsList config={config} />
            </ErrorBoundary>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
