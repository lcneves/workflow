'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Installer } from '@/components/geistdocs/installer';

interface CliInstallTabsProps {
  packageName: string;
}

export function CliInstallTabs({ packageName }: CliInstallTabsProps) {
  const commands = {
    npm: `npm install ${packageName}`,
    pnpm: `pnpm add ${packageName}`,
    yarn: `yarn add ${packageName}`,
    bun: `bun add ${packageName}`,
  };

  return (
    <Tabs defaultValue="npm" className="w-full">
      <TabsList>
        <TabsTrigger value="npm">npm</TabsTrigger>
        <TabsTrigger value="pnpm">pnpm</TabsTrigger>
        <TabsTrigger value="yarn">yarn</TabsTrigger>
        <TabsTrigger value="bun">bun</TabsTrigger>
      </TabsList>
      <TabsContent value="npm">
        <Installer command={commands.npm} />
      </TabsContent>
      <TabsContent value="pnpm">
        <Installer command={commands.pnpm} />
      </TabsContent>
      <TabsContent value="yarn">
        <Installer command={commands.yarn} />
      </TabsContent>
      <TabsContent value="bun">
        <Installer command={commands.bun} />
      </TabsContent>
    </Tabs>
  );
}
