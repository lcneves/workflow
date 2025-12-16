'use client';

import useSWR from 'swr';
import {
  checkWorldsAvailability,
  checkConfigHealth,
  type WorldConfig,
} from './config-world';

export function useWorldsAvailability() {
  return useSWR('worlds-availability', checkWorldsAvailability, {
    revalidateOnFocus: false,
  });
}

export function useConfigHealth(config: WorldConfig) {
  // Create a stable key from config
  const configKey = JSON.stringify({
    backend: config.backend,
    dataDir: config.dataDir,
    postgresUrl: config.postgresUrl ? 'set' : undefined,
    authToken: config.authToken ? 'set' : undefined,
    project: config.project,
  });

  return useSWR(['config-health', configKey], () => checkConfigHealth(config), {
    revalidateOnFocus: false,
    // Don't retry on error - we want fast feedback
    shouldRetryOnError: false,
  });
}
