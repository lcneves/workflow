'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CodeExampleProps {
  codeHtml: string;
  stepId: string;
}

export function CodeExample({ codeHtml, stepId }: CodeExampleProps) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">Code</h2>
      <Tabs defaultValue="code" className="w-full">
        <TabsList>
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="code" className="mt-0">
          <div
            className="overflow-auto border text-sm py-6 [&_pre]:!bg-transparent"
            dangerouslySetInnerHTML={{ __html: codeHtml }}
          />
          <div className="mt-2 text-right text-xs text-muted-foreground">
            steps/{stepId}
          </div>
        </TabsContent>
        <TabsContent value="usage" className="mt-0">
          <div className="rounded-lg border bg-muted/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Usage examples coming soon...
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
