import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Database drivers load native/wasm files at runtime, so don't bundle them.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  // Room for a bill document (up to 4 MB) in the upload form.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
