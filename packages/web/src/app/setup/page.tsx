'use client';

import { AlertTriangle, Database, Folder, Server } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ConfigForm } from '@/components/config-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  buildUrlWithConfig,
  useQueryParamConfig,
  useUpdateConfigQueryParams,
} from '@/lib/config';
import { useWorldsAvailability } from '@/lib/hooks';
import { Logo } from '../../icons/logo';

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const config = useQueryParamConfig();
  const updateConfig = useUpdateConfigQueryParams();

  const { data: worldsAvailability = [], isLoading: isLoadingWorlds } =
    useWorldsAvailability();

  // Get the original destination from query params
  const redirectTo = searchParams.get('redirectTo') || '/';

  const handleApply = (newConfig: typeof config) => {
    updateConfig(newConfig);
    // Navigate to the intended destination
    router.push(buildUrlWithConfig(redirectTo, newConfig));
  };

  const backend = config.backend || 'local';

  const getBackendIcon = () => {
    switch (backend) {
      case 'local':
        return <Folder className="h-5 w-5" />;
      case 'postgres':
        return <Database className="h-5 w-5" />;
      default:
        return <Server className="h-5 w-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col">
      {/* Header */}
      <header className="p-6">
        <div className="flex items-center gap-2">
          <Logo />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <Card className="border-2 shadow-lg">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10 text-primary w-fit">
                {getBackendIcon()}
              </div>
              <CardTitle className="text-2xl font-bold">
                Configure World
              </CardTitle>
              <CardDescription className="text-base">
                Set up your connection to view and manage workflows
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              {/* Warning banner if opened due to config error */}
              {searchParams.get('needsConfig') === '1' && (
                <div className="flex items-start gap-3 p-3 mb-6 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">Configuration Required</p>
                    <p className="mt-1 text-amber-600 dark:text-amber-500">
                      The CLI couldn&apos;t find a valid data source. Please
                      configure your connection below.
                    </p>
                  </div>
                </div>
              )}

              <ConfigForm
                config={config}
                worldsAvailability={worldsAvailability}
                isLoadingWorlds={isLoadingWorlds}
                onApply={handleApply}
                applyButtonText="Connect & Continue"
                showCancel={false}
              />

              {/* Help text */}
              <div className="mt-6 pt-4 border-t">
                <p className="text-xs text-muted-foreground text-center">
                  Need help?{' '}
                  <a
                    href="https://useworkflow.dev/docs/observability"
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
      </main>
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
