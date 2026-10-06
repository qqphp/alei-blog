import type { NextConfig } from 'next';

const nextConfig: NextConfig = { output: 'standalone', experimental: { globalNotFound: true } };

export default nextConfig;
