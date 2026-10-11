/** @type {import('next').NextConfig} */
const nextConfig = {
  // The game script mounts once per page load; strict mode's double effects would start it twice.
  reactStrictMode: false,
};
export default nextConfig;
