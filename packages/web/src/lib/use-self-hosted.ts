'use client';

import { getSelfHostedStatus } from '@workflow/web-shared/server';
import useSWR from 'swr';

/**
 * Hook to check if the app is running in self-hosted mode.
 * Uses SWR for caching and revalidation.
 */
export function useSelfHostedStatus() {
  const { data, error, isLoading } = useSWR(
    'self-hosted-status',
    async () => {
      const result = await getSelfHostedStatus();
      if (result.success) {
        return result.data.isSelfHosted;
      }
      throw new Error('Failed to get self-hosted status');
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Cache indefinitely - this shouldn't change during a session
      dedupingInterval: 3600000, // 1 hour
    }
  );

  return {
    isSelfHosted: data ?? false,
    isLoading,
    error,
  };
}
