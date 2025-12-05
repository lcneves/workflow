import { Badge } from '@/components/ui/badge';

interface EnvVariable {
  name: string;
  description: string;
  required?: boolean;
}

interface EnvironmentVariablesSectionProps {
  variables: EnvVariable[];
}

export function EnvironmentVariablesSection({
  variables,
}: EnvironmentVariablesSectionProps) {
  if (variables.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Environment Variables</h2>
      <div className="rounded-lg border">
        {variables.map((variable, index) => (
          <div
            key={variable.name}
            className={`flex items-center justify-between p-4 ${
              index < variables.length - 1 ? 'border-b' : ''
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm font-medium">
                  {variable.name}
                </code>
                {variable.required && (
                  <Badge variant="destructive" className="text-xs">
                    Required
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {variable.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
