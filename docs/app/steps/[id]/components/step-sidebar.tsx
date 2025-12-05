import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import type { StepCategory } from '../../steps-data';

interface StepSidebarProps {
  category: StepCategory;
  integration?: {
    name: string;
    icon: string;
  };
  author: string;
  dependenciesCount: number;
  relatedLinks?: Array<{
    title: string;
    href: string;
    icon?: 'document' | 'lightning';
  }>;
}

export function StepSidebar({
  category,
  integration,
  author,
  dependenciesCount,
  relatedLinks = [],
}: StepSidebarProps) {
  return (
    <aside className="space-y-6">
      <div>
        <h3 className="mb-4 text-sm font-semibold">Details</h3>
        <div className="space-y-4 text-sm">
          <div>
            <div className="text-muted-foreground">Category</div>
            <div className="mt-1 font-medium">{category}</div>
          </div>
          {integration && (
            <div>
              <div className="text-muted-foreground">Integration</div>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex size-5 items-center justify-center rounded bg-muted">
                  <span className="text-xs font-bold">{integration.icon}</span>
                </div>
                <span className="font-medium">{integration.name}</span>
              </div>
            </div>
          )}
          <div>
            <div className="text-muted-foreground">Author</div>
            <div className="mt-1 font-medium">{author}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Dependencies</div>
            <div className="mt-1 font-medium">{dependenciesCount}</div>
          </div>
        </div>
      </div>

      {relatedLinks.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="mb-4 text-sm font-semibold">Related</h3>
            <div className="space-y-2 text-sm">
              {relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  {link.icon === 'document' ? (
                    <svg
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  )}
                  {link.title}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
