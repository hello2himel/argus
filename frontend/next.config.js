/** @type {import('next').NextConfig} */
const nextConfig = {
  // Netlify mirror (NEXT_STATIC_EXPORT=1): fully static HTML in out/.
  // Full-stack dev/docker: default server build.
  ...(process.env.NEXT_STATIC_EXPORT ? { output: "export" } : { output: "standalone" }),
};
module.exports = nextConfig;
