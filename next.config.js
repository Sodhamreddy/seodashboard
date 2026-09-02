/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },

  experimental: {
    // Recharts is by far the largest dependency here. Optimising its imports
    // measurably reduces first-visit compile time in `next dev`.
    optimizePackageImports: ['recharts'],
  },

  /*
   * `next dev` and `next build` both write to `.next` by default, so running a
   * production build while a dev server is live deletes the webpack chunks the
   * dev runtime still holds open — the dev server then dies with
   * "Cannot find module './948.js'".
   *
   * So dev and production get separate directories, keyed off NODE_ENV,
   * which Next sets before loading this file (`dev` = development,
   * `build`/`start` = production). Override with NEXT_DIST_DIR if needed.
   */
  distDir:
    process.env.NEXT_DIST_DIR ||
    (process.env.NODE_ENV === 'production' ? '.next-prod' : '.next'),
};

module.exports = nextConfig;
