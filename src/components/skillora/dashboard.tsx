import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  LayoutDashboard,
  Award,
  Package,
  ShoppingBag,
  Bell,
  Users,
  Link2,
  MousePointerClick,
  BadgeDollarSign,
  Wallet,
  Settings,
  LogOut,
  Menu,
  BarChart3,
  UserRound,
  ClipboardList,
} from "lucide-react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Brand } from "./layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/lib/auth";

export type DashboardMode = "student" | "affiliate" | "admin";
const iconMap: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  "My Learning": BookOpen,
  "My Packages": Package,
  "My Courses": BookOpen,
  Certificates: Award,
  Orders: ShoppingBag,
  Notifications: Bell,
  Affiliate: Users,
  Profile: UserRound,
  "Promo Code": BadgeDollarSign,
  Referrals: Link2,
  Sales: BarChart3,
  Commission: BadgeDollarSign,
  Wallet,
  Withdrawals: Wallet,
  Students: Users,
  "Users & Roles": Users,
  Affiliates: Users,
  Packages: Package,
  Courses: BookOpen,
  Quizzes: ClipboardList,
  Payments: BadgeDollarSign,
  "Promo Codes": BadgeDollarSign,
  Commissions: BadgeDollarSign,
  Reports: BarChart3,
  Settings,
};
const nav = {
  student: [
    ["Dashboard", "/dashboard"],
    ["My Learning", "/my-learning"],
    ["My Packages", "/my-packages"],
    ["My Courses", "/my-courses"],
    ["Certificates", "/certificates"],
    ["Orders", "/orders"],
    ["Notifications", "/notifications"],
    ["Profile", "/profile"],
  ],
  affiliate: [
    ["Dashboard", "/affiliate"],
    ["Promo Code", "/affiliate/promo-code"],
    ["Referrals", "/affiliate/referrals"],
    ["Sales", "/affiliate/sales"],
    ["Commission", "/affiliate/commission"],
    ["Wallet", "/affiliate/wallet"],
    ["Withdrawals", "/affiliate/withdrawals"],
    ["Profile", "/profile"],
  ],
  admin: [
    ["Dashboard", "/admin"],
    ["Students", "/admin/students"],
    ["Users & Roles", "/admin/users"],
    ["Affiliates", "/admin/affiliates"],
    ["Packages", "/admin/packages"],
    ["Courses", "/admin/courses"],
    ["Quizzes", "/admin/quizzes"],
    ["Certificates", "/admin/certificates"],
    ["Orders", "/admin/orders"],
    ["Payments", "/admin/payments"],
    ["Promo Codes", "/admin/promo-codes"],
    ["Commissions", "/admin/commissions"],
    ["Withdrawals", "/admin/withdrawals"],
    ["Reports", "/admin/reports"],
    ["Settings", "/admin/settings"],
  ],
} as const;
export function DashboardShell({
  mode = "student",
  children,
}: {
  mode?: DashboardMode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const roles = useMyRoles() ?? [];
  const modes = (
    [
      ["student", "Student Mode", "/dashboard"],
      ["affiliate", "Affiliate Mode", "/affiliate"],
      ["admin", "Admin", "/admin"],
    ] as const
  ).filter(([m]) => roles.includes(m));
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  async function logout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await router.invalidate();
    await navigate({ to: "/login", search: {}, replace: true });
  }
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <Brand />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setOpen(!open)}
          aria-label="Toggle workspace navigation"
        >
          <Menu />
        </Button>
      </header>
      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[250px_1fr]">
        <aside
          className={`${open ? "block" : "hidden"} border-r border-line bg-surface p-5 lg:block`}
        >
          <div className="hidden lg:block">
            <Brand />
          </div>
          <p className="mt-8 text-xs font-semibold uppercase text-muted-foreground">
            {mode} workspace
          </p>
          {modes.length > 1 && (
            <div className="mt-3 grid gap-1" aria-label="Switch workspace">
              {modes.map(([m, label, to]) => (
                <Link
                  key={m}
                  to={to}
                  className={`rounded-md px-3 py-2 text-xs font-semibold ${m === mode ? "bg-primary text-primary-foreground" : "border border-line hover:bg-secondary"}`}
                >
                  {label}
                </Link>
              ))}
            </div>
          )}
          <nav className="mt-4 space-y-1">
            {nav[mode].map(([item, to], i) => {
              const Icon = iconMap[item] ?? LayoutDashboard;
              return (
                <Link
                  key={item}
                  to={to}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-secondary hover:text-primary"
                  activeProps={{ className: "bg-secondary text-primary" }}
                  activeOptions={{ exact: i === 0 }}
                >
                  <Icon className="size-4" />
                  {item}
                </Link>
              );
            })}
            <Button variant="ghost" className="mt-2 w-full justify-start" onClick={logout}>
              <LogOut />
              Logout
            </Button>
          </nav>
        </aside>
        <main className="min-w-0 p-5 sm:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
export function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
