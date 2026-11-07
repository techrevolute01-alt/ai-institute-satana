import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { roleHome, useMyRoles } from "@/lib/auth";
import { INSTITUTE, telHref } from "@/lib/institute-info";

export function Brand() {
  return (
    <Link to="/" aria-label="AI Institute Satana home" className="flex items-center gap-2">
      <span className="size-5 rounded-[3px] bg-accent border border-line" />
      <span className="flex flex-col font-display leading-none">
        <span className="text-lg font-bold">AI Institute</span>
        <span className="mt-1 text-xs font-semibold">Satana</span>
      </span>
    </Link>
  );
}

const links = [
  ["Packages", "/packages"],
  ["Courses", "/courses"],
  ["About", "/about"],
  ["Contact", "/contact"],
] as const;
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  const roles = useMyRoles();
  const home = roleHome(roles ?? []);
  async function logout() {
    await supabase.auth.signOut();
    setOpen(false);
  }
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Brand />
        <nav className="hidden items-center gap-7 md:flex">
          {links.map(([l, to]) => (
            <Link
              key={to}
              to={to}
              className="text-sm font-medium text-muted-foreground hover:text-primary"
              activeProps={{ className: "text-primary" }}
            >
              {l}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 sm:flex">
          {signedIn ? (
            <>
              <Button variant="ghost" onClick={() => void logout()}>
                Log out
              </Button>
              <Button asChild variant="accent">
                <Link to={home}>My dashboard</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link to="/login" search={{}}>
                  Log in
                </Link>
              </Button>
              <Button asChild variant="accent">
                <Link to="/register">Start learning</Link>
              </Button>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          aria-label="Toggle navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <nav className="grid gap-1 border-t border-line bg-surface p-4 sm:hidden">
          {links.map(([l, to]) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-sm font-semibold hover:bg-secondary hover:text-primary"
              activeProps={{ className: "bg-secondary text-primary" }}
            >
              {l}
            </Link>
          ))}
          {signedIn ? (
            <>
              <Link to={home} className="px-3 py-3 text-sm font-semibold">
                My dashboard
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="px-3 py-3 text-left text-sm font-semibold"
              >
                Log out
              </button>
            </>
          ) : (
            <Link to="/login" search={{}} className="px-3 py-3 text-sm font-semibold">
              Log in
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Brand />
            <p className="mt-3 text-sm text-muted-foreground">Learn. Grow. Earn.</p>
          </div>
          <nav aria-label="Quick Links">
            <h2 className="font-display text-base font-bold">Quick Links</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {(
                [
                  ["Home", "/"],
                  ["About Us", "/about"],
                  ["Contact Us", "/contact"],
                  ["Courses", "/courses"],
                  ["Packages", "/packages"],
                ] as const
              ).map(([label, to]) => (
                <li key={to}>
                  <Link to={to} className="hover:text-accent">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Policies">
            <h2 className="font-display text-base font-bold">Policies</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {(
                [
                  ["Privacy Policy", "/privacy-policy"],
                  ["Refund Policy", "/refund-policy"],
                  ["Return Policy", "/return-policy"],
                  ["Disclaimer", "/disclaimer"],
                ] as const
              ).map(([label, to]) => (
                <li key={to}>
                  <Link to={to} className="hover:text-accent">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <address className="not-italic">
            <h2 className="font-display text-base font-bold">Contact Details</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {INSTITUTE.phones.map((phone) => (
                <li key={phone}>
                  <a href={telHref(phone)} className="hover:text-accent">
                    {phone}
                  </a>
                </li>
              ))}
              <li>
                <a href={`mailto:${INSTITUTE.email}`} className="break-all hover:text-accent">
                  {INSTITUTE.email}
                </a>
              </li>
              <li>
                <a
                  href={INSTITUTE.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent"
                >
                  {INSTITUTE.address}
                </a>
              </li>
            </ul>
          </address>
        </div>
        <div className="mt-8 border-t border-line pt-5 text-sm text-muted-foreground">
          © 2026 AI Institute Satana. All Rights Reserved.
        </div>
      </div>
    </footer>
  );
}
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-secondary">
      <div className="grain absolute inset-0 opacity-[.05]" />
      <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="text-xs font-semibold uppercase text-accent">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-none sm:text-6xl">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}
