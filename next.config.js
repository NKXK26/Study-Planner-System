/** @type {import('next').NextConfig} */
const path = require("path");

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

module.exports = nextConfig;