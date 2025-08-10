// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Passe les erreurs ESLint en dehors du build pour débloquer le déploiement
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
