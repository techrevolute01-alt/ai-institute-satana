import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { DashboardShell, StatCard } from "@/components/skillora/dashboard";
import { PageHeader, pageHead } from "@/components/skillora/data-table";
import { useMyAffiliate } from "@/components/skillora/affiliate-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/affiliate/referrals")({
  beforeLoad: ({ location }) => requireRole("affiliate", location.href),
  head: pageHead("Referrals", "Your referral link and visits."),
  component: Page,
});

function Page() {
  const { data, isPending } = useMyAffiliate();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const code = data?.profile?.referral_code;
  const link = code ? `${origin}/?ref=${code}` : "";
  return (
    <DashboardShell mode="affiliate">
      <PageHeader
        eyebrow="Referrals"
        title="Referral link"
        description="Share this link. Visits and leads are counted against your account."
      />
      <section className="mt-8 rounded-lg bg-surface p-6 border border-line">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : code ? (
          <div className="flex gap-2">
            <Input readOnly value={link} />
            <Button
              onClick={() =>
                navigator.clipboard.writeText(link).then(() => toast.success("Link copied."))
              }
            >
              <Copy />
              Copy
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your referral code is issued when an admin approves your affiliate account.
          </p>
        )}
      </section>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Clicks"
          value={isPending ? "…" : String(data?.clicks ?? 0)}
          note="Referral link visits"
        />
        <StatCard
          label="Leads"
          value={isPending ? "…" : String(data?.leads ?? 0)}
          note="Visitors who signed up"
        />
      </div>
    </DashboardShell>
  );
}
