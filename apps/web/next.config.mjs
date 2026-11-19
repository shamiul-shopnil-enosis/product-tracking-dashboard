// The browser only talks to the web origin; /api/* is proxied to the NestJS api.
// This keeps the auth cookie same-origin. API_INTERNAL_URL is read at build time.
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};
export default nextConfig;
