import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/skillora/dashboard";
import { LessonVideo } from "@/components/skillora/lesson-video";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import {
  getStudentPlayer,
  recordStudentLessonAccess,
  saveStudentLessonProgress,
} from "@/lib/student.functions";
import {
  getStudentQuizResult,
  getStudentQuizzes,
  resumeStudentQuizAttempt,
  startStudentQuizAttempt,
  submitStudentQuizAttempt,
  type QuizAttemptResult,
  type QuizAttemptStart,
  type QuizAttemptSession,
  type StudentQuiz,
} from "@/lib/quiz.functions";

export const Route = createFileRoute("/_authenticated/learn/$courseId")({
  beforeLoad: ({ location }) => requireRole("student", location.href),
  head: () => ({
    meta: [
      { title: "Course Player — AI Institute" },
      {
        name: "description",
        content: "Watch your purchased course lessons and track your progress.",
      },
      { property: "og:title", content: "Course Player — AI Institute" },
      {
        property: "og:description",
        content: "Watch your purchased course lessons and track your progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { courseId } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getStudentPlayer);
  const saveProgress = useServerFn(saveStudentLessonProgress);
  const recordAccess = useServerFn(recordStudentLessonAccess);
  const loadQuizzes = useServerFn(getStudentQuizzes);
  const startAttempt = useServerFn(startStudentQuizAttempt);
  const resumeAttempt = useServerFn(resumeStudentQuizAttempt);
  const submitAttempt = useServerFn(submitStudentQuizAttempt);
  const loadResult = useServerFn(getStudentQuizResult);
  const queryKey = ["student-player", courseId];
  const { data, isPending, error } = useQuery({
    queryKey,
    queryFn: () => load({ data: { courseId } }),
  });
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<StudentQuiz | null>(null);
  const [attempt, setAttempt] = useState<QuizAttemptStart | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [attemptResult, setAttemptResult] = useState<QuizAttemptResult | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [questionIndex, setQuestionIndex] = useState(0);
  const lessons = useMemo(() => data?.sections.flatMap((section) => section.lessons) ?? [], [data]);
  const lastAccessedLesson = lessons
    .filter((lesson) => lesson.last_accessed_at)
    .sort((a, b) => Date.parse(b.last_accessed_at ?? "") - Date.parse(a.last_accessed_at ?? ""))[0];
  const activeLesson =
    lessons.find((lesson) => lesson.id === activeLessonId) ?? lastAccessedLesson ?? lessons[0];
  const activeLessonIndex = activeLesson
    ? lessons.findIndex((lesson) => lesson.id === activeLesson.id)
    : -1;
  const completed = lessons.filter((lesson) => lesson.completed).length;
  const percent = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  type ProgressInput = { data: { lessonId: string; completed: boolean; progressSeconds: number } };
  const {
    data: quizzes,
    isPending: quizzesPending,
    error: quizzesError,
  } = useQuery({
    queryKey: ["student-quizzes", courseId],
    queryFn: () => loadQuizzes({ data: { courseId } }),
    enabled: Boolean(data),
  });

  const resultMutation = useMutation({
    mutationFn: (attemptId: string) => loadResult({ data: { attemptId } }),
    onSuccess: (result) => setAttemptResult(result),
    onError: (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Could not load this quiz result."),
  });
  type StartInput = { data: { quizId: string } };
  const startMutation = useMutation({
    mutationFn: (input: StartInput) => startAttempt(input),
    onSuccess: (started, variables) => {
      const quiz = quizzes?.find((item) => item.id === variables.data.quizId);
      if (quiz) setActiveQuiz(quiz);
      setAttempt(started);
      setAttemptResult(null);
      setAnswers({});
      setClock(Date.now());
    },
    onError: (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Could not start this quiz."),
  });
  type ResumeInput = { data: { attemptId: string } };
  const resumeMutation = useMutation<QuizAttemptSession, Error, { data: { attemptId: string } }>({
    mutationFn: (input: ResumeInput) => resumeAttempt(input),
    onSuccess: (resumed, variables) => {
      if ("status" in resumed) {
        toast.error(resumed.message ?? "This quiz attempt has expired.");
        queryClient.invalidateQueries({ queryKey: ["student-quizzes", courseId] });
        return;
      }
      const quiz = quizzes?.find((item) =>
        item.attempts.some((itemAttempt) => itemAttempt.id === variables.data.attemptId),
      );
      if (quiz) setActiveQuiz(quiz);
      setAttempt(resumed);
      setAttemptResult(null);
      setAnswers({});
      setClock(Date.now());
    },
    onError: (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Could not resume this quiz."),
  });
  type SubmitInput = { data: { attemptId: string; answers: Record<string, string | boolean> } };
  const submitMutation = useMutation({
    mutationFn: (input: SubmitInput) => submitAttempt(input),
    onSuccess: async (submission, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["student-quizzes", courseId] });
      const refreshedQuizzes = queryClient.getQueryData<StudentQuiz[]>([
        "student-quizzes",
        courseId,
      ]);
      setActiveQuiz((current) =>
        current ? (refreshedQuizzes?.find((quiz) => quiz.id === current.id) ?? current) : current,
      );
      if (submission.status === "timed_out") {
        toast.error(submission.message ?? "The quiz time limit expired.");
        setAttempt(null);
        setAnswers({});
        return;
      }
      const result = await loadResult({ data: { attemptId: variables.data.attemptId } });
      setAttemptResult(result);
      toast.success("Quiz submitted. Your result is ready.");
    },
    onError: (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Could not submit this quiz."),
  });
  const submitQuiz = submitMutation.mutate;
  const remainingSeconds =
    attempt?.time_limit_minutes === null || !attempt
      ? null
      : Math.max(
          0,
          Math.ceil(
            (Date.parse(attempt.started_at) + attempt.time_limit_minutes * 60_000 - clock) / 1000,
          ),
        );

  useEffect(() => {
    if (!attempt?.time_limit_minutes) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);

  useEffect(() => {
    if (!attempt || remainingSeconds !== 0 || submitMutation.isPending || attemptResult) return;
    submitQuiz({ data: { attemptId: attempt.attempt_id, answers } });
  }, [attempt, remainingSeconds, submitMutation.isPending, attemptResult, answers, submitQuiz]);

  const progressMutation = useMutation({
    mutationFn: (input: ProgressInput) => saveProgress(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["my-courses"] }),
        queryClient.invalidateQueries({ queryKey: ["student-overview"] }),
      ]);
      toast.success("Lesson progress saved.");
    },
    onError: (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Could not save lesson progress."),
  });
  const lessonAccessMutation = useMutation({
    mutationFn: (lessonId: string) => recordAccess({ data: { lessonId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-courses"] }),
        queryClient.invalidateQueries({ queryKey: ["student-overview"] }),
      ]);
    },
    onError: (cause) =>
      toast.error(cause instanceof Error ? cause.message : "Could not save your recent lesson."),
  });
  const recordLessonAccess = lessonAccessMutation.mutate;

  useEffect(() => {
    const lessonId = activeLesson?.id;
    if (lessonId) recordLessonAccess(lessonId);
  }, [activeLesson?.id, recordLessonAccess]);

  function openQuiz(quiz: StudentQuiz) {
    setActiveQuiz(quiz);
    setAttempt(null);
    setAttemptResult(null);
    setAnswers({});
  }

  function viewQuizResult(quiz: StudentQuiz, attemptId: string) {
    setActiveQuiz(quiz);
    setAttempt(null);
    setAnswers({});
    setAttemptResult(null);
    resultMutation.mutate(attemptId);
  }

  const currentQuestion = attempt?.questions[0]
    ? (attempt.questions[questionIndex] ?? attempt.questions[0])
    : null;

  useEffect(() => {
    setQuestionIndex(0);
  }, [attempt?.attempt_id]);

  return (
    <DashboardShell mode="student">
      <Link
        to="/my-courses"
        className="inline-flex items-center gap-2 text-sm font-semibold hover:underline"
      >
        <ArrowLeft className="size-4" />
        My Courses
      </Link>
      {isPending ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading course…
        </p>
      ) : error ? (
        <div className="mt-6 rounded-lg bg-surface p-6 border border-line">
          <h1 className="font-display text-2xl font-bold">Course unavailable</h1>
          <p className="mt-2 text-sm text-destructive">
            {error.message || "You may not have access to this course."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Only published courses included in your purchases are available in the course player.
          </p>
        </div>
      ) : data ? (
        <>
          <header className="mt-6">
            <p className="text-xs font-semibold uppercase text-accent">Course player</p>
            <h1 className="mt-2 font-display text-4xl font-bold">{data.course.title}</h1>
            <p className="mt-2 text-muted-foreground">{data.course.description}</p>
            {data.course.thumbnail_url && (
              <img
                src={data.course.thumbnail_url}
                alt={`${data.course.title} course`}
                className="mt-4 max-h-56 w-full rounded-md object-cover sm:max-w-2xl"
              />
            )}
            <div className="mt-4 flex items-center gap-3">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10"
                role="progressbar"
                aria-label="Course completion"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-sm font-semibold">
                {completed}/{lessons.length} lessons · {percent}%
              </span>
            </div>
            {lessons.length > 0 && completed === lessons.length && (
              <p className="mt-3 rounded-md bg-success/10 px-4 py-3 text-sm font-semibold text-success">
                Course complete — you have completed every published lesson.
              </p>
            )}
          </header>

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
            <section className="min-w-0">
              {activeQuiz ? (
                <div className="grid gap-5 rounded-lg bg-surface p-5 border border-line sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <button
                        type="button"
                        className="text-sm font-semibold text-accent hover:underline"
                        onClick={() => openQuiz(activeQuiz)}
                      >
                        Back to quiz details
                      </button>
                      <h2 className="mt-2 font-display text-2xl font-bold">{activeQuiz.title}</h2>
                      {!attemptResult && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {activeQuiz.description ||
                            "Read each question and submit when you are ready."}
                        </p>
                      )}
                    </div>
                    {remainingSeconds !== null && attempt && !attemptResult && (
                      <p
                        className={`rounded-md px-3 py-2 text-sm font-semibold ring-1 ${remainingSeconds < 60 ? "text-destructive ring-destructive/40" : "ring-ink/20"}`}
                        aria-live="polite"
                      >
                        Time remaining: {Math.floor(remainingSeconds / 60)}:
                        {String(remainingSeconds % 60).padStart(2, "0")}
                      </p>
                    )}
                  </div>

                  {attemptResult ? (
                    <div className="grid gap-4">
                      <div className="rounded-md bg-background p-4 ring-1 ring-ink/15">
                        <p className="font-semibold">
                          {attemptResult.passed ? "You passed" : "Not passed"} ·{" "}
                          {attemptResult.percentage}%
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {attemptResult.score_obtained} / {attemptResult.total_possible_marks}{" "}
                          marks
                        </p>
                      </div>
                      {attemptResult.feedback.map((item, index) => {
                        const correctLabel =
                          typeof item.correct_answer === "string" && item.options.length
                            ? item.options.find((option) => option.id === item.correct_answer)?.text
                            : String(item.correct_answer);
                        return (
                          <article
                            key={item.question_id}
                            className="rounded-md border border-ink/15 p-4"
                          >
                            <p className="font-semibold">
                              {index + 1}. {item.question}
                            </p>
                            <p
                              className={`mt-2 text-sm ${item.is_correct ? "text-success" : "text-destructive"}`}
                            >
                              {item.is_correct
                                ? "Correct"
                                : `Correct answer: ${correctLabel ?? "—"}`}
                            </p>
                            {item.explanation && (
                              <p className="mt-2 text-sm text-muted-foreground">
                                {item.explanation}
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : attempt ? (
                    currentQuestion ? (
                      <>
                        <div className="flex flex-wrap gap-2" aria-label="Question navigation">
                          {attempt.questions.map((question, index) => (
                            <button
                              key={question.id}
                              type="button"
                              className={`grid size-9 place-items-center rounded-md text-sm font-semibold ring-1 ${index === questionIndex ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-ink/20"}`}
                              aria-current={index === questionIndex ? "step" : undefined}
                              aria-label={`Question ${index + 1}${answers[question.id] !== undefined ? ", answered" : ", unanswered"}`}
                              disabled={submitMutation.isPending}
                              onClick={() => setQuestionIndex(index)}
                            >
                              {index + 1}
                            </button>
                          ))}
                        </div>
                        <article className="rounded-md border border-ink/15 p-4 sm:p-6">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">
                            Question {questionIndex + 1} of {attempt.questions.length} ·{" "}
                            {currentQuestion.marks} {currentQuestion.marks === 1 ? "mark" : "marks"}
                          </p>
                          <h3 className="mt-2 text-lg font-semibold">{currentQuestion.text}</h3>
                          {currentQuestion.type === "single_choice" ? (
                            <div className="mt-4 grid gap-2">
                              {currentQuestion.options.map((option) => (
                                <label
                                  key={option.id}
                                  className="flex cursor-pointer items-center gap-3 rounded-md bg-background p-3 text-sm ring-1 ring-ink/15 hover:ring-ink/40"
                                >
                                  <input
                                    type="radio"
                                    name={currentQuestion.id}
                                    value={option.id}
                                    checked={answers[currentQuestion.id] === option.id}
                                    onChange={() =>
                                      setAnswers({ ...answers, [currentQuestion.id]: option.id })
                                    }
                                  />
                                  {option.text}
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-4 flex gap-3">
                              {[true, false].map((value) => (
                                <label
                                  key={String(value)}
                                  className="flex cursor-pointer items-center gap-2 rounded-md bg-background px-4 py-3 text-sm ring-1 ring-ink/15"
                                >
                                  <input
                                    type="radio"
                                    name={currentQuestion.id}
                                    checked={answers[currentQuestion.id] === value}
                                    onChange={() =>
                                      setAnswers({ ...answers, [currentQuestion.id]: value })
                                    }
                                  />
                                  {value ? "True" : "False"}
                                </label>
                              ))}
                            </div>
                          )}
                        </article>
                        <div className="flex flex-wrap justify-between gap-3">
                          <Button
                            variant="outline"
                            disabled={questionIndex === 0 || submitMutation.isPending}
                            onClick={() => setQuestionIndex(questionIndex - 1)}
                          >
                            Previous
                          </Button>
                          {questionIndex < attempt.questions.length - 1 && (
                            <Button
                              variant="outline"
                              disabled={submitMutation.isPending}
                              onClick={() => setQuestionIndex(questionIndex + 1)}
                            >
                              Next
                            </Button>
                          )}
                          <Button
                            disabled={
                              submitMutation.isPending ||
                              Object.keys(answers).length !== attempt.questions.length
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Submit your answers? You cannot change them afterward.",
                                )
                              ) {
                                submitMutation.mutate({
                                  data: { attemptId: attempt.attempt_id, answers },
                                });
                              }
                            }}
                          >
                            {submitMutation.isPending && (
                              <Loader2 className="size-4 animate-spin" />
                            )}
                            Submit quiz
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {Object.keys(answers).length} of {attempt.questions.length} questions
                          answered.
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-destructive">
                        No valid questions were returned for this quiz.
                      </p>
                    )
                  ) : resultMutation.isPending ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading result…
                    </p>
                  ) : (
                    <div className="grid gap-4">
                      <p className="text-xs text-muted-foreground">
                        Submitted attempts:{" "}
                        {activeQuiz.attempts.filter((item) => item.status === "submitted").length} /{" "}
                        {activeQuiz.max_attempts}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {activeQuiz.description ||
                          "This quiz checks your understanding of the course."}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Passing score: {activeQuiz.passing_percentage}%
                        {activeQuiz.time_limit_minutes
                          ? ` · ${activeQuiz.time_limit_minutes} minutes`
                          : ""}
                      </p>
                      <Button
                        className="w-fit"
                        disabled={
                          startMutation.isPending ||
                          resumeMutation.isPending ||
                          (!activeQuiz.attempts.some((item) => item.status === "in_progress") &&
                            activeQuiz.attempts.filter((item) => item.status === "submitted")
                              .length >= activeQuiz.max_attempts)
                        }
                        onClick={() => {
                          const active = activeQuiz.attempts.find(
                            (item) => item.status === "in_progress",
                          );
                          if (active) resumeMutation.mutate({ data: { attemptId: active.id } });
                          else startMutation.mutate({ data: { quizId: activeQuiz.id } });
                        }}
                      >
                        {(startMutation.isPending || resumeMutation.isPending) && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        {activeQuiz.attempts.some((item) => item.status === "in_progress")
                          ? "Continue attempt"
                          : activeQuiz.attempts.filter((item) => item.status === "submitted")
                                .length >= activeQuiz.max_attempts
                            ? "No attempts remaining"
                            : "Start quiz"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : activeLesson ? (
                <div className="grid gap-4">
                  {activeLesson.video_path ? (
                    <LessonVideo
                      key={activeLesson.id}
                      videoUrl={activeLesson.video_path}
                      title={activeLesson.title}
                      onEnded={() => {
                        if (!activeLesson.completed && !progressMutation.isPending) {
                          progressMutation.mutate({
                            data: {
                              lessonId: activeLesson.id,
                              completed: true,
                              progressSeconds: activeLesson.duration_minutes * 60,
                            },
                          });
                        }
                      }}
                    />
                  ) : (
                    <div className="grid aspect-video place-items-center rounded-md bg-black p-6 text-center text-sm text-white">
                      This lesson does not have a video available yet.
                    </div>
                  )}
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-2xl font-bold">{activeLesson.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activeLesson.duration_minutes} minutes
                      </p>
                      {activeLesson.description && (
                        <p className="mt-4 whitespace-pre-line text-sm">
                          {activeLesson.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={activeLesson.completed || progressMutation.isPending}
                      onClick={() =>
                        progressMutation.mutate({
                          data: {
                            lessonId: activeLesson.id,
                            completed: true,
                            progressSeconds: activeLesson.duration_minutes * 60,
                          },
                        })
                      }
                    >
                      {progressMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      {activeLesson.completed ? "Completed" : "Mark complete"}
                    </button>
                  </div>
                  <div className="flex flex-wrap justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={activeLessonIndex <= 0}
                      onClick={() => setActiveLessonId(lessons[activeLessonIndex - 1]!.id)}
                    >
                      <ArrowLeft className="size-4" />
                      Previous lesson
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={activeLessonIndex < 0 || activeLessonIndex >= lessons.length - 1}
                      onClick={() => setActiveLessonId(lessons[activeLessonIndex + 1]!.id)}
                    >
                      Next lesson
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-surface p-6 border border-line">
                  <h2 className="font-semibold">No published lessons yet</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Published lessons will appear here when they are ready.
                  </p>
                </div>
              )}
            </section>

            <aside className="h-fit rounded-lg bg-surface border border-line">
              <h2 className="border-b border-line p-4 font-display text-lg font-semibold">
                Course lessons
              </h2>
              {data.sections.length ? (
                data.sections.map((section) => (
                  <section key={section.id} className="border-b border-ink/10 last:border-0">
                    <h3 className="px-4 pb-2 pt-4 text-xs font-semibold uppercase text-muted-foreground">
                      {section.title}
                    </h3>
                    {section.lessons.length ? (
                      <ul className="pb-2">
                        {section.lessons.map((lesson) => (
                          <li key={lesson.id}>
                            <button
                              type="button"
                              className={`flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-paper ${activeLesson?.id === lesson.id ? "bg-paper" : ""}`}
                              aria-current={activeLesson?.id === lesson.id ? "true" : undefined}
                              onClick={() => setActiveLessonId(lesson.id)}
                            >
                              {lesson.completed ? (
                                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                              ) : (
                                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              )}
                              <span className="min-w-0">
                                <span className="block font-medium">{lesson.title}</span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  {lesson.duration_minutes} min
                                  {lesson.last_accessed_at && (
                                    <>
                                      {" "}
                                      · Last opened{" "}
                                      {new Date(lesson.last_accessed_at).toLocaleDateString()}
                                    </>
                                  )}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-4 pb-4 text-xs text-muted-foreground">
                        No published lessons in this section.
                      </p>
                    )}
                  </section>
                ))
              ) : (
                <p className="p-4 text-sm text-muted-foreground">No course sections yet.</p>
              )}
              <section className="border-t border-line">
                <h2 className="px-4 pb-2 pt-4 font-display text-lg font-semibold">
                  Course quizzes
                </h2>
                {quizzesPending ? (
                  <p className="px-4 pb-4 text-sm text-muted-foreground">Loading quizzes…</p>
                ) : quizzesError ? (
                  <p className="px-4 pb-4 text-sm text-destructive">{quizzesError.message}</p>
                ) : (quizzes?.length ?? 0) === 0 ? (
                  <p className="px-4 pb-4 text-sm text-muted-foreground">
                    No published quizzes are available.
                  </p>
                ) : (
                  <ul className="pb-2">
                    {quizzes!.map((quiz) => (
                      <li key={quiz.id} className="px-3 py-2">
                        <button
                          type="button"
                          className={`w-full rounded-md p-2 text-left text-sm hover:bg-paper ${activeQuiz?.id === quiz.id ? "bg-paper" : ""}`}
                          onClick={() => openQuiz(quiz)}
                        >
                          <span className="block font-semibold">{quiz.title}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {quiz.time_limit_minutes
                              ? `${quiz.time_limit_minutes} min`
                              : "No time limit"}{" "}
                            · {quiz.max_attempts} {quiz.max_attempts === 1 ? "attempt" : "attempts"}
                          </span>
                        </button>
                        {quiz.attempts
                          .filter((item) => item.status === "submitted")
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className="ml-2 mt-1 text-xs text-accent hover:underline"
                              onClick={() => viewQuizResult(quiz, item.id)}
                            >
                              Attempt {item.attempt_number}: {item.percentage}% ·{" "}
                              {item.passed ? "Passed" : "Not passed"}
                            </button>
                          ))}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </DashboardShell>
  );
}
