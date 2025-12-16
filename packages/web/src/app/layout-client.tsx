'use client';

import { TooltipProvider } from '@radix-ui/react-tooltip';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ThemeProvider, useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { ConnectionStatus } from '@/components/display-utils/connection-status';
import { SettingsDropdown } from '@/components/settings-dropdown';
import { Toaster } from '@/components/ui/sonner';
import { buildUrlWithConfig, useQueryParamConfig } from '@/lib/config';
import { useConfigHealth } from '@/lib/hooks';
import { Logo } from '../icons/logo';

interface LayoutClientProps {
  children: React.ReactNode;
}

function LayoutContent({ children }: LayoutClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const config = useQueryParamConfig();
  const { setTheme } = useTheme();

  const id = searchParams.get('id');
  const runId = searchParams.get('runId');
  const stepId = searchParams.get('stepId');
  const hookId = searchParams.get('hookId');
  const resource = searchParams.get('resource');
  const themeParam = searchParams.get('theme');
  const needsConfig = searchParams.get('needsConfig');

  // Track if we've already handled the initial navigation
  const hasNavigatedRef = useRef(false);
  const hasCheckedConfigRef = useRef(false);

  // Check config health
  const { data: configHealth, isLoading: isCheckingConfig } =
    useConfigHealth(config);

  // Sync theme from URL param to next-themes (one-time or when explicitly changed)
  useEffect(() => {
    if (
      themeParam &&
      (themeParam === 'light' ||
        themeParam === 'dark' ||
        themeParam === 'system')
    ) {
      setTheme(themeParam);
    }
  }, [themeParam, setTheme]);

  // Redirect to setup page if config is invalid
  // (Skip if already on setup page)
  useEffect(() => {
    if (pathname === '/setup') {
      return;
    }

    // Skip if we've already checked config
    if (hasCheckedConfigRef.current) {
      return;
    }

    // If CLI indicated config is needed, redirect immediately
    if (needsConfig === '1') {
      hasCheckedConfigRef.current = true;
      const setupUrl = buildUrlWithConfig('/setup', config, {
        needsConfig: '1',
        redirectTo: pathname,
      });
      router.replace(setupUrl);
      return;
    }

    // Wait for config health check to complete
    if (isCheckingConfig || !configHealth) {
      return;
    }

    // If config is invalid, redirect to setup
    if (!configHealth.valid) {
      hasCheckedConfigRef.current = true;
      const setupUrl = buildUrlWithConfig('/setup', config, {
        redirectTo: pathname,
      });
      router.replace(setupUrl);
      return;
    }

    // Config is valid - mark as checked
    hasCheckedConfigRef.current = true;
  }, [pathname, needsConfig, configHealth, isCheckingConfig, config, router]);

  // If initialized with a resource/id or direct ID params, we navigate to the appropriate page
  // Only run this logic once on mount or when we're on the root path with special params
  useEffect(() => {
    // Skip if we're not on the root path and we've already navigated
    if (pathname !== '/' && hasNavigatedRef.current) {
      return;
    }

    // Skip if we're on setup page
    if (pathname === '/setup') {
      return;
    }

    // Skip if we're already on a run page (prevents interference with back navigation)
    if (pathname.startsWith('/run/')) {
      hasNavigatedRef.current = true;
      return;
    }

    // Handle direct ID parameters (runId, stepId, hookId) without resource
    if (!resource) {
      if (runId) {
        // If we have a runId, open that run's detail view
        let targetUrl: string;
        if (stepId) {
          // Open run with step sidebar
          targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
            sidebar: 'step',
            stepId,
          });
        } else if (hookId) {
          // Open run with hook sidebar
          targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
            sidebar: 'hook',
            hookId,
          });
        } else {
          // Just open the run
          targetUrl = buildUrlWithConfig(`/run/${runId}`, config);
        }
        hasNavigatedRef.current = true;
        router.push(targetUrl);
        return;
      }
      // No resource and no direct params, nothing to do
      return;
    }

    // Handle resource-based navigation
    if (!id) {
      return;
    }

    let targetUrl: string;
    if (resource === 'run') {
      targetUrl = buildUrlWithConfig(`/run/${id}`, config);
    } else if (resource === 'step' && runId) {
      targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
        sidebar: 'step',
        stepId: id,
      });
    } else if (resource === 'stream' && runId) {
      targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
        sidebar: 'stream',
        streamId: id,
      });
    } else if (resource === 'event' && runId) {
      targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
        sidebar: 'event',
        eventId: id,
      });
    } else if (resource === 'hook' && runId) {
      targetUrl = buildUrlWithConfig(`/run/${runId}`, config, {
        sidebar: 'hook',
        hookId: id,
      });
    } else if (resource === 'hook' && !runId) {
      // Hook without runId - go to home page with hook sidebar
      targetUrl = buildUrlWithConfig('/', config, {
        sidebar: 'hook',
        hookId: id,
      });
    } else {
      console.warn(`Can't deep-link to ${resource} ${id}.`);
      return;
    }

    hasNavigatedRef.current = true;
    router.push(targetUrl);
  }, [resource, id, runId, stepId, hookId, router, config, pathname]);

  // Show loading state while checking config (but not for setup page)
  if (
    pathname !== '/setup' &&
    !hasCheckedConfigRef.current &&
    isCheckingConfig
  ) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Setup page renders without the main app header/chrome
  if (pathname === '/setup') {
    return (
      <TooltipProvider delayDuration={0}>
        {children}
        <Toaster />
      </TooltipProvider>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TooltipProvider delayDuration={0}>
        {/* Sticky Header */}
        <div className="sticky top-0 z-50 bg-background border-b px-6 py-4">
          <div className="flex items-center justify-between w-full">
            <Link href={buildUrlWithConfig('/', config)}>
              <h1
                className="flex items-center gap-2"
                title="Workflow Observability"
              >
                <Logo />
              </h1>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <ConnectionStatus config={config} />
              <SettingsDropdown />
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 px-6 pt-6">{children}</div>
      </TooltipProvider>
      <Toaster />
    </div>
  );
}

export function LayoutClient({ children }: LayoutClientProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="workflow-theme"
    >
      <LayoutContent>{children}</LayoutContent>
    </ThemeProvider>
  );
}
