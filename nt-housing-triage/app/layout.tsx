import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import ThemeToggle from "./components/ThemeToggle";

export const metadata: Metadata = {
  title: "NT Housing Triage",
  description:
    "Maintenance triage for remote Northern Territory housing that makes the equity/efficiency trade-off visible and human-owned.",
};

/**
 * Runs before first paint so the correct theme is applied without a flash.
 * Order: an explicit past choice, otherwise the system preference.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--header-bg)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-slate-950">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <path d="M9 22V12h6v10" />
                </svg>
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-semibold">Housing Maintenance Triage</span>
                <span className="block text-[11px] text-[var(--muted)]">
                  Remote NT · equity-aware queue
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-lg px-3 py-1.5 text-[var(--muted)] transition hover:bg-[var(--panel-2)] hover:text-[var(--fg-strong)]"
              >
                Coordinator
              </Link>
              <Link
                href="/tenant"
                className="rounded-lg px-3 py-1.5 text-[var(--muted)] transition hover:bg-[var(--panel-2)] hover:text-[var(--fg-strong)]"
              >
                Tenant answer
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
