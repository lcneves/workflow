'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { type DataDirCheckResult, findWorkflowDataDir } from '@/lib/data-dir';
import { cn } from '@/lib/utils';

interface DataDirPickerProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  className?: string;
}

export function DataDirPicker({
  value,
  onChange,
  error,
  placeholder = '.workflow-data or .next/workflow-data',
  className,
}: DataDirPickerProps) {
  const [isCheckingDir, setIsCheckingDir] = useState(false);
  const [checkResult, setCheckResult] = useState<DataDirCheckResult | null>(
    null
  );
  const lastValidatedValue = useRef<string>('');

  // Validate directory when value changes (debounced)
  useEffect(() => {
    if (!value.trim()) {
      setCheckResult(null);
      return;
    }

    // Don't re-validate if we just updated to the resolved path
    if (value === lastValidatedValue.current) {
      return;
    }

    const timeout = setTimeout(async () => {
      setIsCheckingDir(true);
      try {
        const result = await findWorkflowDataDir(value);
        setCheckResult(result);

        // If valid workflow data found, update to the absolute path
        if (result.found && result.path && result.path !== value) {
          lastValidatedValue.current = result.path;
          onChange(result.path);
        }
      } catch {
        setCheckResult(null);
      } finally {
        setIsCheckingDir(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [value, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={cn('relative', className)}>
      <Input
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={cn(
          'font-mono text-sm',
          error && 'border-destructive',
          checkResult?.found && !error && 'border-green-500'
        )}
      />

      {/* Validation feedback */}
      {isCheckingDir && (
        <p className="mt-1 text-xs text-muted-foreground animate-pulse">
          Checking directory...
        </p>
      )}
      {!isCheckingDir &&
        checkResult &&
        !checkResult.found &&
        value &&
        !error && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            No workflow data found. Checked:{' '}
            {checkResult.checkedPaths.join(', ')}
          </p>
        )}
      {!isCheckingDir && checkResult?.found && !error && (
        <p className="mt-1 text-xs text-green-600 dark:text-green-400">
          ✓ Valid workflow data directory
          {checkResult.shortName && (
            <span className="ml-1 text-muted-foreground">
              ({checkResult.shortName})
            </span>
          )}
        </p>
      )}
    </div>
  );
}
