import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { PageIntro, PublicLayout } from "@/components/skillora/layout";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { getPublicPackage } from "@/lib/package-courses.functions";
export const Route = createFileRoute("/packages/$slug")({
  head: () => ({
    meta: [
      { title: "Package Details — AI Institute" },
      {
        name: "description",
        content: "Review package pricing, features, and included AI Institute courses.",
      },
      { property: "og:title", content: "Package Details — AI Institute" },
      {
        property: "og:description",
        content: "Everything included in your AI Institute learning package.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  const { slug } = Route.useParams();
  const {
    data: item,
    isPending,
    error,
  } = useQuery({
    queryKey: ["public-package", slug],
    queryFn: () => getPublicPackage({ data: { slug } }),
    retry: false,
  });
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(v);
  const discount =
    item && item.original_price > 0
      ? Math.round((1 - item.selling_price / item.original_price) * 100)
      : 0;
  return (
    <PublicLayout>
      {isPending ? (
        <main className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-20 text-muted-foreground sm:px-8">
          <Loader2 className="size-4 animate-spin" />
          Loading package details…
        </main>
      ) : error ? (
        <main className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <p role="alert" className="text-sm text-destructive">
            Package details are temporarily unavailable. Please try again later.
          </p>
        </main>
      ) : !item ? (
        <>
          <PageIntro
            eyebrow="Learning packages"
            title="Package not found"
            description="This package is not currently published."
          />
          <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
            <Button asChild variant="outline">
              <Link to="/packages">Browse available packages</Link>
            </Button>
          </main>
        </>
      ) : (
        <main className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <Link to="/packages" className="text-sm font-semibold text-brand">
            ← All packages
          </Link>
          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
            <div>
              {item.thumbnail_url && (
                <img
                  src={item.thumbnail_url}
                  alt=""
                  width={1200}
                  height={675}
                  className="mb-8 aspect-video w-full rounded-lg border border-line object-cover"
                />
              )}
              <p className="text-xs font-semibold uppercase text-accent">
                {item.courses.length} included courses
              </p>
              <h1 className="mt-3 font-display text-5xl font-bold">{item.name}</h1>
              <p className="mt-5 text-lg text-muted-foreground">{item.description}</p>
              <h2 className="mt-10 font-display text-2xl font-bold">Package benefits</h2>
              {item.features.length ? (
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {item.features.map((feature) => (
                    <li className="flex gap-2" key={feature}>
                      <Check className="size-5 text-success" />
                      {feature}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Package benefits have not been listed yet.
                </p>
              )}
              {item.includedPackages.length > 0 && (
                <>
                  <h2 className="mt-10 font-display text-2xl font-bold">Included packages</h2>
                  <ul className="mt-5 flex flex-wrap gap-3">
                    {item.includedPackages.map((includedPackage) => (
                      <li key={includedPackage.slug}>
                        <Link
                          to="/packages/$slug"
                          params={{ slug: includedPackage.slug }}
                          className="inline-flex rounded-full border border-line px-4 py-1.5 text-sm font-semibold hover:bg-surface"
                        >
                          {includedPackage.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <h2 className="mt-10 font-display text-2xl font-bold">Courses included</h2>
              <div className="mt-5 divide-y divide-line border-y border-line">
                {item.courses.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    No published courses are currently included.
                  </p>
                ) : (
                  item.courses.map((course, i) => (
                    <article className="py-4" key={course.slug}>
                      <div className="flex flex-wrap justify-between gap-2">
                        <Link
                          to="/courses/$slug"
                          params={{ slug: course.slug }}
                          className="font-semibold hover:text-primary"
                        >
                          {String(i + 1).padStart(2, "0")} · {course.title}
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {course.level}
                          {course.duration_minutes > 0 &&
                            ` · ${Math.ceil(course.duration_minutes / 60)} hrs`}
                        </span>
                      </div>
                      {course.description && (
                        <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
                      )}
                    </article>
                  ))
                )}
              </div>
              <h2 className="mt-10 font-display text-2xl font-bold">FAQ</h2>
              <details className="mt-5 border-y border-line py-4">
                <summary className="flex cursor-pointer justify-between font-semibold">
                  When will payment be available?
                  <ChevronDown className="size-5" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">
                  Checkout is available for review, but payment cannot be completed until a payment
                  provider is configured.
                </p>
              </details>
            </div>
            <aside className="h-fit rounded-lg border border-line bg-surface p-6 lg:sticky lg:top-24">
              {item.original_price > item.selling_price && (
                <span className="text-sm text-muted-foreground line-through">
                  {fmt(item.original_price)}
                </span>
              )}
              <p className="font-display text-4xl font-bold">{fmt(item.selling_price)}</p>
              {discount > 0 && (
                <p className="mt-2 text-sm font-semibold text-success">Save {discount}%</p>
              )}
              <Button asChild className="mt-6 w-full">
                <Link to="/register" search={{ redirect: `/checkout/${slug}` }}>
                  Buy Package
                </Link>
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                No payment will be taken until a provider is configured.
              </p>
            </aside>
          </div>
        </main>
      )}
    </PublicLayout>
  );
}
