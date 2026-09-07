import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets local verification avoid a locked shared .next directory without
  // changing the normal deployment output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
