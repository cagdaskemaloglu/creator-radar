import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir: process.env.RADAR_BUILD_DIR ?? '.next',
  serverExternalPackages: ['pg'],
  // Browser profiles, credentials and databases must never be packaged in build artifacts.
  outputFileTracingExcludes: { '/*': ['./data/**/*', './browser-profile/**/*', './.env*'] },
};
export default config;
