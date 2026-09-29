import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
  RiArrowUpCircleLine,
  RiBuildingLine,
  RiCheckboxCircleLine,
  RiCompassLine,
  RiContactsLine,
  RiFileList3Line,
  RiFireLine,
  RiFlowChart,
  RiInboxLine,
  RiLayoutGridLine,
  RiLogoutBoxLine,
  RiMailCheckLine,
  RiPlayCircleLine,
  RiQuestionLine,
  RiSettings4Line,
  RiStackLine,
  RiMenuLine,
  RiCloseLine,
  RiShieldUserLine,
  RiMenuFoldLine,
  RiMenuUnfoldLine,
} from "react-icons/ri";
import { pathToTourPage, replayPageTour } from "@/lib/tour";
import Logo from "@/components/ui/Logo";
import ThemeToggle from "@/components/ui/ThemeToggle";

const LEARNING_PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLBf6xNJOmsIQ";

const workspaceNav = [
  { href: "/", label: "Overview", icon: RiLayoutGridLine, tour: "nav-dashboard" },
  { href: "/inbox", label: "Inbox", icon: RiInboxLine, tour: "nav-inbox" },
  { href: "/todos", label: "Tasks", icon: RiCheckboxCircleLine, tour: "nav-todos", premium: true },
];

const growthNav = [
  { href: "/lists", label: "Lists", icon: RiFileList3Line, tour: "nav-lists" },
  { href: "/contacts", label: "People", icon: RiContactsLine, tour: "nav-contacts" },
  { href: "/companies", label: "Companies", icon: RiBuildingLine, tour: "nav-companies" },
  { href: "/workflows", label: "Campaigns", icon: RiFlowChart, tour: "nav-workflows" },
];

const systemNav = [
  { href: "/warmup", label: "Warmup", icon: RiFireLine, tour: "nav-warmup" },
  { href: "/email-health", label: "Deliverability", icon: RiMailCheckLine, tour: "nav-email-health" },
  { href: "/platform", label: "Platform", icon: RiStackLine, tour: "nav-platform" },
];

const adminNav = [
  { href: "/admin", label: "Platform admin", icon: RiShieldUserLine, tour: "nav-admin" },
];

const mobilePrimary = [workspaceNav[0], workspaceNav[1], growthNav[3], growthNav[0]];

export const SIDEBAR_WIDTH_EXPANDED = 264;
export const SIDEBAR_WIDTH_COLLAPSED = 72;

type NavItem = (typeof workspaceNav)[number] | (typeof growthNav)[number] | (typeof systemNav)[number] | (typeof adminNav)[number];

function initials(value?: string | null) {
  if (!value) return "LK";
  return value.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export default function Sidebar({ onCollapse }: { onCollapse?: (collapsed: boolean) => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const isSuperadmin = Boolean(session?.user?.isSuperadmin);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hasCrm, setHasCrm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Collapse state & persistent memory
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved !== null) {
      const state = saved === "true";
      setIsCollapsed(state);
      onCollapse?.(state);
    } else {
      onCollapse?.(false);
    }
  }, [onCollapse]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      onCollapse?.(next);
      return next;
    });
  };

  const helpRef = useRef<HTMLDivElement>(null);
  const tourPage = pathToTourPage(router.pathname);

  useEffect(() => { setMenuOpen(false); }, [router.pathname]);

  useEffect(() => {
    if (!helpOpen) return;
    function onClick(event: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) setHelpOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [helpOpen]);

  useEffect(() => {
    fetch("/api/premium-status").then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data) setHasCrm(Boolean(data.capabilities?.crm)); }).catch(() => { });
    fetch("/api/system/update").then((response) => response.json()).then((data) => {
      setCurrentVersion(data.current ?? null);
      setUpdateAvailable(Boolean(data.updateAvailable));
      setLatestVersion(data.latest ?? null);
    }).catch(() => { });
  }, []);

  function isActive(href: string) {
    if (href === "/") return router.pathname === "/";
    if (href === "/settings") return ["/settings", "/accounts"].some((path) => router.pathname.startsWith(path));
    return router.pathname.startsWith(href);
  }

  function NavLink({ item }: { item: NavItem }) {
    const active = isActive(item.href);
    if ("premium" in item && item.premium && !hasCrm) return null;
    return (
      <Link
        href={item.href}
        data-tour={item.tour}
        title={isCollapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={`group relative flex h-10 items-center gap-3 rounded-lg text-[14px] transition-all duration-200 ${isCollapsed ? "w-10 h-10 justify-center px-0 mx-auto" : "px-3"
          } ${active
            ? "bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white font-medium"
            : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          }`}
      >
        <item.icon size={18} className={`shrink-0 ${active ? "text-black dark:text-white" : "text-neutral-600 dark:text-neutral-400 group-hover:text-black dark:group-hover:text-white"}`} />
        {!isCollapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  }

  function NavSection<T>({ label, items, renderItem }: { label: string; items: readonly T[]; renderItem: (item: T) => React.ReactNode }) {
    return (
      <section className="mb-4">
        {!isCollapsed ? (
          <h2 className="mb-2 px-3 text-[11px] font-semibold tracking-[0.04em] text-neutral-400 dark:text-neutral-500">{label}</h2>
        ) : (
          <div className="my-2 h-[1px] w-8 mx-auto bg-neutral-200 dark:bg-neutral-800" />
        )}
        <nav className="space-y-1">{items.map(renderItem)}</nav>
      </section>
    );
  }

  const accountName = session?.user?.email ?? "Outbount workspace";

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0A0A0A] transition-all duration-300 md:flex ${isCollapsed ? "w-[72px]" : "w-[264px]"
          }`}
      >
        {/* Header: Gemini Style Hover Toggle */}
        <div className={`flex h-16 shrink-0 items-center ${isCollapsed ? "justify-center" : "justify-between px-5"}`}>
          {isCollapsed ? (
            <button
              type="button"
              onClick={toggleCollapse}
              title="Expand sidebar"
              className="group/toggle relative flex h-10 w-10 items-center justify-center rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              {/* Native Logo Icon */}
              <div className="flex items-center justify-center transition-opacity duration-200 group-hover/toggle:opacity-0 [&_span]:hidden [&_p]:hidden [&_h1]:hidden [&_h2]:hidden">
                <div className="w-9 h-9 overflow-hidden shrink-0 flex items-center justify-center">
                  <Logo />
                </div>
              </div>
              {/* Expand Icon (Reveals on Hover) */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/toggle:opacity-100 text-neutral-700 dark:text-neutral-200">
                <RiMenuUnfoldLine size={20} />
              </div>
            </button>
          ) : (
            <>
              <Logo />
              <button
                type="button"
                onClick={toggleCollapse}
                title="Collapse sidebar"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 dark:text-neutral-400 transition-colors"
              >
                <RiMenuFoldLine size={18} />
              </button>
            </>
          )}
        </div>

        {/* Scrollable Navigation */}
        <div className="flex-1 overflow-y-auto scrollbar-none px-2 py-2">
          <NavSection label="Workspace" items={workspaceNav} renderItem={(item) => <NavLink key={item.href} item={item} />} />
          <NavSection label="Build pipeline" items={growthNav} renderItem={(item) => <NavLink key={item.href} item={item} />} />
          <NavSection label="Operations" items={systemNav} renderItem={(item) => <NavLink key={item.href} item={item} />} />
          {isSuperadmin && (
            <NavSection label="Instance" items={adminNav} renderItem={(item) => <NavLink key={item.href} item={item} />} />
          )}
        </div>

        {/* Bottom Section */}
        <div className="shrink-0 p-2">
          {updateAvailable && (
            !isCollapsed ? (
              <div className="mb-2 rounded-[10px] border border-warning/25 bg-warning/[0.08] p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-warning">
                  <RiArrowUpCircleLine size={15} /> Update available
                </div>
                <p className="mt-1 text-[10px] text-warning/70">Outbount {latestVersion ? `v${latestVersion}` : "has a new release"}</p>
              </div>
            ) : (
              <div className="mb-2 flex justify-center" title={`Update available: Outbount ${latestVersion ? `v${latestVersion}` : "new release"}`}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-warning/25 bg-warning/[0.08] text-warning">
                  <RiArrowUpCircleLine size={16} />
                </div>
              </div>
            )
          )}

          {/* Help & Learning */}
          <div className="relative" ref={helpRef}>
            <button
              type="button"
              onClick={() => setHelpOpen((open) => !open)}
              title={isCollapsed ? "Help & learning" : undefined}
              className={`flex h-10 items-center gap-3 rounded-lg text-[14px] font-medium text-neutral-700 dark:text-neutral-300 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-900 ${isCollapsed ? "w-10 h-10 justify-center px-0 mx-auto" : "w-full px-3"
                }`}
            >
              <RiQuestionLine size={18} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
              {!isCollapsed && <span>Help & learning</span>}
            </button>
            {helpOpen && (
              <div className={`absolute bottom-12 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1.5 shadow-lg z-50 ${isCollapsed ? "left-14 w-48" : "left-0 w-full"}`}>
                {tourPage && (
                  <button
                    type="button"
                    onClick={() => { replayPageTour(tourPage); setHelpOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <RiCompassLine size={15} /> Replay page tour
                  </button>
                )}
                <a href={LEARNING_PLAYLIST_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <RiPlayCircleLine size={15} /> Learning resources
                </a>
              </div>
            )}
          </div>

          {/* Settings */}
          <Link
            href="/settings"
            title={isCollapsed ? "Settings" : undefined}
            className={`flex h-10 items-center gap-3 rounded-lg text-[14px] transition-colors ${isCollapsed ? "w-10 h-10 justify-center px-0 mx-auto" : "px-3"
              } ${isActive("/settings")
                ? "bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white font-medium"
                : "font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              }`}
          >
            <RiSettings4Line size={18} className={`shrink-0 ${isActive("/settings") ? "text-black dark:text-white" : "text-neutral-500 dark:text-neutral-400"}`} />
            {!isCollapsed && <span>Settings</span>}
          </Link>

          {/* Theme Toggle (Dead-center alignment fix) */}
          <div className="mt-1 flex justify-center w-full">
            {isCollapsed ? (
              <div
                title="Toggle theme"
                className="flex h-10 w-10 items-center justify-center mx-auto rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors [&_*]:!m-0 [&_*]:!p-0 [&_*]:!gap-0 [&_*]:!text-[0px] [&_svg]:!w-[18px] [&_svg]:!h-[18px] [&_svg]:!shrink-0 [&_svg]:!text-neutral-500 dark:[&_svg]:!text-neutral-400 [&_button]:!w-10 [&_button]:!h-10 [&_button]:!grid [&_button]:!place-items-center [&_button]:!border-none [&_button]:!bg-transparent [&_button]:!shadow-none"
              >
                <ThemeToggle />
              </div>
            ) : (
              <div className="w-full px-1">
                <ThemeToggle />
              </div>
            )}
          </div>

          {/* User Profile Footer */}
          {!isCollapsed ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 p-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black dark:bg-white text-[11px] font-semibold text-white dark:text-black">
                {initials(accountName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-neutral-900 dark:text-neutral-100">{accountName}</p>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{currentVersion ? `v${currentVersion}` : "Self-hosted"}</p>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                title="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <RiLogoutBoxLine size={15} />
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 p-2 w-10 mx-auto">
              <div
                title={accountName}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black dark:bg-white text-[10px] font-semibold text-white dark:text-black"
              >
                {initials(accountName)}
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                title={`Sign out (${accountName})`}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <RiLogoutBoxLine size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Navigation */}
      <nav aria-label="Primary navigation" className="fixed inset-x-3 bottom-3 z-40 flex h-16 items-center justify-around rounded-[16px] border border-[var(--border-subtle)] bg-base-100 px-2 shadow-[var(--shadow-popover)] md:hidden">
        {mobilePrimary.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined} className={`flex h-11 w-11 items-center justify-center rounded-[12px] transition-colors ${active ? "bg-primary text-primary-content" : "text-base-content/55"}`}>
              <item.icon size={20} />
            </Link>
          );
        })}
        <button type="button" aria-label="More" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-[12px] text-base-content/55">
          <RiMenuLine size={20} />
        </button>
      </nav>

      {/* Full Mobile Menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col overflow-y-auto rounded-t-[20px] border-t border-[var(--border-subtle)] bg-base-100 px-4 pb-8 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-base-content">Menu</span>
              <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-base-content/50 hover:bg-base-200">
                <RiCloseLine size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <MobileSection label="Workspace" items={workspaceNav} render={(item) => <MobileLink key={item.href} item={item} />} />
              <MobileSection label="Build pipeline" items={growthNav} render={(item) => <MobileLink key={item.href} item={item} />} />
              <div>
                <h3 className="mb-1 px-3 text-[11px] font-semibold tracking-[0.04em] text-base-content/40">Operations</h3>
                <div className="space-y-1">
                  {systemNav.map((item) => <MobileLink key={item.href} item={item} />)}
                  {isSuperadmin && adminNav.map((item) => <MobileLink key={item.href} item={item} />)}
                  <Link href="/settings" onClick={() => setMenuOpen(false)} className={`flex h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] ${isActive("/settings") ? "bg-primary font-semibold text-primary-content" : "font-medium text-base-content/70 hover:bg-base-200"}`}>
                    <RiSettings4Line size={19} className={isActive("/settings") ? "text-primary-content" : "text-base-content/45"} /> Settings
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-base-200 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-primary text-[11px] font-semibold text-primary-content">{initials(accountName)}</div>
                <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-base-content/85">{accountName}</p>
                <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-base-content/60 hover:bg-error/10 hover:text-error">
                  <RiLogoutBoxLine size={15} /> Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  function MobileLink({ item }: { item: NavItem }) {
    if ("premium" in item && item.premium && !hasCrm) return null;
    const active = isActive(item.href);
    return (
      <Link href={item.href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined} className={`flex h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] ${active ? "bg-primary font-semibold text-primary-content" : "font-medium text-base-content/70 hover:bg-base-200"}`}>
        <item.icon size={19} className={active ? "text-primary-content" : "text-base-content/45"} /> <span>{item.label}</span>
      </Link>
    );
  }
}

function MobileSection({ label, items, render }: { label: string; items: readonly NavItem[]; render: (item: NavItem) => React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 px-3 text-[11px] font-semibold tracking-[0.04em] text-base-content/40">{label}</h3>
      <div className="space-y-1">{items.map(render)}</div>
    </div>
  );
}