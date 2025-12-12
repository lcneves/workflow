import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { codeToHtml } from 'shiki';
import { Separator } from '@/components/ui/separator';
import { loadStepCode } from '../directory';
import { stepsData } from '../steps-data';
import { CodeExample } from './components/code-example';
import { DependenciesSection } from './components/dependencies-section';
import { EnvironmentVariablesSection } from './components/environment-variables-section';
import { InstallationSection } from './components/installation-section';
import { StepBreadcrumb } from './components/step-breadcrumb';
import { StepHeader } from './components/step-header';
import { StepSidebar } from './components/step-sidebar';

interface StepPageProps {
  params: {
    id: string;
  };
}

export async function generateStaticParams() {
  return stepsData.map((step) => ({
    id: step.id,
  }));
}

export async function generateMetadata({
  params,
}: StepPageProps): Promise<Metadata> {
  const { id } = await params;
  const step = stepsData.find((s) => s.id === id);

  if (!step) {
    return {
      title: 'Step Not Found',
    };
  }

  return {
    title: `${step.name} - Steps Registry`,
    description: step.description,
  };
}

export default async function StepDetailPage({ params }: StepPageProps) {
  const { id } = await params;
  const step = stepsData.find((s) => s.id === id);

  if (!step) {
    notFound();
  }

  // Load step code from directory
  const exampleCode = await loadStepCode(id);

  // Generate syntax highlighted HTML
  const codeHtml = await codeToHtml(exampleCode, {
    lang: 'typescript',
    themes: {
      light: 'github-light-default',
      dark: 'github-dark-default',
    },
    defaultColor: false,
  });

  // Use step data or fallback to defaults
  const environmentVariables = step.environmentVariables || [];
  const dependencies = step.dependencies || [
    {
      name: '@vercel/workflow',
      url: '/docs/getting-started',
    },
  ];
  const tags = step.tags || [];
  const integration = step.integration;
  const longDescription = step.longDescription || step.description;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-6">
        <div className="py-6">
          <StepBreadcrumb stepId={id} />
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 pb-8 lg:grid-cols-[1fr_300px]">
        {/* Main Content */}
        <div className="space-y-8">
          <StepHeader
            name={step.name}
            description={step.description}
            category={step.category}
            type={step.type}
            tags={tags}
          />

          <Separator />

          {/* Long Description */}
          {longDescription && (
            <div>
              <p className="text-muted-foreground">{longDescription}</p>
            </div>
          )}

          <CodeExample codeHtml={codeHtml} stepId={id} />

          <InstallationSection stepId={id} />

          <EnvironmentVariablesSection variables={environmentVariables} />

          <DependenciesSection dependencies={dependencies} />
        </div>

        {/* Sidebar */}
        <StepSidebar
          category={step.category}
          integration={integration}
          author={step.author || 'Workflow Elements'}
          dependenciesCount={dependencies.length}
          // relatedLinks={relatedLinks}
        />
      </div>
    </div>
  );
}
