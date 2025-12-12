import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface Dependency {
  name: string;
  url?: string;
}

interface DependenciesSectionProps {
  dependencies: Dependency[];
}

export function DependenciesSection({
  dependencies,
}: DependenciesSectionProps) {
  if (dependencies.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Dependencies</h2>
      <div className="flex flex-wrap gap-2">
        {dependencies.map((dep) =>
          dep.url ? (
            <Link
              key={dep.name}
              href={dep.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group"
            >
              <Badge
                variant="secondary"
                className="gap-1.5 px-3 py-1.5 text-sm transition-colors hover:bg-primary/10"
              >
                <span className="font-mono">{dep.name}</span>
                <ExternalLink className="size-3 opacity-50 transition-opacity group-hover:opacity-100" />
              </Badge>
            </Link>
          ) : (
            <Badge
              key={dep.name}
              variant="secondary"
              className="px-3 py-1.5 text-sm"
            >
              <span className="font-mono">{dep.name}</span>
            </Badge>
          )
        )}
      </div>
    </div>
  );
}
