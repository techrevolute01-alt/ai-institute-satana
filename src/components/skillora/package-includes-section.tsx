import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import {
  getPackageIncludes,
  addPackageInclude,
  removePackageInclude,
} from "@/lib/package-includes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function PackageIncludesSection({ packageId }: { packageId: string | null }) {
  const qc = useQueryClient();
  const load = useServerFn(getPackageIncludes);
  const add = useServerFn(addPackageInclude);
  const remove = useServerFn(removePackageInclude);
  const [q, setQ] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const key = ["package-includes", packageId];
  const { data, isPending, error } = useQuery({
    queryKey: key,
    enabled: !!packageId,
    queryFn: () => load({ data: { packageId: packageId! } }),
  });
  const done = (m: string) => {
    toast.success(m);
    qc.invalidateQueries({ queryKey: ["package-includes"] });
  };
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Could not update included packages.");
  const addM = useMutation({
    mutationFn: (id: string) => add({ data: { packageId: packageId!, includedId: id } }),
    onSuccess: () => done("Package included."),
    onError,
  });
  const delM = useMutation({
    mutationFn: (id: string) => remove({ data: { packageId: packageId!, includedId: id } }),
    onSuccess: () => done("Package removed."),
    onError,
  });

  if (!packageId)
    return (
      <div className="grid gap-1.5">
        <Label>Included packages</Label>
        <p className="text-xs text-muted-foreground">
          Save this package first, then edit it to include other packages.
        </p>
      </div>
    );

  const included = new Set(data?.includedIds ?? []);
  const blocked = new Set(data?.blockedIds ?? []);
  const byId = new Map((data?.packages ?? []).map((p) => [p.id, p]));
  const available = (data?.packages ?? []).filter(
    (p) =>
      !included.has(p.id) && !blocked.has(p.id) && p.name.toLowerCase().includes(q.toLowerCase()),
  );
  const busy = addM.isPending || delM.isPending;

  return (
    <div className="grid gap-2">
      <Label>Included packages</Label>
      {isPending ? (
        <div className="h-16 animate-pulse rounded-md bg-muted" />
      ) : error ? (
        <p className="text-xs text-destructive">Could not load packages.</p>
      ) : (
        <>
          {included.size === 0 ? (
            <p className="text-xs text-muted-foreground">No included packages.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {[...included].map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-ink/30"
                >
                  {byId.get(id)?.name ?? "Package"}
                  <button
                    type="button"
                    aria-label={`Remove ${byId.get(id)?.name ?? "package"}`}
                    disabled={busy}
                    onClick={() => setConfirmId(id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Input
            placeholder="Search packages to include…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="max-h-40 divide-y divide-ink/10 overflow-y-auto rounded-md ring-1 ring-ink/20">
            {available.length === 0 ? (
              <li className="p-3 text-xs text-muted-foreground">No packages available.</li>
            ) : (
              available.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                  <span>
                    {p.name}
                    {p.status !== "published" && (
                      <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                    )}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => addM.mutate(p.id)}
                  >
                    <Plus />
                    Include
                  </Button>
                </li>
              ))
            )}
          </ul>
          <p className="text-xs text-muted-foreground">
            Packages that already include this one are hidden to prevent loops.
          </p>
        </>
      )}
      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove “{confirmId ? byId.get(confirmId)?.name : ""}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Students who buy this package will no longer get access to the courses in the removed
              package. Existing packages and courses are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmId) delM.mutate(confirmId);
                setConfirmId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
