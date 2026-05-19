/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.hermes.com',
      },
      {
        protocol: 'https',
        hostname: 'assets.hermes.com',
      },
    ],
  },
};

module.exports = nextConfig;
