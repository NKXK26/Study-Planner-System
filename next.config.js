/** @type {import('next').NextConfig} */
const path = require("path");
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

const nextConfig = {
  output: "standalone",

  outputFileTracingRoot: path.join(__dirname),

  images: {
    unoptimized: true,
  },

  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
    };

    if (isServer) {
      config.externals.push("@prisma/client", "prisma");
    }

    return config;
  },
};

// Keep a running dev server isolated from production builds (including Electron).
module.exports = (phase) => ({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});
