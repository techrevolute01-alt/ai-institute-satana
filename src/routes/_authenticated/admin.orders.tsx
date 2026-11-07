import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, Eye, Search } from "lucide-react";
import { DashboardShell } from "@/components/skillora/dashboard";
import { StatusPill, pageHead } from "@/components/skillora/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requireRole } from "@/lib/auth";
import { listAdminOrders, type ManagedOrder } from "@/lib/order.functions";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: pageHead("Orders", "Review customer orders and payment history."),
  component: Page,
});

const statusLabel: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
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

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportOrders(orders: ManagedOrder[]) {
  const columns = [
    "Order ID",
    "Customer",
    "Email",
    "Package or item",
    "Total",
    "Currency",
    "Order status",
    "Payment status",
    "Payment method",
    "Payment reference",
    "Order date",
    "Refund history",
  ];
  const rows = orders.map((order) => [
    order.id,
    order.customer,
    order.email,
    order.items.map((item) => item.title).join("; "),
    order.total,
    order.currency,
    statusLabel[order.status] ?? order.status,
    order.payments.map((payment) => payment.status).join("; "),
    order.payments.map((payment) => payment.provider ?? "").join("; "),
    order.payments.map((payment) => payment.provider_reference ?? "").join("; "),
    order.created_at,
    order.refunds
      .map((refund) => `${refund.status}: ${refund.amount} ${order.currency}`)
      .join("; "),
  ]);
  const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `skillora-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Page() {
  const list = useServerFn(listAdminOrders);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => list(),
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [packageId, setPackageId] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [throughDate, setThroughDate] = useState("");
  const [sort, setSort] = useState("date-desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ManagedOrder | null>(null);
  const pageSize = 20;
  const packageOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const order of data ?? []) {
      for (const item of order.items) {
        if (item.package_id) options.set(item.package_id, item.title);
      }
    }
    return [...options].map(([id, title]) => ({ id, title }));
  }, [data]);
  const filteredOrders = useMemo(() => {
    const filtered = (data ?? []).filter((order) => {
      const terms = [
        order.id,
        order.customer,
        order.email,
        ...order.items.map((item) => item.title),
        ...order.payments.map((payment) => payment.provider_reference),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const orderDate = order.created_at.slice(0, 10);
      return (
        terms.includes(search.trim().toLowerCase()) &&
        (status === "all" || order.status === status) &&
        (paymentStatus === "all" ||
          order.payments.some((payment) => payment.status === paymentStatus)) &&
        (packageId === "all" || order.items.some((item) => item.package_id === packageId)) &&
        (!fromDate || orderDate >= fromDate) &&
        (!throughDate || orderDate <= throughDate)
      );
    });
    filtered.sort((a, b) => {
      if (sort === "amount-asc") return a.total - b.total;
      if (sort === "amount-desc") return b.total - a.total;
      if (sort === "status") return a.status.localeCompare(b.status);
      const direction = sort === "date-asc" ? 1 : -1;
      return direction * (Date.parse(a.created_at) - Date.parse(b.created_at));
    });
    return filtered;
  }, [data, search, status, paymentStatus, packageId, fromDate, throughDate, sort]);
  const pageCount = Math.ceil(filteredOrders.length / pageSize);
  const currentRows = filteredOrders.slice(page * pageSize, (page + 1) * pageSize);

  function updateFilter<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(0);
  }

  return (
    <DashboardShell mode="admin">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-accent">Orders</p>
          <h1 className="mt-2 font-display text-4xl font-bold">Order management</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Review recorded orders, verified payment records, and refund history. Payment status is
            read-only here and must come from a trusted payment confirmation.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!filteredOrders.length}
          onClick={() => exportOrders(filteredOrders)}
        >
          <Download className="size-4" />
          Export filtered CSV
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => updateFilter(setSearch, event.target.value)}
            placeholder="Search order, student, email, package, or payment reference"
            aria-label="Search orders"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Order status
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => updateFilter(setStatus, event.target.value)}
          >
            <option value="all">All statuses</option>
            {["pending", "paid", "cancelled", "refunded"].map((value) => (
              <option key={value} value={value}>
                {statusLabel[value] ?? value}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Payment status
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={paymentStatus}
            onChange={(event) => updateFilter(setPaymentStatus, event.target.value)}
          >
            <option value="all">All payment statuses</option>
            {[...new Set((data ?? []).flatMap((order) => order.payments.map((p) => p.status)))]
              .sort()
              .map((value) => (
                <option key={value} value={value}>
                  {statusLabel[value] ?? value}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Package
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={packageId}
            onChange={(event) => updateFilter(setPackageId, event.target.value)}
          >
            <option value="all">All packages</option>
            {packageOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Date from
          <Input
            type="date"
            value={fromDate}
            onChange={(event) => updateFilter(setFromDate, event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Date through
          <Input
            type="date"
            value={throughDate}
            onChange={(event) => updateFilter(setThroughDate, event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Sort
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={sort}
            onChange={(event) => updateFilter(setSort, event.target.value)}
          >
            <option value="date-desc">Date: newest first</option>
            <option value="date-asc">Date: oldest first</option>
            <option value="amount-desc">Amount: high to low</option>
            <option value="amount-asc">Amount: low to high</option>
            <option value="status">Status</option>
          </select>
        </label>
      </div>

      <section className="mt-6 overflow-x-auto rounded-lg bg-surface border border-line">
        {isPending ? (
          <p className="p-6 text-sm text-muted-foreground">Loading orders…</p>
        ) : error ? (
          <p role="alert" className="p-6 text-sm text-destructive">
            {error.message}
          </p>
        ) : currentRows.length ? (
          <table className="w-full min-w-[850px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted-foreground">
                {["Order", "Customer", "Items", "Total", "Date", "Payment", "Status", ""].map(
                  (column, index) => (
                    <th key={`${column}-${index}`} className="p-4">
                      {column}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {currentRows.map((order) => (
                <tr key={order.id}>
                  <td className="p-4 font-mono text-xs">{order.id.slice(0, 8)}</td>
                  <td className="p-4">
                    <p className="font-semibold">{order.customer}</p>
                    <p className="text-xs text-muted-foreground">{order.email ?? "—"}</p>
                  </td>
                  <td className="max-w-56 p-4">
                    {order.items.map((item) => item.title).join(", ") || "—"}
                  </td>
                  <td className="p-4">{formatMoney(order.total, order.currency)}</td>
                  <td className="p-4">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td className="p-4">
                    {order.payments.length
                      ? order.payments.map((payment) => payment.status).join(", ")
                      : "No payment"}
                  </td>
                  <td className="p-4">
                    <StatusPill value={order.status} />
                  </td>
                  <td className="p-4">
                    <Button variant="outline" size="sm" onClick={() => setSelected(order)}>
                      <Eye className="size-4" />
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">
            {data?.length ? "No orders match these filters." : "No orders have been recorded."}
          </p>
        )}
      </section>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          Showing {filteredOrders.length ? page * pageSize + 1 : 0}–
          {Math.min((page + 1) * pageSize, filteredOrders.length)} of {filteredOrders.length}{" "}
          filtered orders (up to 500 most recent loaded).
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={pageCount === 0 || page >= pageCount - 1}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Order details</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <dl className="grid gap-3 rounded-md bg-paper p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Order ID</dt>
                    <dd className="break-all font-mono">{selected.id}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Order status</dt>
                    <dd>{statusLabel[selected.status] ?? selected.status}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Customer</dt>
                    <dd>{selected.customer}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Email</dt>
                    <dd>{selected.email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Order date</dt>
                    <dd>{new Date(selected.created_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Final amount</dt>
                    <dd className="font-semibold">
                      {formatMoney(selected.total, selected.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Discount</dt>
                    <dd>Not stored in the current order schema</dd>
                  </div>
                </dl>
                <section>
                  <h3 className="font-semibold">Purchased items</h3>
                  {selected.items.length ? (
                    <ul className="mt-2 divide-y divide-ink/10">
                      {selected.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3 py-2 text-sm">
                          <span>{item.title}</span>
                          <span>{formatMoney(item.amount, selected.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No order items recorded.</p>
                  )}
                </section>
                <section>
                  <h3 className="font-semibold">Payment history</h3>
                  {selected.payments.length ? (
                    <ul className="mt-2 grid gap-2">
                      {selected.payments.map((payment) => (
                        <li
                          key={payment.id}
                          className="rounded-md border border-ink/10 p-3 text-sm"
                        >
                          <p>
                            {payment.provider ?? "Provider unavailable"} ·{" "}
                            {statusLabel[payment.status] ?? payment.status} ·{" "}
                            {formatMoney(payment.amount, selected.currency)}
                          </p>
                          <p className="mt-1 break-all text-xs text-muted-foreground">
                            Reference: {payment.provider_reference ?? "—"} · Created{" "}
                            {new Date(payment.created_at).toLocaleString()}
                            {payment.paid_at
                              ? ` · Paid ${new Date(payment.paid_at).toLocaleString()}`
                              : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No payment history recorded.
                    </p>
                  )}
                </section>
                <section>
                  <h3 className="font-semibold">Refund history</h3>
                  {selected.refunds.length ? (
                    <ul className="mt-2 grid gap-2">
                      {selected.refunds.map((refund) => (
                        <li key={refund.id} className="rounded-md border border-ink/10 p-3 text-sm">
                          {statusLabel[refund.status] ?? refund.status} ·{" "}
                          {formatMoney(refund.amount, selected.currency)} ·{" "}
                          {new Date(refund.created_at).toLocaleString()}
                          {refund.reason ? ` · ${refund.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No refund history recorded.
                    </p>
                  )}
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
