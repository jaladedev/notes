import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { getNavBadgeCounts } from "@/lib/actions/notifications";
import { signOut } from "@/lib/actions/session";
import { DashboardNav, type NavItem } from "@/components/DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  // Middleware already redirects signed-out visitors; render bare if no profile.
  if (!profile) return <>{children}</>;

  const supabase = createClient();
  const [{ data: settings }, badges] = await Promise.all([
    supabase.from("settings").select("school_name").maybeSingle(),
    getNavBadgeCounts().catch(() => ({ messages: 0, announcements: 0 })),
  ]);

  const isAdmin = profile.role === "admin";
  const home: NavItem =
    profile.role === "parent"
      ? { label: "My children", href: "/dashboard/parent" }
      : { label: "Home", href: "/dashboard" };

  const items: NavItem[] = [
    home,
    { label: "Announcements", href: "/dashboard/announcements", badge: badges.announcements },
    { label: "Messages", href: "/dashboard/messages", badge: badges.messages },
    { label: "Timetable", href: "/dashboard/timetable" },
    { label: "Search", href: "/dashboard/search" },
  ];

  const adminItems: NavItem[] = isAdmin
    ? [
        { label: "Staff", href: "/dashboard/admin/staff" },
        { label: "Students", href: "/dashboard/admin/students" },
        { label: "Parents", href: "/dashboard/admin/parents" },
        { label: "Classes", href: "/dashboard/admin/classes" },
        { label: "Subjects", href: "/dashboard/admin/subjects" },
        { label: "Timetable setup", href: "/dashboard/admin/timetable" },
        { label: "Audit log", href: "/dashboard/admin/audit-log" },
      ]
    : [];

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-marigold focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <DashboardNav
        schoolName={settings?.school_name?.trim() || "School"}
        userName={profile.full_name || "Account"}
        items={items}
        adminItems={adminItems}
        signOutAction={signOut}
      />
      <main id="main">{children}</main>
    </>
  );
}
