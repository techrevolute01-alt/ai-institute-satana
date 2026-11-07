import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { requireRole } from "@/lib/auth";
import { requestPayout } from "@/lib/affiliate.functions";
import { DashboardShell } from "@/components/skillora/dashboard";
import {
  DataTable,
  PageHeader,
  StatusPill,
  date,
  money,
  pageHead,
} from "@/components/skillora/data-table";
import { useMyAffiliate, totals } from "@/components/skillora/affiliate-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/affiliate/withdrawals")({
  beforeLoad: ({ location }) => requireRole("affiliate", location.href),
  head: pageHead("Withdrawals", "Request and track withdrawals."),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const { data, isPending, error } = useMyAffiliate();
  const req = useServerFn(requestPayout);
  const [amount, setAmount] = useState("");
  const t = totals(data);
  const max = Math.max(0, t.available - t.pendingPayouts);
  const m = useMutation({
    mutationFn: req,
    onSuccess: () => {
      toast.success("Withdrawal requested.");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["my-affiliate"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not request withdrawal."),
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!amount || !(n > 0)) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    if (n > max) {
      toast.error(`You can withdraw up to ${money(max)}.`);
      return;
    }
    m.mutate({ data: { amount: n } });
  }
  return (
    <DashboardShell mode="affiliate">
      <PageHeader
        eyebrow="Withdrawals"
        title="Withdrawals"
        description="Request a payout from your available balance. Admins review each request."
      />
      <form
        onSubmit={submit}
        className="mt-8 flex flex-wrap items-end gap-3 rounded-lg bg-surface p-6 border border-line"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="amt">Amount (available {money(max)})</Label>
          <Input
            id="amt"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-48"
          />
        </div>
        <Button type="submit" disabled={m.isPending || max <= 0}>
          {m.isPending ? "Requesting…" : "Request withdrawal"}
        </Button>
      </form>
      <DataTable
        rows={data?.payouts}
        loading={isPending}
        error={error}
        empty="No withdrawal requests yet."
        rowKey={(r) => r.id}
        columns={[
          { label: "Amount", cell: (r) => money(r.amount) },
          { label: "Requested", cell: (r) => date(r.requested_at) },
          { label: "Processed", cell: (r) => date(r.processed_at) },
          { label: "Status", cell: (r) => <StatusPill value={r.status} /> },
        ]}
      />
    </DashboardShell>
  );
}
