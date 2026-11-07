import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import {
  listPromoCodes,
  savePromoCode,
  deletePromoCode,
  listAffiliates,
  promoSchema,
  type PromoRow,
} from "@/lib/admin-ops.functions";
import { DashboardShell } from "@/components/skillora/dashboard";
import {
  DataTable,
  PageHeader,
  StatusPill,
  money,
  pageHead,
} from "@/components/skillora/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/promo-codes")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: pageHead("Promo Codes", "Create and manage promo codes."),
  component: Page,
});

type Form = { code: string; discount_value: string; affiliate_id: string; active: boolean };
const empty: Form = { code: "", discount_value: "0", affiliate_id: "", active: true };

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listPromoCodes),
    save = useServerFn(savePromoCode),
    del = useServerFn(deletePromoCode),
    affs = useServerFn(listAffiliates);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-promos"],
    queryFn: () => list(),
  });
  const { data: affiliates } = useQuery({ queryKey: ["admin-affiliates"], queryFn: () => affs() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PromoRow | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const onErr = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Something went wrong.");
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-promos"] });
  const saveM = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success(editing ? "Promo code updated." : "Promo code created.");
      setOpen(false);
      refresh();
    },
    onError: onErr,
  });
  const delM = useMutation({
    mutationFn: del,
    onSuccess: () => {
      toast.success("Promo code deleted.");
      refresh();
    },
    onError: onErr,
  });
  const approved = (affiliates ?? []).filter((a) => a.status === "approved");
  const name = (id: string | null) =>
    id ? (approved.find((a) => a.id === id)?.full_name ?? "Affiliate") : "—";

  function openForm(p: PromoRow | null) {
    setEditing(p);
    setErrors({});
    setForm(
      p
        ? {
            code: p.code,
            discount_value: String(p.discount_value),
            affiliate_id: p.affiliate_id ?? "",
            active: p.active,
          }
        : empty,
    );
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = promoSchema.safeParse({
      code: form.code,
      discount_value: form.discount_value.trim() === "" ? NaN : Number(form.discount_value),
      affiliate_id: form.affiliate_id || null,
      active: form.active,
    });
    if (!parsed.success) {
      const m: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        m[String(i.path[0])] ??= i.message;
      });
      setErrors(m);
      return;
    }
    saveM.mutate({ data: { id: editing?.id, values: parsed.data } });
  }
  return (
    <DashboardShell mode="admin">
      <PageHeader
        eyebrow="Promo Codes"
        title="Promo code management"
        description="Create discount codes and optionally link them to an affiliate. Discounts are applied at checkout once payments are enabled."
        action={
          <Button onClick={() => openForm(null)}>
            <Plus />
            Add promo code
          </Button>
        }
      />
      <DataTable<PromoRow>
        rows={data}
        loading={isPending}
        error={error}
        empty="No promo codes yet."
        rowKey={(r) => r.id}
        columns={[
          { label: "Code", cell: (r) => <span className="font-semibold">{r.code}</span> },
          { label: "Discount", cell: (r) => money(r.discount_value) },
          { label: "Affiliate", cell: (r) => name(r.affiliate_id) },
          { label: "Uses", cell: (r) => r.uses },
          { label: "Status", cell: (r) => <StatusPill value={r.active ? "active" : "inactive"} /> },
          {
            label: "Actions",
            align: "right",
            cell: (r) => (
              <div className="flex justify-end gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Edit ${r.code}`}
                  onClick={() => openForm(r)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${r.code}`}
                  disabled={delM.isPending}
                  onClick={() => {
                    if (confirm(`Delete ${r.code}?`)) delM.mutate({ data: { id: r.id } });
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ),
          },
        ]}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit promo code" : "New promo code"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="code">Code *</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              {errors["code"] && <p className="text-xs text-destructive">{errors["code"]}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dv">Discount amount (USD) *</Label>
              <Input
                id="dv"
                type="number"
                min={0}
                step="0.01"
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
              />
              {errors["discount_value"] && (
                <p className="text-xs text-destructive">{errors["discount_value"]}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="aff">Affiliate</Label>
              <select
                id="aff"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.affiliate_id}
                onChange={(e) => setForm({ ...form, affiliate_id: e.target.value })}
              >
                <option value="">None (general code)</option>
                {approved.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name} {a.email ? `(${a.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Active
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveM.isPending}>
                {saveM.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
