import { createFileRoute, Link } from "@tanstack/react-router";
import { requireRole } from "@/lib/auth";
import { DashboardShell, StatCard } from "@/components/skillora/dashboard";
import { PageHeader, StatusPill, money, pageHead } from "@/components/skillora/data-table";
import { useMyAffiliate, totals } from "@/components/skillora/affiliate-data";

export const Route = createFileRoute("/_authenticated/affiliate/")({
  head: pageHead("Affiliate Dashboard", "Track your AI Institute affiliate performance."),
  beforeLoad: ({ location }) => requireRole("affiliate", location.href),
  component: Page,
});

function Page() {
  const { data, isPending } = useMyAffiliate();
  const t = totals(data);
  const v = (s: string) => (isPending ? "…" : s);
  return (
    <DashboardShell mode="affiliate">
      <PageHeader
        eyebrow="Affiliate mode"
        title="Your growth workspace"
        description="Real performance from your referral link and promo codes."
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
        <StatCard label="Total referrals" value={v(String(t.referrals))} note="Attributed orders" />
        <StatCard
          label="Successful purchases"
          value={v(String(t.successfulPurchases))}
          note="Verified real payments"
        />
        <StatCard label="Clicks" value={v(String(data?.clicks ?? 0))} note="Referral link visits" />
        <StatCard
          label="Pending commission"
          value={v(money(t.pending, "INR"))}
          note="Awaiting approval"
        />
        <StatCard
          label="Approved commission"
          value={v(money(t.approved - t.paid, "INR"))}
          note="Unpaid"
        />
        <StatCard
          label="Paid commission"
          value={v(money(t.paid, "INR"))}
          note="Paid through payouts"
        />
        <StatCard
          label="Available balance"
          value={v(money(t.available, "INR"))}
          note="Ready to withdraw"
        />
      </div>
      <section className="mt-8 rounded-lg bg-surface p-6 border border-line">
        <h2 className="font-display text-2xl font-bold">Affiliate status</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          Status: <StatusPill value={data?.profile?.status ?? "—"} />
          {data?.profile?.referral_code && (
            <span>
              Referral code: <b>{data.profile.referral_code}</b>
            </span>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Share your link from{" "}
          <Link to="/affiliate/referrals" className="underline">
            Referrals
          </Link>
          . Commissions appear once real paid orders are attributed to you.
        </p>
      </section>
    </DashboardShell>
  );
}
