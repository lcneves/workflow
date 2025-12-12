export type StepCategory =
  | 'AI Agents & Services'
  | 'AI'
  | 'Analytics'
  | 'Authentication'
  | 'CMS'
  | 'Commerce'
  | 'Database'
  | 'DevTools'
  | 'Experimentation'
  | 'Flags'
  | 'Logging'
  | 'Messaging'
  | 'Monitoring'
  | 'Observability'
  | 'Payments'
  | 'Productivity'
  | 'Searching'
  | 'Security'
  | 'Storage'
  | 'Testing'
  | 'Video'
  | 'Webhooks'
  | 'Workflow';

export type StepType = 'Native' | 'External';

export interface EnvVariable {
  name: string;
  description: string;
  required?: boolean;
  docsUrl?: string;
}

export interface Dependency {
  name: string;
  url: string;
}

export interface Integration {
  name: string;
  icon: string;
}

export interface Step {
  id: string;
  name: string;
  description: string;
  longDescription?: string; // Detailed description for the detail page
  category: StepCategory;
  type: StepType;
  featured?: boolean;
  author?: string;
  downloads?: number;
  icon?: string;
  tags?: string[];
  integration?: Integration;
  environmentVariables?: EnvVariable[];
  dependencies?: Dependency[];
}

export const stepsData: Step[] = [
  // AI Category
  {
    id: 'ai-chat',
    name: 'AI Chat',
    description:
      'Call LLMs with streaming, tool calling, and durable state management.',
    category: 'AI',
    type: 'Native',
    author: 'Vercel',
    downloads: 18000,
    tags: ['ai', 'llm', 'chat', 'streaming'],
    environmentVariables: [
      {
        name: 'OPENAI_API_KEY',
        description: 'Your OpenAI API key for authentication',
        required: true,
        docsUrl: 'https://platform.openai.com/api-keys',
      },
    ],
    dependencies: [
      {
        name: '@vercel/workflow',
        url: '/docs/getting-started',
      },
      {
        name: 'ai',
        url: 'https://sdk.vercel.ai',
      },
    ],
  },

  // Database Category
  {
    id: 'database-query',
    name: 'Database Query',
    description:
      'Execute database queries with connection pooling and retry logic.',
    category: 'Database',
    type: 'Native',
    author: 'Vercel',
    downloads: 11000,
    tags: ['database', 'sql', 'query', 'postgres'],
    environmentVariables: [
      {
        name: 'DATABASE_URL',
        description: 'PostgreSQL connection string',
        required: true,
        docsUrl: 'https://vercel.com/docs/storage/vercel-postgres/quickstart',
      },
      {
        name: 'DATABASE_API_URL',
        description: 'Database proxy API endpoint URL',
        required: false,
      },
      {
        name: 'DATABASE_API_KEY',
        description: 'API key for database proxy authentication',
        required: false,
      },
    ],
    dependencies: [
      {
        name: '@vercel/workflow',
        url: '/docs/getting-started',
      },
      {
        name: '@vercel/postgres',
        url: 'https://vercel.com/docs/storage/vercel-postgres',
      },
    ],
  },

  // Messaging Category
  {
    id: 'send-email',
    name: 'Send Email',
    description:
      'Send transactional emails via your email provider with delivery tracking.',
    category: 'Messaging',
    type: 'Native',
    author: 'Vercel',
    downloads: 12000,
    tags: ['email', 'messaging', 'notifications', 'transactional'],
    environmentVariables: [
      {
        name: 'EMAIL_API_KEY',
        description: 'API key for your email provider (Resend, SendGrid, etc.)',
        required: true,
        docsUrl: 'https://resend.com/docs/api-reference/api-keys',
      },
      {
        name: 'EMAIL_PROVIDER',
        description: 'Email provider to use (defaults to "resend")',
        required: false,
      },
      {
        name: 'EMAIL_FROM',
        description: 'Default sender email address',
        required: false,
      },
    ],
    dependencies: [
      {
        name: '@vercel/workflow',
        url: '/docs/getting-started',
      },
      {
        name: 'resend',
        url: 'https://resend.com/docs',
      },
    ],
  },
  {
    id: 'slack-message',
    name: 'Slack Message',
    description:
      'Send messages to Slack channels with rich formatting support.',
    longDescription:
      'This step integrates with Slack to send a message to a slack channel or user using the slack api. It provides a clean, type-safe interface for working with the Slack API within your Vercel Workflow.',
    category: 'Messaging',
    type: 'External',
    author: 'Community',
    downloads: 8900,
    tags: ['slack', 'messaging', 'notifications'],
    integration: {
      name: 'Slack',
      icon: 'S',
    },
    environmentVariables: [
      {
        name: 'SLACK_BOT_TOKEN',
        description: 'Your Slack Bot User OAuth Token',
        required: true,
        docsUrl: 'https://api.slack.com/authentication/token-types#bot',
      },
    ],
    dependencies: [
      {
        name: '@vercel/workflow',
        url: '/docs/getting-started',
      },
      {
        name: '@slack/web-api',
        url: 'https://slack.dev/node-slack-sdk/web-api',
      },
    ],
  },

  // Workflow Category
  {
    id: 'sleep',
    name: 'Sleep',
    description:
      'Pause workflow execution for a specified duration without consuming resources.',
    category: 'Workflow',
    type: 'Native',
    author: 'Vercel',
    downloads: 14000,
    tags: ['workflow', 'delay', 'sleep', 'timing'],
    dependencies: [
      {
        name: '@vercel/workflow',
        url: '/docs/getting-started',
      },
    ],
  },

  // Webhooks Category
  {
    id: 'webhook-listener',
    name: 'Webhook Listener',
    description:
      'Create durable webhooks that pause workflow execution until triggered.',
    category: 'Webhooks',
    type: 'Native',
    author: 'Vercel',
    downloads: 10000,
    tags: ['webhook', 'listener', 'callback', 'http'],
    dependencies: [
      {
        name: '@vercel/workflow',
        url: '/docs/getting-started',
      },
    ],
  },
  {
    id: 'create-webhook',
    name: 'Create Webhook',
    description: 'Create webhooks that pause workflow execution until called.',
    category: 'Webhooks',
    type: 'Native',
    author: 'Vercel',
    downloads: 9200,
    tags: ['webhook', 'create', 'callback', 'http'],
    dependencies: [
      {
        name: '@vercel/workflow',
        url: '/docs/getting-started',
      },
    ],
  },
];
