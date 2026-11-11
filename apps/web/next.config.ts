import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Ẩn header X-Powered-By (không tiết lộ framework).
  poweredByHeader: false,
};

export default nextConfig;
