import Link from 'next/link';

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
      <div className="rounded-lg border p-4">
        <div className="space-y-2">
          {dependencies.map((dep) => (
            <Link
              key={dep.name}
              href={dep.url || '#'}
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              {dep.name}
              <svg
                className="size-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
