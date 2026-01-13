# @workflow/web-shared

Workflow Observability components and hooks for Next.js. See [Workflow DevKit](https://useworkflow.dev/docs/observability) for more information.

## When to Use This Package

There are two ways to add Workflow observability to your application:

| Package | Use Case |
|---------|----------|
| [`@workflow/web`](../web/README.md) | **Full self-hosted UI** - A complete, ready-to-deploy Next.js application with project management, run listing, and detailed trace viewing. Best for standalone deployments or when you want the full observability experience. |
| `@workflow/web-shared` | **Embed in your app** - Hooks and components to surface workflow data in your existing Next.js application. Best when you want to integrate observability into an existing dashboard or custom UI. |

If you want a complete, standalone observability dashboard, see [`@workflow/web`](../web/README.md) which can be self-hosted with a single environment variable.

## Usage

This package provides both React hooks for fetching data and pre-styled components for displaying it.

### Fetching Data with Hooks

Use the hooks to create your own custom UI:

```tsx
import { useWorkflowRuns } from '@workflow/web-shared';

export default function MyRunsList() {
  // EnvMap contains the environment variables for your world configuration
  const env = {
    WORKFLOW_TARGET_WORLD: 'vercel',
    // ... other env vars as needed
  };

  const {
    data,
    error,
    nextPage,
    previousPage,
    hasNextPage,
    hasPreviousPage,
    reload,
    pageInfo,
  } = useWorkflowRuns(env, {
    sortOrder: 'desc',
    workflowName: undefined, // or filter by workflow name
    status: undefined, // or filter by status
  });

  const runs = data.data ?? [];

  return (
    <div>
      {runs.map((run) => (
        <div key={run.runId}>
          <span>{run.workflowName}</span>
          <span>{run.status}</span>
          <span>{run.startedAt}</span>
          <span>{run.completedAt}</span>
        </div>
      ))}
    </div>
  );
}
```

### Pre-Styled Components

Use the pre-styled trace viewer for a complete run detail experience:

```tsx
import { RunTraceView } from '@workflow/web-shared';

export default function MyRunDetailView({ runId }: { runId: string }) {
  const env = {
    WORKFLOW_TARGET_WORLD: 'vercel',
    // ... other env vars
  };

  // Shows an interactive trace viewer for the given run
  return <RunTraceView env={env} runId={runId} />;
}
```

## Environment Variables

For API calls to work, you need to pass the appropriate environment variables via the `EnvMap` parameter.
See `npx workflow inspect --help` for the full list of available variables.

Common configurations:

```tsx
// Local development
const env = {
  WORKFLOW_TARGET_WORLD: 'local',
  WORKFLOW_LOCAL_DATA_DIR: './.workflow',
};

// Vercel (auto-infers from Vercel environment)
const env = {
  WORKFLOW_TARGET_WORLD: 'vercel',
};

// PostgreSQL
const env = {
  WORKFLOW_TARGET_WORLD: 'postgres',
  WORKFLOW_POSTGRES_URL: process.env.DATABASE_URL,
};
```

**Important:** When using these components to inspect different worlds, all relevant environment variables should be passed via the `EnvMap` parameter rather than setting them directly on `process.env`. The server-side World caching is based on the `EnvMap` configuration, so setting environment variables directly may cause cached World instances to operate with incorrect configuration.

## Styling

For Tailwind CSS classes to work correctly, you may need to configure your Next.js app's CSS processor. If using PostCSS with Tailwind:

```js
// postcss.config.mjs
const config = {
  plugins: ['@tailwindcss/postcss'],
};

export default config;
```

You may also need to add this package to your Tailwind content configuration:

```js
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@workflow/web-shared/**/*.{js,ts,jsx,tsx}',
  ],
  // ...
};
```
