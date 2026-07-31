/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },

  experimental: {
    // Turbopack's on-disk dev cache (default: true) is an LSM tree that
    // compacts when the dev server opens it. Left alone it accumulates one
    // generation per dev-server start; this project reached 4,489 generations
    // / 685 MB / 955k keys, at which point every `next dev` rewrote ~380 MB of
    // sorted-string tables on startup and pinned disk, CPU and memory.
    //
    // Keeping it enabled is worth it for warm restarts. If startup starts
    // hurting again, first check the size:
    //   du -sh .next/dev/cache/turbopack
    // Wipe `.next` if it is back in the hundreds of MB (`pnpm dev:fresh`), or
    // flip this to `false` to trade warm-restart speed for a cache that can
    // never grow.
    turbopackFileSystemCacheForDev: true,
  },
}

export default nextConfig
