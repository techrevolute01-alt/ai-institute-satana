import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import { CourseDetailDialog } from "@/components/skillora/course-detail-dialog";
import { requireRole } from "@/lib/auth";
import {
  listAdminCourses,
  saveCourse,
  deleteCourse,
  courseSchema,
  type AdminCourse,
} from "@/lib/admin-courses.functions";
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

export const Route = createFileRoute("/_authenticated/admin/courses")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: () => ({
    meta: [
      { title: "Courses — AI Institute" },
      { name: "description", content: "Manage the course catalog." },
      { property: "og:title", content: "Courses — AI Institute" },
      { property: "og:description", content: "Manage the course catalog." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Form = {
  title: string;
  description: string;
  instructor: string;
  category: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  duration_minutes: string;
  thumbnail_url: string;
  status: "published" | "draft" | "archived";
};
const empty: Form = {
  title: "",
  description: "",
  instructor: "",
  category: "",
  level: "Beginner",
  duration_minutes: "0",
  thumbnail_url: "",
  status: "draft",
};
const statusLabel = { published: "Published", draft: "Draft", archived: "Archived" } as const;
const selectCls = "h-10 rounded-md border border-input bg-background px-3 text-sm";

function Page() {
  const qc = useQueryClient();
  const list = useServerFn(listAdminCourses);
  const save = useServerFn(saveCourse);
  const remove = useServerFn(deleteCourse);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: () => list(),
  });
  const [editing, setEditing] = useState<AdminCourse | null>(null);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<AdminCourse | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-courses"] });
    qc.invalidateQueries({ queryKey: ["package-courses"] });
  };
  const onErr = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Something went wrong.");
  const saveM = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success(editing ? "Course updated." : "Course created.");
      setOpen(false);
      refresh();
    },
    onError: onErr,
  });
  const delM = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      toast.success("Course deleted.");
      refresh();
    },
    onError: onErr,
  });

  function openForm(c: AdminCourse | null) {
    setEditing(c);
    setErrors({});
    setForm(
      c
        ? {
            title: c.title,
            description: c.description,
            instructor: c.instructor,
            category: c.category,
            level: c.level,
            duration_minutes: String(c.duration_minutes),
            thumbnail_url: c.thumbnail_url,
            status: c.status,
          }
        : empty,
    );
    setOpen(true);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = courseSchema.safeParse({
      ...form,
      duration_minutes: form.duration_minutes.trim() === "" ? NaN : Number(form.duration_minutes),
    });
    if (!parsed.success) {
      const m: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        m[String(i.path[0])] ??= i.message;
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
          <p className="text-xs font-semibold uppercase text-accent">Courses</p>
          <h1 className="mt-2 font-display text-4xl font-bold">Course management</h1>
          <p className="mt-2 text-muted-foreground">
            Create, edit and remove courses in the catalog.
          </p>
        </div>
        <Button onClick={() => openForm(null)}>
          <Plus />
          Add course
        </Button>
      </div>
      <section className="mt-8 overflow-x-auto rounded-lg bg-surface border border-line">
        {isPending ? (
          <p className="p-6 text-sm text-muted-foreground">Loading courses…</p>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">Could not load courses.</p>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="p-6">
            <p className="font-semibold">No courses yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first course to get started.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted-foreground">
                <th className="p-4">Title</th>
                <th className="p-4">Instructor</th>
                <th className="p-4">Category</th>
                <th className="p-4">Level</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {data!.map((c) => (
                <tr key={c.id}>
                  <td className="p-4 font-semibold">{c.title}</td>
                  <td className="p-4">{c.instructor}</td>
                  <td className="p-4">{c.category}</td>
                  <td className="p-4">{c.level}</td>
                  <td className="p-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ring-1 ${c.status === "published" ? "text-success ring-success/40" : "text-muted-foreground ring-ink/20"}`}
                    >
                      {statusLabel[c.status]}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setViewing(c)}>
                        <Eye />
                        View & lessons
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${c.title}`}
                        onClick={() => openForm(c)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${c.title}`}
                        disabled={delM.isPending}
                        onClick={() => {
                          if (confirm(`Delete "${c.title}"? This cannot be undone.`))
                            delM.mutate({ data: { id: c.id } });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit course" : "New course"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            {field("title", "Course title *")}
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
            <div className="grid gap-4 sm:grid-cols-2">
              {field("instructor", "Instructor *")}
              {field("category", "Category *")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="level">Level</Label>
                <select
                  id="level"
                  className={selectCls}
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value as Form["level"] })}
                >
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </div>
              {field("duration_minutes", "Duration (minutes)", { type: "number", min: 0 })}
            </div>
            {field("thumbnail_url", "Thumbnail image URL", { placeholder: "https://…" })}
            <div className="grid gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className={selectCls}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveM.isPending}>
                {saveM.isPending ? "Saving…" : editing ? "Save changes" : "Create course"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <CourseDetailDialog course={viewing} onClose={() => setViewing(null)} />
    </DashboardShell>
  );
}
