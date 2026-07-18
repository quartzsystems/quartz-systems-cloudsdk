/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export — no Node.js runtime on the appliance; the Rust backend
  // serves the exported assets directly.
  output: "export",
  // Skip the image optimizer server (nothing to run it on the appliance).
  images: { unoptimized: true },
  // Emit trailing-slash dirs so the backend's ServeDir resolves routes to
  // index.html.
  trailingSlash: true,
};

module.exports = nextConfig;
