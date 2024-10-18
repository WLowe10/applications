/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/lib/env.js");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
