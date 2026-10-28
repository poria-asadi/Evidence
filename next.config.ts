import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Vinext applies the Server Action body limit while dispatching App Router
    // requests, including multipart route-handler uploads. Keep this above the
    // app's 30 MB per-file limit to allow for multipart framing overhead.
    serverActions: {
      bodySizeLimit: '34mb',
    },
  },
};

export default nextConfig;
