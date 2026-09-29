import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import Sidebar from "./Sidebar";
import TourGate from "@/components/onboarding/TourGate";
import Logo from "@/components/ui/Logo";

const hasNoLayout = (path: string) => path === "/login" || path.startsWith("/invite/");

/**
 * Syncs data-theme attribute on <html> so DaisyUI components respond to
 * next-themes class toggling (next-themes only sets class="dark", but DaisyUI
 * v5 also reads data-theme="dark").
 */
function DataThemeSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const root = document.documentElement;
    const isDark = resolvedTheme === "dark";
    root.setAttribute("data-theme", isDark ? "dark" : "light");
  }, [resolvedTheme]);
  return null;
}

export default function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();

  // Track collapsed state so <main> updates its left margin
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (hasNoLayout(router.pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-neutral-900 dark:text-neutral-100">
      <DataThemeSync />
      <TourGate />

      {/* Connect to your Sidebar's existing onCollapse prop */}
      <Sidebar onCollapse={(collapsed) => setIsCollapsed(collapsed)} />

      <header className="sticky top-0 z-20 flex h-16 items-center gap-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-black/90 px-4 backdrop-blur-sm md:hidden">
        <Logo />
      </header>

      {/* Dynamically update page margin when sidebar toggles */}
      <main
        className={`min-h-screen px-4 pb-28 pt-6 transition-all duration-300 md:px-10 md:pb-32 md:pt-9 ${isCollapsed ? "md:ml-[72px]" : "md:ml-[264px]"
          }`}
      >
        <div className="mx-auto w-full max-w-[1240px]">{children}</div>
      </main>
    </div>
  );
}