import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { codeToHtml } from 'shiki';
import { Separator } from '@/components/ui/separator';
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
    title: `${step.name} - Steps Marketplace`,
    description: step.description,
  };
}

export default async function StepDetailPage({ params }: StepPageProps) {
  const { id } = await params;
  const step = stepsData.find((s) => s.id === id);

  if (!step) {
    notFound();
  }

  // Generate example code
  const exampleCode = `import { FatalError } from 'workflow';

type SlackMessageParams = {
  channel: string;
  text: string;
  blocks?: any[];
};

export async function sendSlackMessage(params: SlackMessageParams) {
  'use step';

  const token = process.env.SLACK_BOT_TOKEN;

  if (!token) {
    throw new FatalError('SLACK_BOT_TOKEN is required');
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${token}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new FatalError(\`Slack API error: \${data.error}\`);
  }
}`;

  const codeHtml = await codeToHtml(exampleCode, {
    lang: 'typescript',
    themes: {
      light: 'github-light-default',
      dark: 'github-dark-default',
    },
    defaultColor: false,
  });

  // Step data configuration
  const environmentVariables = [
    {
      name: 'SLACK_BOT_TOKEN',
      description: 'Your Slack Bot User OAuth Token',
      required: true,
    },
  ];

  const dependencies = [
    {
      name: '@vercel/workflow',
      url: '/docs/getting-started',
    },
  ];

  const relatedLinks = [
    {
      title: 'AI Slackbot Agent',
      href: '#',
      icon: 'document' as const,
    },
    {
      title: 'AI Content Generation Pipeline',
      href: '#',
      icon: 'lightning' as const,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <StepBreadcrumb stepId={id} />

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-[1fr_300px]">
        {/* Main Content */}
        <div className="space-y-8">
          <StepHeader
            name={step.name}
            description={step.description}
            category={step.category}
            type={step.type}
            tags={['slack', 'messaging', 'notifications']}
          />

          <Separator />

          {/* Description */}
          <div>
            <p className="text-muted-foreground">
              This step integrates with Slack to send a message to a slack
              channel or user using the slack api. It provides a clean,
              type-safe interface for working with the Slack API within your
              Vercel Workflow.
            </p>
          </div>

          <CodeExample codeHtml={codeHtml} stepId={id} />

          <InstallationSection stepId={id} />

          <EnvironmentVariablesSection variables={environmentVariables} />

          <DependenciesSection dependencies={dependencies} />
        </div>

        {/* Sidebar */}
        <StepSidebar
          category={step.category}
          integration={{
            name: 'Slack',
            icon: 'S',
          }}
          author={step.author || 'Workflow Elements'}
          dependenciesCount={dependencies.length}
          relatedLinks={relatedLinks}
        />
      </div>
    </div>
  );
}
