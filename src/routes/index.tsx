import { useQuery } from "@tanstack/react-query";
import { getPublicPackages } from "@/lib/catalog.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, BriefcaseBusiness, ChevronDown, Compass, PlayCircle } from "lucide-react";
import { PublicLayout } from "@/components/skillora/layout";
import { PackageCard } from "@/components/skillora/catalog";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Institute Satana — Learn Skills. Build Your Career." },
      {
        name: "description",
        content:
          "Explore practical courses and learning packages at AI Institute Satana.",
      },
      { property: "og:title", content: "AI Institute Satana — Learn. Grow. Earn." },
      {
        property: "og:description",
        content: "Build practical skills and grow your career with structured learning.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});
const benefit = [
  [Compass, "Focused paths", "Know what to learn next."],
  [PlayCircle, "Practical lessons", "Study with videos, resources, and quizzes."],
  [Award, "Visible progress", "Track milestones and earn certificates."],
] as const;
function Section({
  title,
  label,
  children,
}: {
  title: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
      <p className="text-xs font-semibold uppercase text-accent">{label}</p>
      <h2 className="mb-8 mt-2 font-display text-3xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
function Home() {
  const { data, isPending, error } = useQuery({
    queryKey: ["public-catalog"],
    queryFn: () => getPublicPackages(),
  });
  return (
    <PublicLayout>
      <main>
        <section className="relative overflow-hidden border-b border-line bg-secondary">
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="text-xs font-semibold uppercase text-accent">Learn. Grow. Earn.</p>
              <h1 className="mt-5 max-w-[16ch] font-display text-4xl font-bold leading-none sm:text-6xl">
                Learn Skills. Build Your Career. Grow With AI Institute.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                A focused learning studio for practical courses, clear milestones, useful resources,
                and certificates that recognize your progress.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild variant="accent" size="lg">
                  <Link to="/packages">Explore Packages</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/register">Start Learning</Link>
                </Button>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-xl border border-line bg-surface p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase text-accent">Learning packages</p>
                <p className="mt-3 font-display text-5xl font-bold">
                  {isPending ? "…" : (data?.length ?? 0)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Published learning paths available to explore.
                </p>
                <Button asChild variant="outline" className="mt-6">
                  <Link to="/packages">Browse packages</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
        <Section title="Popular learning packages" label="Packages">
          <div className="grid gap-5 md:grid-cols-3">
            {isPending && (
              <p className="text-sm text-muted-foreground">Loading available packages…</p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                Packages are temporarily unavailable. Please try again later.
              </p>
            )}
            {(data ?? []).map((p) => (
              <PackageCard key={p.slug} item={p} />
            ))}
            {!isPending && !error && !data?.length && (
              <p className="text-sm text-muted-foreground">No packages are available right now.</p>
            )}
          </div>
        </Section>
        <Section title="Why learners choose AI Institute" label="Learning benefits">
          <div className="grid gap-5 sm:grid-cols-3">
            {benefit.map(([Icon, t, d]) => (
              <article className="rounded-lg border border-line bg-surface p-6" key={t}>
                <Icon className="size-7 text-primary" />
                <h3 className="mt-5 font-display text-xl font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{d}</p>
              </article>
            ))}
          </div>
        </Section>
        <section className="border-y border-line bg-secondary/60">
          <Section title="Three steps, one clear path" label="How it works">
            <div className="grid gap-5 sm:grid-cols-3">
              {[
                ["01", "Pick a package", "Choose a focused bundle with transparent inclusions."],
                ["02", "Learn and track", "Study at your pace and always see your next step."],
                [
                  "03",
                  "Earn and grow",
                  "Collect certificates, then activate Affiliate Mode later.",
                ],
              ].map(([n, t, d]) => (
                <article className="rounded-lg border border-line bg-surface p-6" key={n}>
                  <strong className="font-display text-3xl text-primary">{n}</strong>
                  <h3 className="mt-4 font-display text-xl font-semibold">{t}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{d}</p>
                </article>
              ))}
            </div>
          </Section>
        </section>
        <Section title="One account. Two ways to grow." label="Affiliate mode">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <BriefcaseBusiness className="size-9 text-brand" />
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                Start as a student and activate Affiliate Mode from the same account when it becomes
                available. No duplicate profile, no lost learning history.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface p-6">
              <p className="font-display text-xl font-semibold">Affiliate workspace preview</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Referral links, promo codes, clicks, leads, sales, and commissions will live in one
                organized dashboard.
              </p>
            </div>
          </div>
        </Section>
        <section className="border-y border-line bg-secondary/60">
          <Section title="Learner stories" label="Student testimonials">
            <div className="rounded-lg border border-line bg-surface p-6">
              <p className="text-sm text-muted-foreground">
                Student testimonials are not available to display yet.
              </p>
              <Button asChild className="mt-4" variant="outline" size="sm">
                <Link to="/contact">Contact us</Link>
              </Button>
            </div>
          </Section>
        </section>
        <section className="border-t border-line bg-surface">
          <Section title="Frequently asked questions" label="FAQ">
            <div className="divide-y divide-line border-y border-line">
              {[
                [
                  "Can I buy individual courses?",
                  "Course and package purchase options will be enabled with payments in a later phase.",
                ],
                [
                  "Are certificates included?",
                  "Eligible courses display their certificate inclusion before enrollment.",
                ],
                [
                  "Is Affiliate Mode a separate account?",
                  "No. The same account can support both Student and Affiliate roles.",
                ],
              ].map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none justify-between font-semibold">
                    {q}
                    <ChevronDown className="size-5 group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </Section>
        </section>
        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 px-5 py-14 sm:px-8 lg:flex-row lg:items-center">
            <div>
              <h2 className="font-display text-4xl font-bold">Ready to build your next skill?</h2>
              <p className="mt-3 text-primary-foreground/80">
                Create your AI Institute account and prepare for structured progress.
              </p>
            </div>
            <Button asChild variant="accent" size="lg">
              <Link to="/register">Start learning</Link>
            </Button>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
