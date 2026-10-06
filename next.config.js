/** @type {import('next').NextConfig} */
const path = require("path");
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

const nextConfig = {
  output: "standalone",
  // Keep the PDF parser's worker beside its installed module in server builds.
  serverExternalPackages: ['pdf-parse'],
  outputFileTracingIncludes: {
    '/api/planner-assistant/document': ['./node_modules/pdf-parse/**/pdf.worker*.mjs'],
  },

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
