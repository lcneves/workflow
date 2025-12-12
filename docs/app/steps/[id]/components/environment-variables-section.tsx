'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface EnvVariable {
  name: string;
  description: string;
  required?: boolean;
  docsUrl?: string;
}

interface EnvironmentVariablesSectionProps {
  variables: EnvVariable[];
}

export function EnvironmentVariablesSection({
  variables,
}: EnvironmentVariablesSectionProps) {
  if (variables.length === 0) return null;

  // Generate .env file format
  const envFileContent = variables
    .map((variable) => {
      const comment = variable.description ? `# ${variable.description}` : '';
      return `${comment ? comment + '\n' : ''}${variable.name}=`;
    })
    .join('\n');

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Environment Variables</h2>

      <div className="space-y-3">
        {variables.map((variable) => (
          <div
            key={variable.name}
            className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 font-mono text-sm font-medium">
                    {variable.name}
                  </code>
                  {variable.required && (
                    <Badge variant="outline" className="text-xs">
                      Required
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {variable.description}
                </p>
                {variable.docsUrl && (
                  <Link
                    href={variable.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    View documentation
                    <ExternalLink className="size-3" />
                  </Link>
                )}
              </div>
              <CopyButton value={`${variable.name}=`} />
            </div>
          </div>
        ))}
      </div>

      <EnvFilePreview content={envFileContent} />
    </div>
  );
}

function EnvFilePreview({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="mt-4 rounded-lg border bg-muted/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          example env file
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 gap-1.5 px-2 text-xs"
        >
          {copied ? (
            <>
              <Check className="size-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3" />
              Copy all
            </>
          )}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded bg-background p-3 text-xs">
        <code>{content}</code>
      </pre>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8 px-2">
      {copied ? (
        <Check className="size-4 text-green-600" />
      ) : (
        <Copy className="size-4" />
      )}
    </Button>
  );
}
