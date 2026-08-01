import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@dvcs/ui", "@dvcs/types", "@dvcs/permissions"],
};
export default nextConfig;
