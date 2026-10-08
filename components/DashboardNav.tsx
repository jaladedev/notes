"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavBadge } from "@/components/NavBadge";
import { createClient } from "@/lib/supabase/client";
import { getNavBadgeCounts } from "@/lib/actions/notifications";

export type NavItem = {
  label: string;
  href: string;
  badge?: number;
  /** Items with a badgeKey get a live count; `badge` is the server-rendered starting value. */
  badgeKey?: "messages" | "announcements";
};

type Counts = { messages: number; announcements: number };

const LIVE_PREFIXES = ["/dashboard/messages", "/dashboard/announcements"];
const touchesLiveSection = (path: string) => LIVE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav({
  schoolName,
  userName,
  items,
  adminItems,
  signOutAction,
}: {
  schoolName: string;
  userName: string;
  items: NavItem[];
  adminItems: NavItem[];
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // The layout renders once and then persists across client navigations, so
  // the server-rendered counts go stale (and still count a conversation
  // you've just opened). Keep them in state and re-fetch when they can change.
  const serverMessages = items.find((i) => i.badgeKey === "messages")?.badge ?? 0;
  const serverAnnouncements = items.find((i) => i.badgeKey === "announcements")?.badge ?? 0;
  const [counts, setCounts] = useState<Counts>({ messages: serverMessages, announcements: serverAnnouncements });
  useEffect(() => {
    setCounts({ messages: serverMessages, announcements: serverAnnouncements });
  }, [serverMessages, serverAnnouncements]);

  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await getNavBadgeCounts();
      if (id === requestId.current) setCounts(next); // ignore out-of-order replies
    } catch {
      // Keep the last known counts.
    }
  }, []);

  // Reading messages / announcements changes the counts: re-fetch when
  // navigating into or out of those sections.
  const prevPath = useRef(pathname);
  useEffect(() => {
    const before = prevPath.current;
    prevPath.current = pathname;
    if (before !== pathname && (touchesLiveSection(before) || touchesLiveSection(pathname))) void refresh();
  }, [pathname, refresh]);

  // A hard load of a messages/announcements page renders the layout in
  // parallel with the page's mark-as-read, so correct the count once mounted.
  useEffect(() => {
    if (touchesLiveSection(pathnameRef.current)) void refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("app:refresh-nav-badges", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("app:refresh-nav-badges", onVisible);
    };
  }, [refresh]);

  // New messages in any of my conversations (Realtime only delivers rows
  // RLS lets me see). The conversation that's open handles its own
  // mark-as-read and then asks for a refresh, so skip it here.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("nav-unread-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const conversationId = (payload.new as { conversation_id?: string }).conversation_id;
        if (conversationId && pathnameRef.current === `/dashboard/messages/${conversationId}`) return;
        void refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const badgeFor = (item: NavItem) => (item.badgeKey ? counts[item.badgeKey] : item.badge ?? 0);
  const totalUnread = counts.messages + counts.announcements;

  const linkClass = (href: string) =>
    `flex items-center rounded-lg px-3 py-2 text-sm transition ${
      isActive(pathname, href)
        ? "bg-marigold-soft font-medium text-ink"
        : "text-ink-soft hover:bg-marigold-soft hover:text-ink"
    }`;

  const renderLinks = (list: NavItem[]) =>
    list.map((item) => (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={linkClass(item.href)}
        >
          {item.label}
          <NavBadge count={badgeFor(item)} />
        </Link>
      </li>
    ));

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <Link href="/dashboard" className="font-display text-lg font-semibold text-ink">
          {schoolName}
        </Link>

        <nav aria-label="Main" className="ml-4 hidden flex-1 md:block">
          <ul className="flex flex-wrap items-center gap-1">{renderLinks(items)}</ul>
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <span className="max-w-[10rem] truncate text-sm text-ink-soft" title={userName}>
            {userName}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink hover:border-marigold"
            >
              Sign out
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="ml-auto rounded-lg border border-rule bg-white px-3 py-1.5 text-sm text-ink md:hidden"
        >
          {open ? "Close" : "Menu"}
          {!open && <NavBadge count={totalUnread} />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-rule px-4 pb-4 pt-2 md:hidden">
          <nav aria-label="Main">
            <ul className="space-y-1">{renderLinks(items)}</ul>
            {adminItems.length > 0 && (
              <>
                <p className="mb-1 mt-4 px-3 text-xs font-medium text-ink-soft">Admin</p>
                <ul className="space-y-1">{renderLinks(adminItems)}</ul>
              </>
            )}
          </nav>
          <form action={signOutAction} className="mt-4 px-3">
            <p className="mb-2 truncate text-sm text-ink-soft">{userName}</p>
            <button
              type="submit"
              className="w-full rounded-lg border border-rule bg-white px-3 py-2 text-sm text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      )}

      {adminItems.length > 0 && (
        <nav aria-label="Admin" className="hidden border-t border-rule bg-white/60 md:block">
          <ul className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-1 sm:px-6">
            <li className="mr-2 text-xs font-medium text-ink-soft">Admin</li>
            {renderLinks(adminItems)}
          </ul>
        </nav>
      )}
    </header>
  );
}
