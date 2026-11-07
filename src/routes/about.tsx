import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout, PageIntro } from "@/components/skillora/layout";
import { Button } from "@/components/ui/button";
import { INSTITUTE } from "@/lib/institute-info";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — AI Institute Satana" },
      {
        name: "description",
        content:
          "Learn about AI Institute Satana — our mission, vision, and our commitment to accessible, practical education for every learner.",
      },
      { property: "og:title", content: "About Us — AI Institute Satana" },
      {
        property: "og:description",
        content:
          "Our mission, vision, and commitment to accessible, practical education for every learner.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://ai-institute-data-hub.lovable.app/about" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "About Us — AI Institute Satana" },
      {
        name: "twitter:description",
        content:
          "Our mission, vision, and commitment to accessible, practical education for every learner.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://ai-institute-data-hub.lovable.app/about" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="About Us"
        title={`About ${INSTITUTE.name}`}
        description="Practical, accessible education designed to help learners build real skills at their own pace."
      />
      <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <div className="grid gap-4 leading-relaxed text-muted-foreground">
          <h2 className="font-display text-2xl font-bold text-ink">Introduction</h2>
          <p>
            {INSTITUTE.name}, based in Satana, Nashik, Maharashtra, offers structured online
            learning through practical courses and learning packages. Our introduction to each
            subject is designed to help learners build understanding step by step.
          </p>
          <p>
            We believe that learning should fit into real life. Our courses are built around
            clear explanations, practical examples, and steady progress — so that what you
            learn here can actually be used, not just remembered.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <article className="rounded-lg bg-surface p-6 border border-line">
            <h2 className="font-display text-xl font-bold">Our Mission</h2>
            <p className="mt-3 text-muted-foreground">
              To make practical, career-focused education accessible and affordable for every
              learner — regardless of their background, location, or starting point.
            </p>
          </article>
          <article className="rounded-lg bg-surface p-6 border border-line">
            <h2 className="font-display text-xl font-bold">Our Vision</h2>
            <p className="mt-3 text-muted-foreground">
              To become a trusted learning destination where students gain skills with
              confidence and grow towards better opportunities.
            </p>
          </article>
        </div>

        <div className="mt-10 grid gap-6">
          <article className="rounded-lg bg-surface p-6 border border-line">
            <h2 className="font-display text-xl font-bold">Our Commitment to Quality Education</h2>
            <p className="mt-3 text-muted-foreground">
              We aim to present clear, organized course material and useful learning resources.
              We continue to improve the learning experience and welcome feedback from learners.
            </p>
          </article>
          <article className="rounded-lg bg-surface p-6 border border-line">
            <h2 className="font-display text-xl font-bold">Our Learning Approach</h2>
            <p className="mt-3 text-muted-foreground">
              We structure learning into clear sections and lessons, supported by quizzes and
              progress tracking, so you always know where you are and what comes next. Learners
              can study at their own pace and revisit lessons whenever they need to.
            </p>
          </article>
          <article className="rounded-lg bg-surface p-6 border border-line">
            <h2 className="font-display text-xl font-bold">Accessible and Practical Education</h2>
            <p className="mt-3 text-muted-foreground">
              Practical lessons, examples, and exercises help connect course concepts to
              real-world tasks. Learners can work through the material at their own pace and
              revisit lessons as needed.
            </p>
          </article>
        </div>

        <div className="mt-12 rounded-lg bg-surface p-8 text-center border border-line">
          <h2 className="font-display text-2xl font-bold">Ready to start learning?</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Explore courses and choose a learning path that fits your interests.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild variant="accent">
              <Link to="/packages">Explore packages</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/courses">Explore Courses</Link>
            </Button>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}
