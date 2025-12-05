import { CliInstallTabs } from '@/components/cli-install-tabs';

interface InstallationSectionProps {
  stepId: string;
}

export function InstallationSection({ stepId }: InstallationSectionProps) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Installation</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Run the following command to install{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          {stepId}.tsx
        </code>
      </p>
      <CliInstallTabs packageName={`@workflow/${stepId}`} />
    </div>
  );
}
