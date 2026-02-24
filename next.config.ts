import type { NextConfig } from "next";
const withPWA = require('next-pwa');
const appVersion = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || 'dev').slice(0, 7);

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {},
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
})(nextConfig);
