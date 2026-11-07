import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { TypedSupabaseClient } from "@/lib/supabase-types";

const optionSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1, "Option text is required").max(500),
});

const sharedQuestion = {
  id: z.string().uuid(),
  text: z.string().trim().min(1, "Question text is required").max(2000),
  marks: z.number().finite().positive().max(10000).multipleOf(0.01),
  display_order: z.number().int().min(0).max(500),
  explanation: z.string().trim().max(2000),
};

export const quizQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    ...sharedQuestion,
    type: z.literal("single_choice"),
    options: z.array(optionSchema).min(2, "Add at least two options").max(20),
    correct_option_id: z.string().min(1, "Choose one correct option"),
  }),
  z.object({
    ...sharedQuestion,
    type: z.literal("true_false"),
    correct_answer: z.boolean(),
  }),
]);

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

const questionsSchema = z
  .array(quizQuestionSchema)
  .max(500)
  .superRefine((questions, ctx) => {
    const ids = questions.map((question) => question.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Question IDs must be unique" });
    questions.forEach((question, index) => {
      if (question.display_order !== index)
        ctx.addIssue({
          code: "custom",
          message: "Question order must be continuous and start at zero",
          path: [index, "display_order"],
        });
      if (question.type === "single_choice") {
        const optionIds = question.options.map((option) => option.id);
        if (new Set(optionIds).size !== optionIds.length)
          ctx.addIssue({
            code: "custom",
            message: "Option IDs must be unique",
            path: [index, "options"],
          });
        if (!optionIds.includes(question.correct_option_id))
          ctx.addIssue({
            code: "custom",
            message: "Choose exactly one of the question's options as correct",
            path: [index, "correct_option_id"],
          });
      }
    });
  });

const quizInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Quiz title is required").max(160),
  description: z.string().trim().max(4000),
  course_id: z.string().uuid(),
  section_id: z.string().uuid().nullable(),
  passing_percentage: z.number().int().min(0).max(100),
  time_limit_minutes: z.number().int().min(1).max(1440).nullable(),
  max_attempts: z.number().int().min(1).max(100),
  status: z.enum(["draft", "published", "inactive"]),
  questions: questionsSchema,
});

async function assertAdmin(ctx: { supabase: TypedSupabaseClient; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(`Could not verify admin access: ${error.message}`);
  if (!(data ?? []).some((row) => row.role === "admin"))
    throw new Error("Forbidden: Admin access required");
}

function parseJson<T>(schema: z.ZodType<T>, value: Json, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(message);
  return result.data;
}

const studentQuizSchema = z.array(
  z.object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string(),
    passing_percentage: z.number(),
    time_limit_minutes: z.number().nullable(),
    max_attempts: z.number(),
    status: z.literal("published"),
    section_id: z.string().uuid().nullable(),
    attempts: z.array(
      z.object({
        id: z.string().uuid(),
        attempt_number: z.number(),
        started_at: z.string(),
        submitted_at: z.string().nullable(),
        score_obtained: z.number().nullable(),
        total_possible_marks: z.number().nullable(),
        percentage: z.number().nullable(),
        passed: z.boolean().nullable(),
        status: z.enum(["in_progress", "submitted", "timed_out"]),
      }),
    ),
  }),
);

export type StudentQuiz = z.infer<typeof studentQuizSchema>[number];

const publicQuestionSchema = z.array(
  z.discriminatedUnion("type", [
    z.object({
      id: z.string().uuid(),
      type: z.literal("single_choice"),
      text: z.string(),
      marks: z.number(),
      display_order: z.number(),
      options: z.array(optionSchema),
      explanation: z.string().optional(),
    }),
    z.object({
      id: z.string().uuid(),
      type: z.literal("true_false"),
      text: z.string(),
      marks: z.number(),
      display_order: z.number(),
      explanation: z.string().optional(),
    }),
  ]),
);

export type PublicQuizQuestion = z.infer<typeof publicQuestionSchema>[number];

export type QuizAttemptStart = {
  attempt_id: string;
  attempt_number: number;
  started_at: string;
  description: string;
  time_limit_minutes: number | null;
  questions: PublicQuizQuestion[];
};

export type QuizAttemptSession = QuizAttemptStart | { status: "timed_out"; message: string };

const quizAttemptStartSchema = z.object({
  attempt_id: z.string().uuid(),
  attempt_number: z.number(),
  started_at: z.string(),
  description: z.string(),
  time_limit_minutes: z.number().nullable(),
  questions: publicQuestionSchema,
});
const quizAttemptSessionSchema = z.union([
  quizAttemptStartSchema,
  z.object({ status: z.literal("timed_out"), message: z.string() }),
]);

export type QuizAttemptResult = {
  attempt_id: string;
  attempt_number: number;
  submitted_at: string;
  score_obtained: number;
  total_possible_marks: number;
  percentage: number;
  passed: boolean;
  feedback: {
    question_id: string;
    question: string;
    selected_answer: Json | null;
    correct_answer: Json | null;
    options: { id: string; text: string }[];
    is_correct: boolean;
    explanation: string | null;
  }[];
};

const quizAttemptResultSchema = z.object({
  attempt_id: z.string().uuid(),
  attempt_number: z.number(),
  submitted_at: z.string(),
  score_obtained: z.number(),
  total_possible_marks: z.number(),
  percentage: z.number(),
  passed: z.boolean(),
  feedback: z.array(
    z.object({
      question_id: z.string().uuid(),
      question: z.string(),
      selected_answer: z.union([z.string(), z.boolean()]).nullable(),
      correct_answer: z.union([z.string(), z.boolean()]).nullable(),
      options: z.array(optionSchema),
      is_correct: z.boolean(),
      explanation: z.string().nullable(),
    }),
  ),
});

export type AdminQuiz = {
  id: string;
  title: string;
  description: string;
  course_id: string;
  course_title: string;
  section_id: string | null;
  section_title: string | null;
  passing_score: number;
  time_limit_minutes: number | null;
  max_attempts: number;
  status: "draft" | "published" | "inactive";
  questions: QuizQuestion[];
  created_at: string;
  updated_at: string;
};

export const getAdminQuizData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [quizResult, courseResult, sectionResult] = await Promise.all([
      context.supabase
        .from("quizzes")
        .select(
          "id, title, description, course_id, section_id, passing_score, time_limit_minutes, max_attempts, status, questions, created_at, updated_at",
        )
        .order("created_at", { ascending: false }),
      context.supabase.from("courses").select("id, title").order("title"),
      context.supabase
        .from("course_sections")
        .select("id, course_id, title, sort_order")
        .order("sort_order"),
    ]);
    for (const result of [quizResult, courseResult, sectionResult])
      if (result.error) throw new Error(result.error.message);

    const courses = new Map((courseResult.data ?? []).map((course) => [course.id, course.title]));
    const sections = new Map((sectionResult.data ?? []).map((section) => [section.id, section]));
    const quizzes: AdminQuiz[] = (quizResult.data ?? []).map((quiz) => {
      const section = quiz.section_id ? sections.get(quiz.section_id) : undefined;
      if (!courses.has(quiz.course_id))
        throw new Error(`Quiz "${quiz.title}" points to a course that no longer exists.`);
      if (section && section.course_id !== quiz.course_id)
        throw new Error(`Quiz "${quiz.title}" has a section from a different course.`);
      return {
        ...quiz,
        status: quiz.status as AdminQuiz["status"],
        questions: parseJson(
          questionsSchema,
          quiz.questions,
          `Quiz "${quiz.title}" has questions in an unsupported format. Its data was not changed.`,
        ),
        course_title: courses.get(quiz.course_id)!,
        section_title: section?.title ?? null,
      };
    });
    return {
      quizzes,
      courses: (courseResult.data ?? []).map((course) => ({ id: course.id, title: course.title })),
      sections: (sectionResult.data ?? []).map((section) => ({
        id: section.id,
        course_id: section.course_id,
        title: section.title,
      })),
    };
  });

export const saveAdminQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => quizInputSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (data.status === "published" && data.questions.length === 0)
      throw new Error("Add at least one valid question before publishing.");

    const { data: course, error: courseError } = await context.supabase
      .from("courses")
      .select("id")
      .eq("id", data.course_id)
      .maybeSingle();
    if (courseError) throw new Error(courseError.message);
    if (!course) throw new Error("Select an existing course for this quiz.");

    if (data.section_id) {
      const { data: section, error: sectionError } = await context.supabase
        .from("course_sections")
        .select("id")
        .eq("id", data.section_id)
        .eq("course_id", data.course_id)
        .maybeSingle();
      if (sectionError) throw new Error(sectionError.message);
      if (!section) throw new Error("The selected section does not belong to this course.");
    }

    const row = {
      title: data.title,
      description: data.description,
      course_id: data.course_id,
      section_id: data.section_id,
      passing_score: data.passing_percentage,
      time_limit_minutes: data.time_limit_minutes,
      max_attempts: data.max_attempts,
      status: data.status,
      questions: data.questions as Json,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await context.supabase.from("quizzes").update(row).eq("id", data.id)
      : await context.supabase.from("quizzes").insert(row);
    if (error) {
      if (error.message.includes("in progress"))
        throw new Error("This quiz cannot be changed while a student has an attempt in progress.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteAdminQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("quizzes").delete().eq("id", data.id);
    if (error) {
      if (error.code === "23503")
        throw new Error(
          "This quiz has student attempts and cannot be deleted. Set it to Inactive instead.",
        );
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const getStudentQuizzes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ courseId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<StudentQuiz[]> => {
    const { data: result, error } = await context.supabase.rpc("get_student_quizzes", {
      _course_id: data.courseId,
    });
    if (error) throw new Error(error.message);
    return parseJson(
      studentQuizSchema,
      result,
      "The quiz list response was invalid. Please contact an administrator.",
    );
  });

export const startStudentQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ quizId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<QuizAttemptStart> => {
    const { data: result, error } = await context.supabase.rpc("start_quiz_attempt", {
      _quiz_id: data.quizId,
    });
    if (error) throw new Error(error.message);
    return parseJson(
      quizAttemptStartSchema,
      result,
      "The quiz could not be started because the server returned invalid quiz data.",
    );
  });

export const resumeStudentQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ attemptId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<QuizAttemptSession> => {
    const { data: result, error } = await context.supabase.rpc("resume_quiz_attempt", {
      _attempt_id: data.attemptId,
    });
    if (error) throw new Error(error.message);
    return parseJson(
      quizAttemptSessionSchema,
      result,
      "The quiz attempt could not be resumed because the server returned invalid data.",
    );
  });

export const submitStudentQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ attemptId: z.string().uuid(), answers: z.record(z.string(), z.unknown()) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const answers = z.record(z.string(), z.union([z.string(), z.boolean()])).parse(data.answers);
    const { data: result, error } = await context.supabase.rpc("submit_quiz_attempt", {
      _attempt_id: data.attemptId,
      _answers: answers as Json,
    });
    if (error) throw new Error(error.message);
    return parseJson(
      z.object({
        attempt_id: z.string().uuid().optional(),
        score_obtained: z.number().optional(),
        total_possible_marks: z.number().optional(),
        percentage: z.number().optional(),
        passed: z.boolean().optional(),
        status: z.enum(["submitted", "timed_out"]),
        message: z.string().optional(),
      }),
      result,
      "The quiz submission returned an invalid result.",
    );
  });

export const getStudentQuizResult = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ attemptId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<QuizAttemptResult> => {
    const { data: result, error } = await context.supabase.rpc("get_quiz_attempt_result", {
      _attempt_id: data.attemptId,
    });
    if (error) throw new Error(error.message);
    return parseJson(quizAttemptResultSchema, result, "The quiz result could not be loaded.");
  });
