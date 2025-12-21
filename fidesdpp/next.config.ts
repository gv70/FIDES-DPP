import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL('https://raw.githubusercontent.com/dedotdev/typink/refs/heads/main/assets/typink/**')],
  },
  
  // Standalone output for Docker deployment
  output: 'standalone',

  webpack: (config) => {
    // Workaround for a minifier output issue in server bundles where some dependencies
    // can produce invalid octal escape sequences in template literals.
    config.optimization = config.optimization || {};
    config.optimization.minimize = false;
    return config;
  },
};

export default nextConfig;
