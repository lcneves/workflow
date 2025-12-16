'use client';

import { Settings, X } from 'lucide-react';
import { useState } from 'react';
import { ConfigForm } from '@/components/config-form';
import { Button } from '@/components/ui/button';
import { useQueryParamConfig, useUpdateConfigQueryParams } from '@/lib/config';
import type { WorldConfig } from '@/lib/config-world';
import { useWorldsAvailability } from '@/lib/hooks';

interface SettingsSidebarProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsSidebar({
  open: controlledOpen,
  onOpenChange,
}: SettingsSidebarProps = {}) {
  const config = useQueryParamConfig();
  const updateConfig = useUpdateConfigQueryParams();

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  const { data: worldsAvailability = [], isLoading: isLoadingWorlds } =
    useWorldsAvailability();

  const handleApply = (newConfig: WorldConfig) => {
    updateConfig(newConfig);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  return (
    <>
      {controlledOpen === undefined && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="p-2 rounded-full hover:bg-accent transition-colors"
          title="Configuration"
        >
          <Settings className="h-6 w-6" />
        </button>
      )}
      {isOpen && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            className="fixed inset-0 bg-black/50 z-40 cursor-default"
            onClick={() => setIsOpen(false)}
            aria-label="Close configuration panel"
          />

          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-96 bg-background border-l shadow-lg z-50 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Configuration</h2>
                <Button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  variant="outline"
                  size="icon"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <ConfigForm
                config={config}
                worldsAvailability={worldsAvailability}
                isLoadingWorlds={isLoadingWorlds}
                onApply={handleApply}
                onCancel={handleCancel}
                applyButtonText="Apply Configuration"
                cancelButtonText="Cancel"
                showCancel={true}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
