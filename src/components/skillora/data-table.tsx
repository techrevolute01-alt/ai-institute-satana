import type { ReactNode } from "react";

export const money = (v: number, currency = "USD") =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
  }).format(v);
export const date = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase text-accent">{eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl font-bold">{title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  const good = ["active", "approved", "paid", "published"].includes(value);
  const bad = ["rejected", "suspended", "cancelled"].includes(value);
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ring-1 ${good ? "text-success ring-success/40" : bad ? "text-destructive ring-destructive/40" : "text-muted-foreground ring-ink/20"}`}
    >
      {value}
    </span>
  );
}

export function DataTable<T>({
  rows,
  columns,
  loading,
  error,
  empty,
  rowKey,
}: {
  rows: T[] | undefined;
  loading: boolean;
  error: unknown;
  empty: string;
  rowKey: (r: T) => string;
  columns: { label: string; cell: (r: T) => ReactNode; align?: "right" }[];
}) {
  return (
    <section className="mt-8 overflow-x-auto rounded-lg bg-surface border border-line">
      {loading ? (
        <p className="p-6 text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="p-6 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load data."}
        </p>
      ) : (rows?.length ?? 0) === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted-foreground">
              {columns.map((c) => (
                <th key={c.label} className={`p-4 ${c.align === "right" ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {rows!.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => (
                  <td key={c.label} className={`p-4 ${c.align === "right" ? "text-right" : ""}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const pageHead = (title: string, description: string) => () => ({
  meta: [
    { title: `${title} — AI Institute` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — AI Institute` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ],
});
