import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone', experimental: { globalNotFound: true },
  // Emit resolved metadata in the initial head for every browser and crawler.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
