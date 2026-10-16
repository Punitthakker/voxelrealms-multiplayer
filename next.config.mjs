/** @type {import('next').NextConfig} */
const nextConfig = {
  // The game scripts mount once per page load; strict mode's double effects would start them twice.
  reactStrictMode: false,
  // Lets several dev servers run side by side in one checkout (tests): NEXT_DIST_DIR=.next-a npm run dev
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
export default nextConfig;
