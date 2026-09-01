import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["iron-session"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
      {
        protocol: "https",
        hostname: "mosaic.scdn.co",
      },
    ],
  },
};

export default nextConfig;
