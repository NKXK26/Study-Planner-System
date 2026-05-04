/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  output: "standalone",

  images: {
    unoptimized: true,
  },

  experimental: {
    outputFileTracingRoot: path.join(__dirname),
  },

  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
    };

    // Important for Prisma in Electron
    if (isServer) {
      config.externals.push("@prisma/client", "prisma");
    }

    return config;
  },
};

module.exports = nextConfig;