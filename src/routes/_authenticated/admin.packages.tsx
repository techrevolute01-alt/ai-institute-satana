import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, BookOpen, Eye } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PackageCoursesDialog } from "@/components/skillora/package-courses-dialog";
import { PackageIncludesSection } from "@/components/skillora/package-includes-section";
import { requireRole } from "@/lib/auth";
import {
  listAdminPackages,
  savePackage,
  setPackageStatus,
  deletePackage,
  packageSchema,
  type AdminPackage,
} from "@/lib/admin-packages.functions";
import { DashboardShell } from "@/components/skillora/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/packages")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: () => ({
    meta: [
      { title: "Packages — AI Institute" },
      { name: "description", content: "Manage learning packages." },
      { property: "og:title", content: "Packages — AI Institute" },
      { property: "og:description", content: "Manage learning packages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Form = {
  name: string;
  description: string;
  thumbnail_url: string;
  original_price: string;
  selling_price: string;
  commission_type: "percentage" | "fixed";
  commission_value: string;
  validity_days: string;
  status: "published" | "draft" | "archived";
  display_order: string;
};
const empty: Form = {
  name: "",
  description: "",
  thumbnail_url: "",
  original_price: "",
  selling_price: "",
  commission_type: "percentage",
  commission_value: "0",
  validity_days: "",
  status: "draft",
  display_order: "0",
};
const money = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
const discount = (o: number, s: number) =>
  o > 0 && s < o ? `${Math.round(((o - s) / o) * 100)}% off` : "—";
const statusLabel = { published: "Active", draft: "Inactive", archived: "Archived" } as const;

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listAdminPackages);
  const save = useServerFn(savePackage);
  const toggle = useServerFn(setPackageStatus);
  const remove = useServerFn(deletePackage);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: () => list(),
  });
  const [editing, setEditing] = useState<AdminPackage | null>(null);
  const [open, setOpen] = useState(false);
  const [coursesFor, setCoursesFor] = useState<AdminPackage | null>(null);
  const [viewing, setViewing] = useState<AdminPackage | null>(null);
  const [deleting, setDeleting] = useState<AdminPackage | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-packages"] });
  const onErr = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Something went wrong.");

  const saveM = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success(editing ? "Package updated." : "Package created.");
      setOpen(false);
      refresh();
    },
    onError: onErr,
  });
  const toggleM = useMutation({
    mutationFn: (v: { data: { id: string; active: boolean } }) => toggle(v),
    onSuccess: (_, v) => {
      toast.success(v.data.active ? "Package activated." : "Package deactivated.");
      refresh();
    },
    onError: onErr,
  });
  const delM = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      toast.success("Package deleted.");
      refresh();
    },
    onError: onErr,
  });

  function openForm(p: AdminPackage | null) {
    setEditing(p);
    setErrors({});
    setForm(
      p
        ? {
            name: p.name,
            description: p.description,
            thumbnail_url: p.thumbnail_url,
            original_price: String(p.original_price),
            selling_price: String(p.selling_price),
            commission_type: p.commission_type,
            commission_value: String(p.commission_value),
            validity_days: p.validity_days ? String(p.validity_days) : "",
            status: p.status,
            display_order: String(p.display_order),
          }
        : empty,
    );
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
    const parsed = packageSchema.safeParse({
      ...form,
      original_price: num(form.original_price),
      selling_price: num(form.selling_price),
      commission_type: form.commission_type,
      commission_value: num(form.commission_value),
      validity_days: form.validity_days.trim() ? Number(form.validity_days) : null,
      display_order: Number(form.display_order || 0),
    });
    if (!parsed.success) {
      const m: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const k = String(i.path[0]);
        m[k] ??= /nan|number/i.test(i.message) ? "Enter a valid number" : i.message;
      });
      setErrors(m);
      return;
    }
    setErrors({});
    saveM.mutate({ data: { id: editing?.id, values: parsed.data } });
  }
  const field = (k: keyof Form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input
        id={k}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        {...props}
      />
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <DashboardShell mode="admin">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-accent">Packages</p>
          <h1 className="mt-2 font-display text-4xl font-bold">Package management</h1>
          <p className="mt-2 text-muted-foreground">
            Create, edit, activate and remove learning packages.
          </p>
        </div>
        <Button onClick={() => openForm(null)}>
          <Plus />
          Add package
        </Button>
      </div>
      <section className="mt-8 overflow-x-auto rounded-lg bg-surface border border-line">
        {isPending ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6">
            <p className="text-sm text-destructive">
              Could not load packages: {error instanceof Error ? error.message : "unknown error"}
            </p>
            <Button className="mt-3" size="sm" variant="outline" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="p-6">
            <p className="font-semibold">No packages yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first learning package to get started.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted-foreground">
                <th className="p-4">Package</th>
                <th className="p-4">Price</th>
                <th className="p-4">Discount</th>
                <th className="p-4">Courses</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {data!.map((p) => {
                const active = p.status === "published";
                return (
                  <tr key={p.id}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {p.thumbnail_url ? (
                          <img
                            src={p.thumbnail_url}
                            alt=""
                            className="h-10 w-14 rounded object-cover ring-1 ring-ink/20"
                          />
                        ) : (
                          <div className="h-10 w-14 rounded bg-muted ring-1 ring-ink/20" />
                        )}
                        <span className="font-semibold">{p.name}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="font-semibold">{money(p.selling_price)}</span>
                      {p.original_price > p.selling_price && (
                        <span className="ml-2 text-xs text-muted-foreground line-through">
                          {money(p.original_price)}
                        </span>
                      )}
                    </td>
                    <td className="p-4">{discount(p.original_price, p.selling_price)}</td>
                    <td className="p-4">{p.course_count}</td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ring-1 ${active ? "text-success ring-success/40" : "text-muted-foreground ring-ink/20"}`}
                      >
                        {statusLabel[p.status]}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`View ${p.name}`}
                          onClick={() => setViewing(p)}
                        >
                          <Eye />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggleM.isPending}
                          onClick={() => toggleM.mutate({ data: { id: p.id, active: !active } })}
                        >
                          {active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setCoursesFor(p)}>
                          <BookOpen />
                          Courses
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => openForm(p)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${p.name}`}
                          disabled={delM.isPending}
                          onClick={() => setDeleting(p)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit package" : "New package"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            {field("name", "Package name *")}
            <div className="grid gap-1.5">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              {errors["description"] && (
                <p className="text-xs text-destructive">{errors["description"]}</p>
              )}
            </div>
            {field("thumbnail_url", "Thumbnail image URL", { placeholder: "https://…" })}
            {/^https?:\/\//.test(form.thumbnail_url) && (
              <img
                src={form.thumbnail_url}
                alt="Thumbnail preview"
                className="h-32 w-full rounded-md object-cover ring-1 ring-ink/20"
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("original_price", "Original price *", {
                type: "number",
                min: 0,
                step: "0.01",
              })}
              {field("selling_price", "Selling price *", { type: "number", min: 0, step: "0.01" })}
            </div>
            <section className="grid gap-3 rounded-md border border-line p-4">
              <div>
                <h3 className="font-semibold">Affiliate commission</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Applied only to verified real purchases attributed to an affiliate promo code.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="commission_type">Commission type</Label>
                  <select
                    id="commission_type"
                    value={form.commission_type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        commission_type: e.target.value as Form["commission_type"],
                      })
                    }
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed amount (₹)</option>
                  </select>
                </div>
                {field(
                  "commission_value",
                  form.commission_type === "percentage" ? "Commission (%)" : "Commission (₹)",
                  {
                    type: "number",
                    min: 0,
                    max: form.commission_type === "percentage" ? 100 : 10_000_000,
                    step: "0.01",
                  },
                )}
              </div>
            </section>
            <p className="-mt-2 text-xs text-muted-foreground">
              Discount:{" "}
              <span className="font-semibold text-foreground">
                {discount(Number(form.original_price) || 0, Number(form.selling_price) || 0)}
              </span>
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("validity_days", "Validity (days)", {
                type: "number",
                min: 1,
                placeholder: "Lifetime",
              })}
              {field("display_order", "Display order", { type: "number", min: 0 })}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="published">Active</option>
                <option value="draft">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Assigned courses</Label>
              {editing ? (
                <div className="flex items-center justify-between gap-2 rounded-md p-3 ring-1 ring-ink/20">
                  <span className="text-sm">
                    {editing.course_count} course{editing.course_count === 1 ? "" : "s"} assigned
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCoursesFor(editing)}
                  >
                    <BookOpen />
                    Manage courses
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Save this package first, then edit it to assign courses.
                </p>
              )}
            </div>
            <PackageIncludesSection packageId={editing?.id ?? null} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveM.isPending}>
                {saveM.isPending ? "Saving…" : editing ? "Save changes" : "Create package"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{viewing.name}</DialogTitle>
              </DialogHeader>
              {viewing.thumbnail_url && (
                <img
                  src={viewing.thumbnail_url}
                  alt=""
                  className="h-40 w-full rounded-md object-cover ring-1 ring-ink/20"
                />
              )}
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {viewing.description}
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Original price", money(viewing.original_price)],
                  ["Selling price", money(viewing.selling_price)],
                  ["Discount", discount(viewing.original_price, viewing.selling_price)],
                  ["Status", statusLabel[viewing.status]],
                  ["Courses", String(viewing.course_count)],
                  [
                    "Validity",
                    viewing.validity_days ? `${viewing.validity_days} days` : "Lifetime",
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md p-3 ring-1 ring-ink/15">
                    <dt className="text-xs uppercase text-muted-foreground">{k}</dt>
                    <dd className="mt-1 font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <PackageIncludesSection packageId={viewing.id} />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    const p = viewing;
                    setViewing(null);
                    setCoursesFor(p);
                  }}
                >
                  <BookOpen />
                  Courses
                </Button>
                <Button
                  onClick={() => {
                    const p = viewing;
                    setViewing(null);
                    openForm(p);
                  }}
                >
                  <Pencil />
                  Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the package and its course assignments. Packages with orders
              cannot be deleted — deactivate them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && delM.mutate({ data: { id: deleting.id } })}
            >
              Delete package
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PackageCoursesDialog
        pkg={coursesFor}
        onClose={() => {
          setCoursesFor(null);
          refresh();
        }}
      />
    </DashboardShell>
  );
}
