/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/m/:id', destination: '/m/index.html' }];
  },
};
