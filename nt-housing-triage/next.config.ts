import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The parser talks to a local Ollama instance over HTTP; keep it explicit
  // so the app still builds/runs with zero network access (fallback parser).
  reactStrictMode: true,
  // Allow accessing the dev server through a tunnel (e.g. a cloudflared quick
  // tunnel). Without this, Next blocks cross-origin dev resources like
  // /_next/hmr, so the client never hydrates and the UI stays non-interactive.
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.loca.lt"],
  // Ship the SQLite schema next to the server bundle so the db layer can read it.
  outputFileTracingIncludes: {
    "/**/*": ["./lib/db/schema.sql"],
  },
};

export default nextConfig;
