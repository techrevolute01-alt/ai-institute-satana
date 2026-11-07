import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, X, Loader2 } from "lucide-react";
import {
  getPackageAssignments,
  assignCourse,
  assignCourses,
  unassignCourse,
} from "@/lib/package-courses.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PackageCoursesDialog({
  pkg,
  onClose,
}: {
  pkg: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getPackageAssignments);
  const add = useServerFn(assignCourse);
  const remove = useServerFn(unassignCourse);
  const addMany = useServerFn(assignCourses);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const key = ["package-courses", pkg?.id];
  const { data, isPending, error } = useQuery({
    queryKey: key,
    enabled: !!pkg,
    queryFn: () => load({ data: { packageId: pkg!.id } }),
  });
  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
  };
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Could not update package.");
  const addM = useMutation({
    mutationFn: (courseId: string) => add({ data: { packageId: pkg!.id, courseId } }),
    onSuccess: () => done("Course added."),
    onError,
  });
  const delM = useMutation({
    mutationFn: (courseId: string) => remove({ data: { packageId: pkg!.id, courseId } }),
    onSuccess: () => done("Course removed."),
    onError,
  });
  const bulkM = useMutation({
    mutationFn: () => addMany({ data: { packageId: pkg!.id, courseIds: [...picked] } }),
    onSuccess: (r) => {
      setPicked(new Set());
      done(
        r.added
          ? `${r.added} course${r.added === 1 ? "" : "s"} added.`
          : "Those courses are already assigned.",
      );
    },
    onError,
  });
  const assigned = useMemo(() => new Set(data?.assignedIds ?? []), [data]);
  const byId = new Map((data?.courses ?? []).map((c) => [c.id, c]));
  const assignedList = (data?.assignedIds ?? [])
    .map((id) => byId.get(id))
    .filter(Boolean) as NonNullable<ReturnType<typeof byId.get>>[];
  const available = (data?.courses ?? []).filter(
    (c) =>
      !assigned.has(c.id) &&
      `${c.title} ${c.instructor} ${c.category}`.toLowerCase().includes(q.toLowerCase()),
  );
  const busy = addM.isPending || delM.isPending || bulkM.isPending;

  return (
    <Dialog
      open={!!pkg}
      onOpenChange={(o) => {
        if (!o) {
          setQ("");
          setPicked(new Set());
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Courses in {pkg?.name}</DialogTitle>
        </DialogHeader>
        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading courses…
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">Could not load courses.</p>
        ) : (
          <div className="grid gap-6">
            <section>
              <h3 className="font-display text-lg font-semibold">
                Assigned courses ({assignedList.length})
              </h3>
              {assignedList.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No courses assigned yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-ink/10 rounded-md border border-line">
                  {assignedList.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.instructor} · {c.level}
                          {c.status !== "published" && ` · ${c.status}`}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => delM.mutate(c.id)}
                        aria-label={`Remove ${c.title}`}
                      >
                        <X />
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">Available courses</h3>
                <Button
                  size="sm"
                  disabled={busy || picked.size === 0}
                  onClick={() => bulkM.mutate()}
                >
                  {bulkM.isPending ? <Loader2 className="animate-spin" /> : <Plus />}Add selected (
                  {picked.size})
                </Button>
              </div>
              <Input
                className="mt-2"
                placeholder="Search courses"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {available.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {(data?.courses.length ?? 0) === 0
                    ? "No courses exist yet."
                    : "No matching courses."}
                </p>
              ) : (
                <ul className="mt-2 max-h-72 divide-y divide-ink/10 overflow-y-auto rounded-md border border-line">
                  {available.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={picked.has(c.id)}
                          onChange={(e) => {
                            const n = new Set(picked);
                            if (e.target.checked) n.add(c.id);
                            else n.delete(c.id);
                            setPicked(n);
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{c.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {c.instructor} · {c.category} · {c.level}
                            {c.status !== "published" && ` · ${c.status}`}
                          </span>
                        </span>
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => addM.mutate(c.id)}
                      >
                        <Plus />
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
