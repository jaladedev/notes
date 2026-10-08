"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavBadge } from "@/components/NavBadge";

export type NavItem = { label: string; href: string; badge?: number };

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
          <NavBadge count={item.badge ?? 0} />
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
