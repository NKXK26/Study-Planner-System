/** @type {import('next').NextConfig} */
const path = require("path");
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

const nextConfig = {
  output: "standalone",
  // All browser APIs belong to this app. A build-time localhost URL otherwise
  // sends desktop traffic to the wrong server when port 3000 is already in use.
  env: { NEXT_PUBLIC_SERVER_URL: '' },
  // Keep the PDF parser's worker beside its installed module in server builds.
  serverExternalPackages: ['pdf-parse','@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/planner-assistant/document': ['./node_modules/pdf-parse/**/pdf.worker*.mjs','./node_modules/@napi-rs/canvas-*/icudtl.dat'],
    '/api/pdf-debug': ['./node_modules/pdf-parse/**/pdf.worker*.mjs','./node_modules/@napi-rs/canvas-*/icudtl.dat'],
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
