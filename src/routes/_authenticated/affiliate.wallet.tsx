import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/lib/auth";
import { DashboardShell, StatCard } from "@/components/skillora/dashboard";
import { DataTable, PageHeader, date, money, pageHead } from "@/components/skillora/data-table";
import { useMyAffiliate } from "@/components/skillora/affiliate-data";

export const Route = createFileRoute("/_authenticated/affiliate/wallet")({
  beforeLoad: ({ location }) => requireRole("affiliate", location.href),
  head: pageHead("Wallet", "Your affiliate wallet balance."),
  component: Page,
});

function Page() {
  const { data, isPending, error } = useMyAffiliate();
  return (
    <DashboardShell mode="affiliate">
      <PageHeader
        eyebrow="Wallet"
        title="Wallet"
        description="Your balance and transaction history."
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Available"
          value={isPending ? "…" : money(data?.wallet?.available_balance ?? 0)}
          note="Ready to withdraw"
        />
        <StatCard
          label="Pending"
          value={isPending ? "…" : money(data?.wallet?.pending_balance ?? 0)}
          note="Not yet released"
        />
      </div>
      <DataTable
        rows={data?.transactions}
        loading={isPending}
        error={error}
        empty="No wallet transactions yet."
        rowKey={(r) => r.id}
        columns={[
          { label: "Type", cell: (r) => <span className="capitalize">{r.transaction_type}</span> },
          {
            label: "Amount",
            cell: (r) => (
              <span className={r.amount < 0 ? "text-destructive" : "text-success"}>
                {money(r.amount)}
              </span>
            ),
          },
          { label: "Date", cell: (r) => date(r.created_at) },
        ]}
      />
    </DashboardShell>
  );
}
