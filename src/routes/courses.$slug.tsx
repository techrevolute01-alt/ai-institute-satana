import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PublicLayout } from "@/components/skillora/layout";
import { Button } from "@/components/ui/button";
import { getPublicCatalog } from "@/lib/catalog.functions";
export const Route = createFileRoute("/courses/$slug")({
  head: () => ({
    meta: [
      { title: "Course Details — AI Institute" },
      {
        name: "description",
        content: "Preview a AI Institute course curriculum, instructor, and learning outcomes.",
      },
      { property: "og:title", content: "Course Details — AI Institute" },
      { property: "og:description", content: "Preview your next practical learning experience." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  const { slug } = Route.useParams();
  const { data, isPending, error } = useQuery({
    queryKey: ["public-catalog"],
    queryFn: () => getPublicCatalog(),
    retry: false,
  });
  const item = data?.courses.find((course) => course.slug === slug);
  return (
    <PublicLayout>
      {isPending ? (
        <main className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-20 text-muted-foreground sm:px-8">
          <Loader2 className="size-4 animate-spin" />
          Loading course details…
        </main>
      ) : error ? (
        <main className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <p role="alert" className="text-sm text-destructive">
            Course details are temporarily unavailable. Please try again later.
          </p>
        </main>
      ) : !item ? (
        <main className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <h1 className="font-display text-3xl font-bold">Course not found</h1>
          <p className="mt-2 text-muted-foreground">This course is not currently published.</p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/courses">Browse published courses</Link>
          </Button>
        </main>
      ) : (
      <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <Link to="/courses" className="text-sm font-semibold text-brand">
          ← All courses
        </Link>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
          <div>
            <h1 className="font-display text-5xl font-bold">{item.title}</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {item.description || "Course description has not been added yet."}
            </p>
            {item.image && (
              <img
                src={item.image}
                alt=""
                width={1024}
                height={640}
                className="mt-8 aspect-video w-full rounded-lg border border-line object-cover"
              />
            )}
            <h2 className="mt-10 font-display text-2xl font-bold">Course details</h2>
            <dl className="mt-5 grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Category</dt>
                <dd className="mt-1">{item.category}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Duration</dt>
                <dd className="mt-1">{item.duration}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Level</dt>
                <dd className="mt-1">{item.level}</dd>
              </div>
            </dl>
            <details className="mt-10 border-y border-line py-4">
              <summary className="flex cursor-pointer justify-between font-semibold">
                Is this course suitable for me?
                <ChevronDown className="size-5" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">
                Review the displayed level and curriculum to choose the best fit.
              </p>
            </details>
          </div>
          <aside className="h-fit rounded-lg bg-surface p-6 border border-line">
            <p className="text-xs font-semibold uppercase text-accent">Instructor</p>
            <h2 className="mt-2 font-display text-2xl font-bold">{item.instructor}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {item.level} · {item.duration}
            </p>
            <p className="mt-6 text-sm text-muted-foreground">
              Individual course pricing and payment processing are not configured yet.
            </p>
            <Button className="mt-4 w-full" disabled title="Individual course checkout is not configured">
              Buy Course unavailable
            </Button>
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link to="/packages">Explore Packages</Link>
            </Button>
          </aside>
        </div>
      </main>
      )}
    </PublicLayout>
  );
}
