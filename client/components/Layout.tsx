import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Chip } from "@heroui/chip";
import { Tooltip } from "@heroui/tooltip";
import { useSensorStore } from "@/lib/store/sensor-store";

interface Props {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
  { href: "/bills", label: "Bills" },
];

export default function Layout({ title = "Flowsense Monitor", description = "Real-time water flow & pressure monitoring", children }: Props) {
  const router = useRouter();
  const { connected, lastSeen } = useSensorStore();

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* Animated background */}
      <div className="bg-animated" aria-hidden />

      <div className="min-h-screen flex flex-col">
        {/* ── Navbar ──────────────────────────────────────────────────────── */}
        <nav className="sticky top-0 z-40 w-full glass-card rounded-none border-x-0 border-t-0 px-6 py-3 flex items-center justify-between">
          {/* Left: Logo + nav links */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 14a7 7 0 11-14 0c0-4.418 5-10 7-10s7 5.582 7 10z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-none">Flowsense</p>
                <p className="text-[10px] text-blue-300/60 leading-none mt-0.5">Water Flow Monitor</p>
              </div>
            </div>

            {/* Nav links */}
            <div className="hidden sm:flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const active = router.pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      active
                        ? "bg-blue-600/30 text-blue-200"
                        : "text-blue-300/60 hover:text-blue-200 hover:bg-blue-600/15"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right: last update + live chip */}
          <div className="flex items-center gap-3">
            {lastSeen && (
              <span className="text-xs text-blue-200/50 hidden md:block">
                Updated {new Date(lastSeen).toLocaleTimeString()}
              </span>
            )}
            <Tooltip content={connected ? "Receiving live data" : "No connection to server"} placement="bottom">
              <Chip
                size="sm"
                variant="flat"
                color={connected ? "success" : "danger"}
                startContent={
                  <span className={`w-2 h-2 rounded-full inline-block ${connected ? "bg-green-400 dot-live" : "bg-red-400"}`} />
                }
              >
                {connected ? "Live" : "Offline"}
              </Chip>
            </Tooltip>
          </div>
        </nav>

        {/* ── Page content ─────────────────────────────────────────────────── */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
          {children}
        </main>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="text-center py-4 text-[11px] text-blue-200/30">
          Flowsense Water Monitoring System · Thesis 2026
        </footer>
      </div>
    </>
  );
}
