export type StepCategory =
  | 'AI'
  | 'Storage'
  | 'Authentication'
  | 'Messaging'
  | 'Data Processing'
  | 'External Services'
  | 'Utilities'
  | 'Webhooks';

export type StepType = 'Native' | 'External';

export interface Step {
  id: string;
  name: string;
  description: string;
  category: StepCategory;
  type: StepType;
  featured?: boolean;
  author?: string;
  downloads?: number;
  icon?: string;
}

export const stepsData: Step[] = [
  // Featured Steps
  {
    id: 'fetch-data',
    name: 'Fetch Data',
    description:
      'Make HTTP requests with automatic retries and timeout handling.',
    category: 'External Services',
    type: 'Native',
    featured: true,
    author: 'Vercel',
    downloads: 15000,
  },
  {
    id: 'send-email',
    name: 'Send Email',
    description:
      'Send transactional emails via your email provider with delivery tracking.',
    category: 'Messaging',
    type: 'Native',
    featured: true,
    author: 'Vercel',
    downloads: 12000,
  },
  {
    id: 'webhook-listener',
    name: 'Webhook Listener',
    description:
      'Create durable webhooks that pause workflow execution until triggered.',
    category: 'Webhooks',
    type: 'Native',
    featured: true,
    author: 'Vercel',
    downloads: 10000,
  },
  {
    id: 'ai-chat',
    name: 'AI Chat',
    description:
      'Call LLMs with streaming, tool calling, and durable state management.',
    category: 'AI',
    type: 'Native',
    featured: true,
    author: 'Vercel',
    downloads: 18000,
  },

  // AI Category
  {
    id: 'stream-text',
    name: 'Stream Text',
    description:
      'Stream LLM responses with resumable streams that survive restarts.',
    category: 'AI',
    type: 'Native',
    author: 'Vercel',
    downloads: 8500,
  },
  {
    id: 'tool-execution',
    name: 'Tool Execution',
    description: 'Execute AI tools as durable steps with automatic retries.',
    category: 'AI',
    type: 'Native',
    author: 'Vercel',
    downloads: 7200,
  },
  {
    id: 'embedding-generator',
    name: 'Generate Embeddings',
    description: 'Generate vector embeddings for text with batching support.',
    category: 'AI',
    type: 'Native',
    author: 'Vercel',
    downloads: 6500,
  },

  // Storage Category
  {
    id: 'upload-file',
    name: 'Upload File',
    description:
      'Upload files to cloud storage with progress tracking and resumption.',
    category: 'Storage',
    type: 'Native',
    author: 'Vercel',
    downloads: 9000,
  },
  {
    id: 'database-query',
    name: 'Database Query',
    description:
      'Execute database queries with connection pooling and retry logic.',
    category: 'Storage',
    type: 'Native',
    author: 'Vercel',
    downloads: 11000,
  },
  {
    id: 'blob-storage',
    name: 'Blob Storage',
    description:
      'Store and retrieve blobs from Vercel Blob with automatic cleanup.',
    category: 'Storage',
    type: 'Native',
    author: 'Vercel',
    downloads: 7800,
  },

  // Authentication Category
  {
    id: 'verify-token',
    name: 'Verify Token',
    description: 'Verify JWT tokens and authentication credentials securely.',
    category: 'Authentication',
    type: 'Native',
    author: 'Vercel',
    downloads: 8200,
  },
  {
    id: 'oauth-flow',
    name: 'OAuth Flow',
    description: 'Handle OAuth authentication flows with state management.',
    category: 'Authentication',
    type: 'External',
    author: 'Community',
    downloads: 5400,
  },

  // Messaging Category
  {
    id: 'send-sms',
    name: 'Send SMS',
    description: 'Send SMS messages via Twilio with delivery confirmation.',
    category: 'Messaging',
    type: 'External',
    author: 'Community',
    downloads: 4200,
  },
  {
    id: 'push-notification',
    name: 'Push Notification',
    description: 'Send push notifications to mobile and web clients.',
    category: 'Messaging',
    type: 'External',
    author: 'Community',
    downloads: 6100,
  },
  {
    id: 'slack-message',
    name: 'Slack Message',
    description:
      'Send messages to Slack channels with rich formatting support.',
    category: 'Messaging',
    type: 'External',
    author: 'Community',
    downloads: 8900,
  },

  // Data Processing Category
  {
    id: 'transform-data',
    name: 'Transform Data',
    description:
      'Transform data between formats with validation and error handling.',
    category: 'Data Processing',
    type: 'Native',
    author: 'Vercel',
    downloads: 5600,
  },
  {
    id: 'validate-input',
    name: 'Validate Input',
    description:
      'Validate input data against schemas with detailed error messages.',
    category: 'Data Processing',
    type: 'Native',
    author: 'Vercel',
    downloads: 7400,
  },
  {
    id: 'csv-parser',
    name: 'CSV Parser',
    description: 'Parse CSV files with streaming support for large datasets.',
    category: 'Data Processing',
    type: 'External',
    author: 'Community',
    downloads: 3800,
  },

  // External Services Category
  {
    id: 'stripe-payment',
    name: 'Stripe Payment',
    description: 'Process payments with Stripe with webhook verification.',
    category: 'External Services',
    type: 'External',
    author: 'Community',
    downloads: 9800,
  },
  {
    id: 'github-api',
    name: 'GitHub API',
    description:
      'Interact with GitHub API for repository and workflow operations.',
    category: 'External Services',
    type: 'External',
    author: 'Community',
    downloads: 4500,
  },
  {
    id: 'vercel-deploy',
    name: 'Vercel Deploy',
    description: 'Trigger and monitor Vercel deployments programmatically.',
    category: 'External Services',
    type: 'Native',
    author: 'Vercel',
    downloads: 6700,
  },

  // Utilities Category
  {
    id: 'sleep',
    name: 'Sleep',
    description:
      'Pause workflow execution for a specified duration without consuming resources.',
    category: 'Utilities',
    type: 'Native',
    author: 'Vercel',
    downloads: 14000,
  },
  {
    id: 'retry-with-backoff',
    name: 'Retry with Backoff',
    description: 'Retry operations with exponential backoff and jitter.',
    category: 'Utilities',
    type: 'Native',
    author: 'Vercel',
    downloads: 8100,
  },
  {
    id: 'rate-limiter',
    name: 'Rate Limiter',
    description: 'Implement rate limiting for API calls and resource usage.',
    category: 'Utilities',
    type: 'External',
    author: 'Community',
    downloads: 5900,
  },

  // Webhooks Category
  {
    id: 'create-webhook',
    name: 'Create Webhook',
    description: 'Create webhooks that pause workflow execution until called.',
    category: 'Webhooks',
    type: 'Native',
    author: 'Vercel',
    downloads: 9200,
  },
  {
    id: 'webhook-verifier',
    name: 'Webhook Verifier',
    description: 'Verify webhook signatures from popular services.',
    category: 'Webhooks',
    type: 'External',
    author: 'Community',
    downloads: 4800,
  },
];
