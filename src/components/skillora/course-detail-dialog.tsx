import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, PlayCircle, ChevronUp, ChevronDown, Eye } from "lucide-react";
import {
  getCourseDetail,
  saveSection,
  deleteSection,
  saveLesson,
  deleteLesson,
  getAdminLessonVideoUrl,
  reorderLesson,
  lessonSchema,
  type CourseLesson,
  type AdminCourse,
} from "@/lib/admin-courses.functions";
import { assignCourse, unassignCourse } from "@/lib/package-courses.functions";
import { LessonVideo } from "@/components/skillora/lesson-video";
import {
  COURSE_VIDEO_MAX_SIZE_MIB,
  getCourseVideoFilename,
  isCourseVideoPath,
  uploadCourseVideo,
  validateCourseVideo,
} from "@/lib/course-video-storage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LessonForm = {
  id?: string;
  sectionId: string;
  title: string;
  description: string;
  video_path: string;
  duration_minutes: string;
  status: "draft" | "published" | "archived";
  sort_order: string;
};

export function CourseDetailDialog({
  course,
  onClose,
}: {
  course: AdminCourse | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const load = useServerFn(getCourseDetail);
  const saveS = useServerFn(saveSection),
    delS = useServerFn(deleteSection),
    saveL = useServerFn(saveLesson),
    delL = useServerFn(deleteLesson),
    reorderL = useServerFn(reorderLesson);
  const add = useServerFn(assignCourse),
    remove = useServerFn(unassignCourse);
  const key = ["course-detail", course?.id];
  const { data, isPending, error } = useQuery({
    queryKey: key,
    enabled: !!course,
    queryFn: () => load({ data: { courseId: course!.id } }),
  });
  const [newSection, setNewSection] = useState("");
  const [lesson, setLesson] = useState<LessonForm | null>(null);
  const [lessonErr, setLessonErr] = useState<Record<string, string>>({});
  const [previewVideo, setPreviewVideo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "ready" | "uploading" | "success" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState("");
  const videoInputRef = useRef<HTMLInputElement>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
    qc.invalidateQueries({ queryKey: ["package-courses"] });
  };
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Something went wrong.");
  const ok = (m: string) => () => {
    toast.success(m);
    refresh();
  };

  const secM = useMutation({
    mutationFn: saveS,
    onSuccess: () => {
      setNewSection("");
      ok("Section saved.")();
    },
    onError,
  });
  const delSecM = useMutation({ mutationFn: delS, onSuccess: ok("Section deleted."), onError });
  const lesM = useMutation({
    mutationFn: saveL,
    onSuccess: () => {
      setLesson(null);
      ok("Lesson saved.")();
    },
    onError,
  });
  const delLesM = useMutation({ mutationFn: delL, onSuccess: ok("Lesson deleted."), onError });
  const uploadM = useMutation({
    mutationFn: (input: { file: File; courseId: string; sectionId: string }) =>
      uploadCourseVideo(input.file, input.courseId, input.sectionId, setUploadProgress),
    onMutate: () => {
      setUploadProgress(0);
      setUploadError("");
      setUploadStatus("uploading");
    },
    onSuccess: (videoPath) => {
      setLesson((current) => (current ? { ...current, video_path: videoPath } : current));
      setSelectedVideo(null);
      setUploadStatus("success");
      setPreviewUrl(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
      toast.success("Video uploaded successfully.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Video upload failed.";
      setUploadError(message);
      setUploadStatus("error");
      toast.error(message);
    },
  });
  const previewM = useMutation({
    mutationFn: (videoPath: string) => getAdminLessonVideoUrl({ data: { videoPath } }),
    onSuccess: ({ signedUrl }) => {
      setPreviewUrl(signedUrl);
      setPreviewVideo(true);
    },
    onError,
  });
  const reorderM = useMutation({
    mutationFn: reorderL,
    onSuccess: ok("Lesson order updated."),
    onError,
  });
  const pkgM = useMutation({
    mutationFn: (v: { packageId: string; link: boolean }) =>
      (v.link ? add : remove)({ data: { packageId: v.packageId, courseId: course!.id } }),
    onSuccess: (_, v) => ok(v.link ? "Added to package." : "Removed from package.")(),
    onError,
  });

  const sections = data?.sections ?? [];
  function editLesson(sectionId: string, l?: CourseLesson) {
    setLessonErr({});
    setPreviewVideo(false);
    setPreviewUrl(null);
    setSelectedVideo(null);
    setUploadProgress(0);
    setUploadStatus("idle");
    setUploadError("");
    const count = sections.find((s) => s.id === sectionId)?.lessons.length ?? 0;
    setLesson(
      l
        ? {
            id: l.id,
            sectionId,
            title: l.title,
            description: l.description,
            video_path: l.video_path ?? "",
            duration_minutes: String(l.duration_minutes),
            status: l.status,
            sort_order: String(l.sort_order),
          }
        : {
            sectionId,
            title: "",
            description: "",
            video_path: "",
            duration_minutes: "0",
            status: "draft",
            sort_order: String(count),
          },
    );
  }
  function submitLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!lesson) return;
    const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
    const parsed = lessonSchema.safeParse({
      title: lesson.title,
      description: lesson.description,
      video_path: lesson.video_path,
      duration_minutes: num(lesson.duration_minutes),
      status: lesson.status,
      sort_order: num(lesson.sort_order),
    });
    if (!parsed.success) {
      const m: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        m[String(i.path[0])] ??= i.message;
      });
      setLessonErr(m);
      return;
    }
    lesM.mutate({ data: { id: lesson.id, sectionId: lesson.sectionId, values: parsed.data } });
  }
  const busy =
    secM.isPending ||
    delSecM.isPending ||
    delLesM.isPending ||
    pkgM.isPending ||
    reorderM.isPending ||
    uploadM.isPending;

  return (
    <>
      <Dialog
        open={!!course}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{course?.title}</DialogTitle>
          </DialogHeader>
          {course && (
            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              {course.thumbnail_url ? (
                <img
                  src={course.thumbnail_url}
                  alt=""
                  className="aspect-video w-full rounded-md object-cover border border-line"
                />
              ) : (
                <div className="grid aspect-video place-items-center rounded-md bg-paper text-xs text-muted-foreground border border-line">
                  No thumbnail
                </div>
              )}
              <div className="text-sm">
                <p className="text-muted-foreground">
                  {course.instructor} · {course.category} · {course.level} ·{" "}
                  {course.duration_minutes} min · <span className="uppercase">{course.status}</span>
                </p>
                <p className="mt-2 whitespace-pre-line">{course.description}</p>
              </div>
            </div>
          )}
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">
              Could not load course content:{" "}
              {error instanceof Error ? error.message : "An unexpected error occurred."}
            </p>
          ) : (
            <Tabs defaultValue="lessons">
              <TabsList>
                <TabsTrigger value="lessons">Video lessons</TabsTrigger>
                <TabsTrigger value="packages">Packages</TabsTrigger>
              </TabsList>
              <TabsContent value="lessons" className="grid gap-4">
                {sections.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No sections yet. Add a section, then add video lessons to it.
                  </p>
                )}
                {sections.map((s) => (
                  <section key={s.id} className="rounded-md border border-line">
                    <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                      <p className="font-semibold">{s.title}</p>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => editLesson(s.id)}>
                          <Plus />
                          Lesson
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Rename ${s.title}`}
                          disabled={busy}
                          onClick={() => {
                            const t = prompt("Section title", s.title);
                            if (t && t.trim())
                              secM.mutate({
                                data: {
                                  id: s.id,
                                  courseId: course!.id,
                                  title: t,
                                  sort_order: s.sort_order,
                                },
                              });
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${s.title}`}
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`Delete section "${s.title}"?`))
                              delSecM.mutate({ data: { id: s.id } });
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    {s.lessons.length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground">
                        No lessons in this section.
                      </p>
                    ) : (
                      <ul className="divide-y divide-ink/10">
                        {s.lessons.map((l, index) => (
                          <li
                            key={l.id}
                            className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <PlayCircle className="size-4 shrink-0" />
                              <div className="min-w-0">
                                <p className="truncate font-medium">{l.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {l.duration_minutes} min · {l.status}
                                  {!l.video_path && " · No video yet"}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Move ${l.title} up`}
                                disabled={busy || index === 0}
                                onClick={() =>
                                  reorderM.mutate({ data: { id: l.id, direction: "up" } })
                                }
                              >
                                <ChevronUp />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Move ${l.title} down`}
                                disabled={busy || index === s.lessons.length - 1}
                                onClick={() =>
                                  reorderM.mutate({ data: { id: l.id, direction: "down" } })
                                }
                              >
                                <ChevronDown />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Edit ${l.title}`}
                                onClick={() => editLesson(s.id, l)}
                              >
                                <Pencil />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Delete ${l.title}`}
                                disabled={busy}
                                onClick={() => {
                                  if (confirm(`Delete lesson "${l.title}"?`))
                                    delLesM.mutate({ data: { id: l.id } });
                                }}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newSection.trim()) {
                      toast.error("Enter a section title.");
                      return;
                    }
                    secM.mutate({
                      data: {
                        courseId: course!.id,
                        title: newSection,
                        sort_order: sections.length,
                      },
                    });
                  }}
                >
                  <Input
                    placeholder="New section title, e.g. Getting started"
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                  />
                  <Button type="submit" variant="outline" disabled={secM.isPending}>
                    <Plus />
                    Add section
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="packages">
                {(data?.packages.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No packages exist yet.</p>
                ) : (
                  <ul className="divide-y divide-ink/10 rounded-md border border-line">
                    {data!.packages.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span>
                          {p.name}
                          {p.status !== "published" && (
                            <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                          )}
                        </span>
                        <Button
                          size="sm"
                          variant={p.linked ? "ghost" : "outline"}
                          disabled={busy}
                          onClick={() => pkgM.mutate({ packageId: p.id, link: !p.linked })}
                        >
                          {p.linked ? "Remove" : "Add to package"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!lesson}
        onOpenChange={(o) => {
          if (!o && !uploadM.isPending) setLesson(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{lesson?.id ? "Edit lesson" : "New video lesson"}</DialogTitle>
          </DialogHeader>
          {lesson && (
            <form onSubmit={submitLesson} className="grid gap-4" noValidate>
              <div className="grid gap-1.5">
                <Label htmlFor="lt">Lesson title *</Label>
                <Input
                  id="lt"
                  value={lesson.title}
                  onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
                />
                {lessonErr["title"] && (
                  <p className="text-xs text-destructive">{lessonErr["title"]}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ldesc">Description *</Label>
                <textarea
                  id="ldesc"
                  rows={3}
                  maxLength={4000}
                  className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={lesson.description}
                  onChange={(e) => setLesson({ ...lesson, description: e.target.value })}
                />
                {lessonErr["description"] && (
                  <p className="text-xs text-destructive">{lessonErr["description"]}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lv">Video URL (optional)</Label>
                <Input
                  id="lv"
                  placeholder="https://…"
                  value={lesson.video_path}
                  onChange={(e) => {
                    setLesson({ ...lesson, video_path: e.target.value });
                    setPreviewUrl(null);
                    setPreviewVideo(false);
                  }}
                />
                {lessonErr["video_path"] && (
                  <p className="text-xs text-destructive">{lessonErr["video_path"]}</p>
                )}
              </div>
              <div className="grid gap-3 rounded-md border border-ink/20 p-3">
                <div>
                  <Label htmlFor="lesson-video-file">Upload Video</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    MP4 or WebM, up to {COURSE_VIDEO_MAX_SIZE_MIB} MiB.
                  </p>
                </div>
                <Input
                  ref={videoInputRef}
                  id="lesson-video-file"
                  type="file"
                  accept="video/mp4,video/webm,.mp4,.webm"
                  disabled={uploadM.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setSelectedVideo(file);
                    setUploadError("");
                    setUploadProgress(0);
                    setUploadStatus(file ? "ready" : "idle");
                    if (file) {
                      const validationError = validateCourseVideo(file);
                      if (validationError) {
                        setUploadStatus("error");
                        setUploadError(validationError);
                        toast.error(validationError);
                      }
                    }
                  }}
                />
                {selectedVideo && (
                  <p className="text-xs text-muted-foreground">
                    Selected:{" "}
                    <span className="font-medium text-foreground">{selectedVideo.name}</span>
                    {" · "}
                    {(selectedVideo.size / (1024 * 1024)).toFixed(1)} MiB
                  </p>
                )}
                {!selectedVideo && lesson.video_path && isCourseVideoPath(lesson.video_path) && (
                  <p className="text-xs text-muted-foreground">
                    Uploaded:{" "}
                    <span className="font-medium text-foreground">
                      {getCourseVideoFilename(lesson.video_path)}
                    </span>
                  </p>
                )}
                {uploadM.isPending && (
                  <div className="grid gap-1">
                    <div className="flex justify-between text-xs">
                      <span>Uploading video…</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-ink/10"
                      role="progressbar"
                      aria-label="Video upload progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={uploadProgress}
                    >
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                {uploadStatus === "ready" && (
                  <p className="text-xs text-muted-foreground">
                    Ready to upload. The current video stays in place until this upload succeeds.
                  </p>
                )}
                {uploadStatus === "success" && (
                  <p className="text-xs text-success">
                    Video uploaded. Save the lesson to apply it.
                  </p>
                )}
                {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  disabled={
                    !selectedVideo ||
                    uploadM.isPending ||
                    !!(selectedVideo && validateCourseVideo(selectedVideo))
                  }
                  onClick={() => {
                    if (!selectedVideo || !lesson) return;
                    const validationError = validateCourseVideo(selectedVideo);
                    if (validationError) {
                      setUploadStatus("error");
                      setUploadError(validationError);
                      toast.error(validationError);
                      return;
                    }
                    uploadM.mutate({
                      file: selectedVideo,
                      courseId: course!.id,
                      sectionId: lesson.sectionId,
                    });
                  }}
                >
                  {uploadM.isPending ? `Uploading… ${uploadProgress}%` : "Upload Video"}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="ld">Duration (minutes)</Label>
                  <Input
                    id="ld"
                    type="number"
                    min={0}
                    value={lesson.duration_minutes}
                    onChange={(e) => setLesson({ ...lesson, duration_minutes: e.target.value })}
                  />
                  {lessonErr["duration_minutes"] && (
                    <p className="text-xs text-destructive">{lessonErr["duration_minutes"]}</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lo">Order</Label>
                  <Input
                    id="lo"
                    type="number"
                    min={0}
                    value={lesson.sort_order}
                    onChange={(e) => setLesson({ ...lesson, sort_order: e.target.value })}
                  />
                  {lessonErr["sort_order"] && (
                    <p className="text-xs text-destructive">{lessonErr["sort_order"]}</p>
                  )}
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lesson-status">Publish status</Label>
                <select
                  id="lesson-status"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={lesson.status}
                  onChange={(e) =>
                    setLesson({ ...lesson, status: e.target.value as LessonForm["status"] })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                disabled={!lesson.video_path.trim() || previewM.isPending}
                onClick={() => {
                  if (previewVideo) {
                    setPreviewVideo(false);
                    return;
                  }
                  if (isCourseVideoPath(lesson.video_path)) {
                    previewM.mutate(lesson.video_path);
                  } else {
                    setPreviewUrl(lesson.video_path);
                    setPreviewVideo(true);
                  }
                }}
              >
                <Eye />
                {previewM.isPending
                  ? "Preparing preview…"
                  : previewVideo
                    ? "Hide preview"
                    : "Preview lesson"}
              </Button>
              {previewVideo && previewUrl && (
                <LessonVideo
                  key={previewUrl}
                  videoUrl={previewUrl}
                  title={lesson.title || "Lesson preview"}
                />
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setLesson(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={lesM.isPending || uploadM.isPending}>
                  {lesM.isPending ? "Saving…" : "Save lesson"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
