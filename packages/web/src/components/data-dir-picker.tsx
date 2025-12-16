'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { findWorkflowDataDir, type DataDirCheckResult } from '@/lib/data-dir';

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

  // Validate directory when value changes (debounced)
  useEffect(() => {
    if (!value.trim()) {
      setCheckResult(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsCheckingDir(true);
      try {
        const result = await findWorkflowDataDir(value);
        setCheckResult(result);
      } catch {
        setCheckResult(null);
      } finally {
        setIsCheckingDir(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [value]);

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
          ✓ Found workflow data at: {checkResult.path}
        </p>
      )}
    </div>
  );
}
