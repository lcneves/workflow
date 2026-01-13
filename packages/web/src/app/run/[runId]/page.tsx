'use client';

import { ErrorBoundary } from '@workflow/web-shared';
import { Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { RunDetailView } from '@/components/run-detail-view';
import { useProject } from '@/lib/project-context';
import { useProjectAsWorldConfig } from '@/lib/use-project-config';
import {
  useEventIdState,
  useHookIdState,
  useStepIdState,
} from '@/lib/url-state';

export default function RunDetailPage() {
  const params = useParams();
  const config = useProjectAsWorldConfig();
  const { isLoading } = useProject();
  const [stepId] = useStepIdState();
  const [eventId] = useEventIdState();
  const [hookId] = useHookIdState();

  const runId = params.runId as string;
  const selectedId = stepId || eventId || hookId || undefined;

  // Show loading state while project is being initialized
  if (isLoading || !config) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ErrorBoundary
      title="Run Detail Error"
      description="Failed to load run details. Please try navigating back to the home page."
    >
      <RunDetailView config={config} runId={runId} selectedId={selectedId} />
    </ErrorBoundary>
  );
}
