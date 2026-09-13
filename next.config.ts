import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Workaround for next.js#96046 / #86178 / #86965: Next 16 on Windows
    // nondeterministically crashes the build while prerendering the internal
    // /_global-error and /_not-found pages ("Cannot read properties of null
    // (reading 'useContext')"). With early exit disabled, the remaining pages
    // still get generated and the build completes. Safe to remove once the
    // framework bug is fixed upstream.
    prerenderEarlyExit: false,
  },
};

export default nextConfig;
