import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libsql ships native bindings for local file databases; keep it out of the bundle.
  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;
