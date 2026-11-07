import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Award, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/skillora/dashboard";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { getMyCourses } from "@/lib/student.functions";
import { getMyCertificates, issueMyCertificate } from "@/lib/certificate.functions";

export const Route = createFileRoute("/_authenticated/certificates")({
  beforeLoad: ({ location }) => requireRole("student", location.href),
  head: () => ({
    meta: [
      { title: "Certificates — AI Institute" },
      { name: "description", content: "View and request certificates you have earned." },
    ],
  }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const loadCertificates = useServerFn(getMyCertificates);
  const loadCourses = useServerFn(getMyCourses);
  const issue = useServerFn(issueMyCertificate);
  const certificates = useQuery({
    queryKey: ["my-certificates"],
    queryFn: () => loadCertificates(),
  });
  const courses = useQuery({
    queryKey: ["my-courses"],
    queryFn: () => loadCourses(),
  });
  const issueMutation = useMutation({
    mutationFn: (courseId: string) => issue({ data: { courseId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-certificates"] });
      toast.success("Your certificate is ready.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not issue the certificate."),
  });
  const certificateCourseIds = new Set(
    (certificates.data ?? []).map((certificate) => certificate.course_id),
  );
  const eligibleCourses = (courses.data ?? []).filter(
    (course) =>
      course.publishedLessonCount > 0 &&
      course.completedLessonsCount === course.publishedLessonCount &&
      !certificateCourseIds.has(course.id),
  );

  return (
    <DashboardShell mode="student">
      <p className="text-xs font-semibold uppercase text-accent">Your achievements</p>
      <h1 className="mt-2 font-display text-4xl font-bold">My certificates</h1>
      <p className="mt-2 text-muted-foreground">
        Certificates become available after all published lessons are complete. Eligibility is
        verified securely when you request one.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-2xl font-bold">Ready to issue</h2>
        {courses.isPending || certificates.isPending ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading your course progress…
          </p>
        ) : courses.error || certificates.error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {courses.error?.message ?? certificates.error?.message}
          </p>
        ) : eligibleCourses.length ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {eligibleCourses.map((course) => (
              <li
                key={course.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface p-5 ring-1 ring-ink/15"
              >
                <div>
                  <p className="font-semibold">{course.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    All {course.publishedLessonCount} published lessons completed
                  </p>
                </div>
                <Button
                  disabled={issueMutation.isPending}
                  onClick={() => issueMutation.mutate(course.id)}
                >
                  {issueMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Award className="size-4" />
                  )}
                  Request certificate
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No new certificates are ready. Complete all published lessons in a course to become
            eligible.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold">Issued certificates</h2>
        {certificates.isPending ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading your certificates…
          </p>
        ) : certificates.error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {certificates.error.message}
          </p>
        ) : certificates.data?.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {certificates.data.map((certificate) => (
              <article
                key={certificate.id}
                className="grid gap-3 rounded-lg bg-surface p-5 ring-1 ring-ink/15"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold">{certificate.course_title}</h3>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${certificate.status === "issued" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
                  >
                    {certificate.status}
                  </span>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {certificate.certificate_number}
                </p>
                <p className="text-sm text-muted-foreground">
                  Issued {new Date(certificate.issued_at).toLocaleDateString()}
                </p>
                {certificate.revocation_reason && (
                  <p className="text-sm text-destructive">
                    Revoked: {certificate.revocation_reason}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link
                      to="/verify-certificate/$verificationId"
                      params={{ verificationId: certificate.verification_id }}
                      search={{}}
                    >
                      <Award className="size-4" />
                      View certificate
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    disabled={certificate.status !== "issued"}
                  >
                    <Link
                      to="/verify-certificate/$verificationId"
                      params={{ verificationId: certificate.verification_id }}
                      search={{ print: "true" }}
                    >
                      <Download className="size-4" />
                      PDF / print
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg bg-surface p-6 ring-1 ring-ink/15">
            <h3 className="font-semibold">No certificates yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              When you complete a course, request your certificate here. Issued certificates will
              include a public verification link.
            </p>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
