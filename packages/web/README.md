# @workflow/web

Full-featured Observability Web UI for [Workflow](https://useworkflow.dev/docs/observability).

This package provides a complete, ready-to-deploy Next.js application for viewing and managing your workflow runs, steps, hooks, and events.

## Usage

The UI is bundled with the Workflow CLI and can be launched with:

```bash
npx workflow inspect
```

## Self-Hosting

You can also self-host this UI by cloning the repository and deploying it like any other Next.js app.

### Environment Variables

For API calls to work, you'll need to set the same environment variables used by the Workflow CLI.
See `npx workflow inspect --help` for more information on available environment variables.

**Key environment variables:**

| Variable | Description |
|----------|-------------|
| `WORKFLOW_TARGET_WORLD` | The world backend to use (`local`, `vercel`, `postgres`, or a package name) |
| `WORKFLOW_LOCAL_DATA_DIR` | Path to the local workflow data directory |
| `WORKFLOW_VERCEL_AUTH_TOKEN` | Vercel API token for remote access |
| `WORKFLOW_VERCEL_PROJECT` | Vercel project ID |
| `WORKFLOW_VERCEL_TEAM` | Vercel team ID |
| `WORKFLOW_VERCEL_ENV` | Vercel environment (`production`, `preview`, `development`) |
| `WORKFLOW_POSTGRES_URL` | PostgreSQL connection URL |

### Self-Hosting Mode

When deploying to production, you can enable **self-hosting mode** by setting:

```bash
WORKFLOW_UI_SELF_HOSTING=1
```

In self-hosting mode:

- **Security**: Client-provided environment variables are ignored. All configuration is read from server-side environment variables only, preventing users from accessing unauthorized data.
- **Simplified UI**: The project selection screen is hidden since configuration is server-managed.
- **Info indicator**: A small tooltip icon appears in the bottom-right corner explaining that the app is running in self-hosted mode.

This is recommended for production deployments where you want to lock down the configuration and prevent users from changing which data source the UI connects to.

### Deploying to Vercel

If deploying to Vercel, setting `WORKFLOW_TARGET_WORLD=vercel` is usually enough to infer other project details from Vercel's environment variables. Note that observability will be scoped to the project and environment you're deploying to.

For a locked-down production deployment:

```bash
WORKFLOW_TARGET_WORLD=vercel
WORKFLOW_UI_SELF_HOSTING=1
```

## Related Packages

- [`@workflow/web-shared`](../web-shared/README.md) - If you want to embed observability components in your own Next.js app instead of deploying this full UI.
