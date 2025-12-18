import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

const nextConfig: NextConfig = {
  /* config options here */
  rewrites: async () => {
    return [
      {
        source: '/.well-known/workflow/v1/:path*',
        destination: '/api/.well-known/workflow/v1/:path*',
      },
    ];
  },
};

export default withWorkflow(nextConfig);
