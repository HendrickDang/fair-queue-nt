import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "NT Housing Triage",
  description:
    "Maintenance triage for remote Northern Territory housing that makes the equity/efficiency trade-off visible and human-owned.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(7,11,20,0.85)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-slate-950">
                NT
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
                className="rounded-lg px-3 py-1.5 text-[var(--muted)] transition hover:bg-[var(--panel-2)] hover:text-white"
              >
                Coordinator
              </Link>
              <Link
                href="/tenant"
                className="rounded-lg px-3 py-1.5 text-[var(--muted)] transition hover:bg-[var(--panel-2)] hover:text-white"
              >
                Tenant answer
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
