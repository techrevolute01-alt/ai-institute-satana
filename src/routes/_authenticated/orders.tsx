import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/skillora/dashboard";
import { StatusPill, pageHead } from "@/components/skillora/data-table";
import { requireRole } from "@/lib/auth";
import { getMyOrders, type StudentOrder } from "@/lib/order.functions";

export const Route = createFileRoute("/_authenticated/orders")({
  beforeLoad: ({ location }) => requireRole("student", location.href),
  head: pageHead("My Orders", "Review purchases connected to your account."),
  component: Page,
});

const stateHelp: Record<string, string> = {
  pending: "Payment is awaiting confirmation. Access is not granted until payment is verified.",
  paid: "Payment was recorded as successful.",
  failed: "Payment did not complete. A new secure checkout is not available from order history.",
  cancelled: "This order was cancelled.",
  refunded: "This order was refunded. Course access follows the existing enrollment/access rules.",
};

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function OrderDetails({ order }: { order: StudentOrder }) {
  return (
    <details className="rounded-lg bg-surface ring-1 ring-ink/15">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-semibold">
            {order.items.map((item) => item.title).join(", ") || "Order"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Order {order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold">{formatMoney(order.total, order.currency)}</span>
          <StatusPill value={order.status} />
        </div>
      </summary>
      <div className="grid gap-5 border-t border-ink/10 p-5">
        <div>
          <h3 className="font-semibold">Order details</h3>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Order ID</dt>
              <dd className="break-all font-mono text-xs">{order.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Order date</dt>
              <dd>{new Date(order.created_at).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Order total</dt>
              <dd>{formatMoney(order.total, order.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Order status</dt>
              <dd className="capitalize">{order.status}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">
            {stateHelp[order.status] ??
              "See the status details below or contact support if you need help."}
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Purchased items</h3>
          {order.items.length ? (
            <ul className="mt-2 divide-y divide-ink/10">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span>{item.title}</span>
                  <span>{formatMoney(item.amount, order.currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No items are available.</p>
          )}
        </div>
        <div>
          <h3 className="font-semibold">Payment history</h3>
          {order.payments.length ? (
            <ul className="mt-2 grid gap-2">
              {order.payments.map((payment) => (
                <li key={payment.id} className="rounded-md border border-ink/10 p-3 text-sm">
                  <p>
                    {payment.provider ?? "Payment method unavailable"} · {payment.status} ·{" "}
                    {formatMoney(payment.amount, order.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recorded {new Date(payment.created_at).toLocaleString()}
                    {payment.paid_at ? ` · Paid ${new Date(payment.paid_at).toLocaleString()}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No payment records are attached to this order.
            </p>
          )}
        </div>
        <div>
          <h3 className="font-semibold">Refund history</h3>
          {order.refunds.length ? (
            <ul className="mt-2 grid gap-2">
              {order.refunds.map((refund) => (
                <li key={refund.id} className="rounded-md border border-ink/10 p-3 text-sm">
                  {refund.status} · {formatMoney(refund.amount, order.currency)} ·{" "}
                  {new Date(refund.created_at).toLocaleDateString()}
                  {refund.reason ? ` · ${refund.reason}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No refunds recorded.</p>
          )}
        </div>
      </div>
    </details>
  );
}

function Page() {
  const loadOrders = useServerFn(getMyOrders);
  const { data, isPending, error } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => loadOrders(),
  });

  return (
    <DashboardShell mode="student">
      <p className="text-xs font-semibold uppercase text-accent">Orders</p>
      <h1 className="mt-2 font-display text-4xl font-bold">My order history</h1>
      <p className="mt-2 text-muted-foreground">
        Only orders associated with your signed-in account are shown here.
      </p>
      <section className="mt-6 grid gap-3">
        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading your orders…
          </p>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        ) : data?.length ? (
          data.map((order) => <OrderDetails key={order.id} order={order} />)
        ) : (
          <div className="rounded-lg bg-surface p-6 ring-1 ring-ink/15">
            <h2 className="font-semibold">No orders yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Orders connected to your account will appear here.
            </p>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
