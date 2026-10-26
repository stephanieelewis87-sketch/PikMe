import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Database drivers load native/wasm files at runtime, so don't bundle them.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
};

export default nextConfig;
