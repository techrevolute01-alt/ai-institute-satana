import { DashboardShell } from "./dashboard";
export type WorkspaceMode = "student" | "affiliate" | "admin";
export function WorkspacePage({
  mode,
  eyebrow,
  title,
  description,
}: {
  mode: WorkspaceMode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <DashboardShell mode={mode}>
      <p className="text-xs font-semibold uppercase text-accent">{eyebrow}</p>
      <h1 className="mt-2 font-display text-4xl font-bold">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
      <section className="mt-8 rounded-lg bg-surface p-6 border border-line">
        <h2 className="font-display text-2xl font-bold">Ready for your data</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          This workspace is securely connected to your AI Institute account. Its operational features
          will be added in the relevant future phase.
        </p>
      </section>
    </DashboardShell>
  );
}
