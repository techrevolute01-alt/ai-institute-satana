import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/skillora/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requireRole } from "@/lib/auth";
import {
  deleteAdminQuiz,
  getAdminQuizData,
  quizQuestionSchema,
  saveAdminQuiz,
  type AdminQuiz,
  type QuizQuestion,
} from "@/lib/quiz.functions";

export const Route = createFileRoute("/_authenticated/admin/quizzes")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  head: () => ({
    meta: [
      { title: "Quizzes — AI Institute" },
      { name: "description", content: "Create and manage course quizzes." },
    ],
  }),
  component: Page,
});

type QuizForm = {
  title: string;
  description: string;
  course_id: string;
  section_id: string;
  passing_percentage: string;
  time_limit_minutes: string;
  max_attempts: string;
  status: "draft" | "published" | "inactive";
  questions: QuizQuestion[];
};

type QuestionEditor = {
  id: string | null;
  type: "single_choice" | "true_false";
  text: string;
  marks: string;
  explanation: string;
  options: { id: string; text: string }[];
  correct_option_id: string;
  correct_answer: boolean;
};

const emptyQuestion = (): QuestionEditor => ({
  id: null,
  type: "single_choice",
  text: "",
  marks: "1",
  explanation: "",
  options: [
    { id: crypto.randomUUID(), text: "" },
    { id: crypto.randomUUID(), text: "" },
  ],
  correct_option_id: "",
  correct_answer: true,
});

const emptyForm: QuizForm = {
  title: "",
  description: "",
  course_id: "",
  section_id: "",
  passing_percentage: "70",
  time_limit_minutes: "",
  max_attempts: "1",
  status: "draft",
  questions: [],
};

const controlClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";

function Page() {
  const queryClient = useQueryClient();
  const load = useServerFn(getAdminQuizData);
  const save = useServerFn(saveAdminQuiz);
  const remove = useServerFn(deleteAdminQuiz);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-quizzes"],
    queryFn: () => load(),
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<AdminQuiz | null>(null);
  const [form, setForm] = useState<QuizForm>(emptyForm);
  const [editor, setEditor] = useState<QuestionEditor>(emptyQuestion);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<AdminQuiz | null>(null);
  const [formError, setFormError] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-quizzes"] });
  const reportError = (cause: unknown) =>
    toast.error(cause instanceof Error ? cause.message : "Something went wrong.");

  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success(editing ? "Quiz updated." : "Quiz created.");
      setOpen(false);
      refresh();
    },
    onError: (cause) => {
      const message = cause instanceof Error ? cause.message : "Could not save this quiz.";
      setFormError(message);
      reportError(cause);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      toast.success("Quiz deleted.");
      refresh();
    },
    onError: reportError,
  });

  const visibleQuizzes = useMemo(
    () =>
      (data?.quizzes ?? []).filter((quiz) => {
        const matchesSearch = `${quiz.title} ${quiz.course_title}`
          .toLowerCase()
          .includes(search.trim().toLowerCase());
        return matchesSearch && (statusFilter === "all" || quiz.status === statusFilter);
      }),
    [data?.quizzes, search, statusFilter],
  );

  function openForm(quiz: AdminQuiz | null) {
    setEditing(quiz);
    setFormError("");
    setEditingQuestion(false);
    setEditor(emptyQuestion());
    setForm(
      quiz
        ? {
            title: quiz.title,
            description: quiz.description,
            course_id: quiz.course_id,
            section_id: quiz.section_id ?? "",
            passing_percentage: String(quiz.passing_score),
            time_limit_minutes:
              quiz.time_limit_minutes === null ? "" : String(quiz.time_limit_minutes),
            max_attempts: String(quiz.max_attempts),
            status: quiz.status,
            questions: quiz.questions,
          }
        : {
            ...emptyForm,
            course_id: data?.courses[0]?.id ?? "",
          },
    );
    setOpen(true);
  }

  function editQuestion(question: QuizQuestion) {
    setEditor({
      id: question.id,
      type: question.type,
      text: question.text,
      marks: String(question.marks),
      explanation: question.explanation,
      options: question.type === "single_choice" ? question.options : [],
      correct_option_id: question.type === "single_choice" ? question.correct_option_id : "",
      correct_answer: question.type === "true_false" ? question.correct_answer : true,
    });
    setEditingQuestion(true);
  }

  function saveQuestion() {
    const index = editor.id
      ? form.questions.findIndex((question) => question.id === editor.id)
      : form.questions.length;
    const draft =
      editor.type === "single_choice"
        ? {
            id: editor.id ?? crypto.randomUUID(),
            type: editor.type,
            text: editor.text,
            marks: Number(editor.marks),
            display_order: Math.max(0, index),
            explanation: editor.explanation,
            options: editor.options,
            correct_option_id: editor.correct_option_id,
          }
        : {
            id: editor.id ?? crypto.randomUUID(),
            type: editor.type,
            text: editor.text,
            marks: Number(editor.marks),
            display_order: Math.max(0, index),
            explanation: editor.explanation,
            correct_answer: editor.correct_answer,
          };
    const result = quizQuestionSchema.safeParse(draft);
    if (!result.success) {
      setFormError(result.error.issues[0]?.message ?? "Check the question fields.");
      return;
    }
    const nextQuestions = [...form.questions];
    if (editor.id && index >= 0) nextQuestions[index] = result.data;
    else nextQuestions.push(result.data);
    setForm({
      ...form,
      questions: nextQuestions.map((question, display_order) => ({
        ...question,
        display_order,
      })),
    });
    setEditor(emptyQuestion());
    setEditingQuestion(false);
    setFormError("");
  }

  function reorderQuestion(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= form.questions.length) return;
    const questions = [...form.questions];
    [questions[index], questions[target]] = [questions[target]!, questions[index]!];
    setForm({
      ...form,
      questions: questions.map((question, display_order) => ({ ...question, display_order })),
    });
  }

  function submitQuiz(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    saveMutation.mutate({
      data: {
        id: editing?.id,
        title: form.title,
        description: form.description,
        course_id: form.course_id,
        section_id: form.section_id || null,
        passing_percentage: Number(form.passing_percentage),
        time_limit_minutes: form.time_limit_minutes ? Number(form.time_limit_minutes) : null,
        max_attempts: Number(form.max_attempts),
        status: form.status,
        questions: form.questions,
      },
    });
  }

  function confirmDelete(quiz: AdminQuiz) {
    if (window.confirm(`Delete "${quiz.title}"? Quizzes with student attempts cannot be deleted.`))
      deleteMutation.mutate({ data: { id: quiz.id } });
  }

  const sections = (data?.sections ?? []).filter((section) => section.course_id === form.course_id);

  return (
    <DashboardShell mode="admin">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-accent">Learning operations</p>
          <h1 className="mt-2 font-display text-4xl font-bold">Quiz management</h1>
          <p className="mt-2 text-muted-foreground">
            Create course quizzes, manage question order, and preview before publishing.
          </p>
        </div>
        <Button onClick={() => openForm(null)} disabled={!data?.courses.length}>
          <Plus />
          Add quiz
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search quizzes or courses"
          aria-label="Search quizzes"
        />
        <select
          className={controlClass}
          aria-label="Filter by quiz status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <section className="mt-4 overflow-x-auto rounded-lg bg-surface border border-line">
        {isPending ? (
          <p className="p-6 text-sm text-muted-foreground">Loading quizzes…</p>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">{error.message}</p>
        ) : !data?.courses.length ? (
          <p className="p-6 text-sm text-muted-foreground">
            Create a course before adding its first quiz.
          </p>
        ) : visibleQuizzes.length === 0 ? (
          <div className="p-6">
            <p className="font-semibold">No quizzes found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a quiz or adjust the search and status filters.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted-foreground">
                <th className="p-4">Quiz</th>
                <th className="p-4">Course / section</th>
                <th className="p-4">Questions</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {visibleQuizzes.map((quiz) => (
                <tr key={quiz.id}>
                  <td className="p-4">
                    <p className="font-semibold">{quiz.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {new Date(quiz.created_at).toLocaleDateString()} · Updated{" "}
                      {new Date(quiz.updated_at).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="p-4">
                    <p>{quiz.course_title}</p>
                    {quiz.section_title && (
                      <p className="mt-1 text-xs text-muted-foreground">{quiz.section_title}</p>
                    )}
                  </td>
                  <td className="p-4">{quiz.questions.length}</td>
                  <td className="p-4">
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ring-1 ring-ink/20">
                      {quiz.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setPreview(quiz)}>
                        <Eye />
                        Preview
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${quiz.title}`}
                        onClick={() => openForm(quiz)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${quiz.title}`}
                        onClick={() => confirmDelete(quiz)}
                        disabled={deleteMutation.isPending}
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
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit quiz" : "Create quiz"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitQuiz} className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="quiz-title">Title</Label>
                <Input
                  id="quiz-title"
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="quiz-description">Instructions / description</Label>
                <Textarea
                  id="quiz-description"
                  rows={3}
                  maxLength={4000}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quiz-course">Course</Label>
                <select
                  id="quiz-course"
                  className={controlClass}
                  required
                  value={form.course_id}
                  onChange={(event) =>
                    setForm({ ...form, course_id: event.target.value, section_id: "" })
                  }
                >
                  <option value="">Select course</option>
                  {(data?.courses ?? []).map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quiz-section">Course section (optional)</Label>
                <select
                  id="quiz-section"
                  className={controlClass}
                  value={form.section_id}
                  onChange={(event) => setForm({ ...form, section_id: event.target.value })}
                >
                  <option value="">Entire course</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quiz-passing">Passing percentage</Label>
                <Input
                  id="quiz-passing"
                  type="number"
                  min={0}
                  max={100}
                  required
                  value={form.passing_percentage}
                  onChange={(event) => setForm({ ...form, passing_percentage: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quiz-time">Time limit in minutes (optional)</Label>
                <Input
                  id="quiz-time"
                  type="number"
                  min={1}
                  max={1440}
                  value={form.time_limit_minutes}
                  onChange={(event) => setForm({ ...form, time_limit_minutes: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quiz-attempts">Maximum attempts</Label>
                <Input
                  id="quiz-attempts"
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={form.max_attempts}
                  onChange={(event) => setForm({ ...form, max_attempts: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quiz-status">Status</Label>
                <select
                  id="quiz-status"
                  className={controlClass}
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value as QuizForm["status"] })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <section className="rounded-md border border-ink/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Questions ({form.questions.length})</h3>
                  <p className="text-xs text-muted-foreground">
                    Published quizzes require valid questions and positive total marks.
                  </p>
                </div>
                {!editingQuestion && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditor(emptyQuestion());
                      setEditingQuestion(true);
                    }}
                  >
                    <Plus />
                    Add question
                  </Button>
                )}
              </div>
              {form.questions.length > 0 && (
                <ol className="mt-3 grid gap-2">
                  {form.questions.map((question, index) => (
                    <li
                      key={question.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background p-3 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="mr-2 text-xs font-semibold text-muted-foreground">
                          {index + 1}.
                        </span>
                        {question.text}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {question.type === "true_false" ? "True/False" : "Multiple choice"} ·{" "}
                          {question.marks} {question.marks === 1 ? "mark" : "marks"}
                        </span>
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Move question ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => reorderQuestion(index, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Move question ${index + 1} down`}
                          disabled={index === form.questions.length - 1}
                          onClick={() => reorderQuestion(index, 1)}
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => editQuestion(question)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setForm({
                              ...form,
                              questions: form.questions
                                .filter((item) => item.id !== question.id)
                                .map((item, display_order) => ({ ...item, display_order })),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {editingQuestion && (
                <div className="mt-4 grid gap-3 border-t border-ink/10 pt-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                    <div className="grid gap-1.5">
                      <Label htmlFor="question-text">Question text</Label>
                      <Textarea
                        id="question-text"
                        rows={2}
                        value={editor.text}
                        onChange={(event) => setEditor({ ...editor, text: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="question-type">Question type</Label>
                      <select
                        id="question-type"
                        className={controlClass}
                        value={editor.type}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            type: event.target.value as QuestionEditor["type"],
                            options:
                              event.target.value === "single_choice" && editor.options.length < 2
                                ? [
                                    { id: crypto.randomUUID(), text: "" },
                                    { id: crypto.randomUUID(), text: "" },
                                  ]
                                : editor.options,
                          })
                        }
                      >
                        <option value="single_choice">Multiple choice</option>
                        <option value="true_false">True / False</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                    <div className="grid gap-1.5">
                      <Label htmlFor="question-marks">Marks</Label>
                      <Input
                        id="question-marks"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={editor.marks}
                        onChange={(event) => setEditor({ ...editor, marks: event.target.value })}
                      />
                    </div>
                    {editor.type === "true_false" ? (
                      <fieldset className="grid gap-1.5">
                        <legend className="text-sm font-medium">Correct answer</legend>
                        <div className="flex gap-4 pt-2 text-sm">
                          {[true, false].map((value) => (
                            <label key={String(value)} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="correct-boolean"
                                checked={editor.correct_answer === value}
                                onChange={() => setEditor({ ...editor, correct_answer: value })}
                              />
                              {value ? "True" : "False"}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ) : (
                      <fieldset className="grid gap-2">
                        <legend className="text-sm font-medium">
                          Options (choose one correct answer)
                        </legend>
                        {editor.options.map((option, index) => (
                          <div key={option.id} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="correct-option"
                              aria-label={`Mark option ${index + 1} correct`}
                              checked={editor.correct_option_id === option.id}
                              onChange={() =>
                                setEditor({ ...editor, correct_option_id: option.id })
                              }
                            />
                            <Input
                              aria-label={`Option ${index + 1} text`}
                              value={option.text}
                              onChange={(event) =>
                                setEditor({
                                  ...editor,
                                  options: editor.options.map((item) =>
                                    item.id === option.id
                                      ? { ...item, text: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                            {editor.options.length > 2 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Remove option ${index + 1}`}
                                onClick={() =>
                                  setEditor({
                                    ...editor,
                                    options: editor.options.filter((item) => item.id !== option.id),
                                    correct_option_id:
                                      editor.correct_option_id === option.id
                                        ? ""
                                        : editor.correct_option_id,
                                  })
                                }
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        ))}
                        {editor.options.length < 20 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-fit"
                            onClick={() =>
                              setEditor({
                                ...editor,
                                options: [...editor.options, { id: crypto.randomUUID(), text: "" }],
                              })
                            }
                          >
                            Add option
                          </Button>
                        )}
                      </fieldset>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="question-explanation">
                      Explanation after submission (optional)
                    </Label>
                    <Textarea
                      id="question-explanation"
                      rows={2}
                      value={editor.explanation}
                      onChange={(event) =>
                        setEditor({ ...editor, explanation: event.target.value })
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={saveQuestion}>
                      Save question
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingQuestion(false);
                        setEditor(emptyQuestion());
                        setFormError("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending || !form.course_id}>
                {saveMutation.isPending && <Loader2 className="animate-spin" />}
                {editing ? "Save changes" : "Create quiz"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(preview)} onOpenChange={(value) => !value && setPreview(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.title} — Preview</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="grid gap-5">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {preview.description || "No instructions provided."}
              </p>
              <ol className="grid gap-4">
                {preview.questions.map((question, index) => (
                  <li key={question.id} className="rounded-md border border-ink/15 p-4">
                    <p className="font-semibold">
                      {index + 1}. {question.text}
                    </p>
                    {question.type === "single_choice" ? (
                      <ul className="mt-3 grid gap-2">
                        {question.options.map((option) => (
                          <li key={option.id} className="flex items-center gap-2 text-sm">
                            <span className="size-4 rounded-full border border-ink/50" />
                            {option.text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm">True / False</p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      {question.marks} {question.marks === 1 ? "mark" : "marks"}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Close preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
