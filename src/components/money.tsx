import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBp, formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";

export function Rp({ value, signed = false, className }: { value: number | null | undefined; signed?: boolean; className?: string }) {
  if (value === null || value === undefined) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const text = signed && value > 0 ? `+${formatRupiah(value)}` : formatRupiah(value);
  return <span className={cn("tabular-nums", signed && value > 0 && "text-emerald-700 dark:text-emerald-400", signed && value < 0 && "text-red-600 dark:text-red-400", className)}>{text}</span>;
}

export function Pct({ bp, digits = 1, className }: { bp: number | null | undefined; digits?: number; className?: string }) {
  if (bp === null || bp === undefined) return <span className={cn("text-muted-foreground", className)}>—</span>;
  return <span className={cn("tabular-nums", className)}>{formatBp(bp, digits)}</span>;
}

export type StatusKind = "actual" | "planned" | "projected" | "locked" | "superseded";

const STATUS_STYLE: Record<StatusKind, { label: string; className: string }> = {
  actual: { label: "Aktual", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800" },
  locked: { label: "Historis (terkunci)", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800" },
  planned: { label: "Planned", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-800" },
  projected: { label: "Proyeksi", className: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200 border-sky-300 dark:border-sky-800" },
  superseded: { label: "Digantikan", className: "bg-muted text-muted-foreground" },
};

export function StatusBadge({ status, className }: { status: StatusKind | string; className?: string }) {
  const s = STATUS_STYLE[status as StatusKind] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={cn("font-normal", s.className, className)}>
      {s.label}
    </Badge>
  );
}

export function StatCard({
  title,
  value,
  hint,
  tone = "neutral",
  children,
}: {
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn";
  children?: React.ReactNode;
}) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription className="text-xs uppercase tracking-wide">{title}</CardDescription>
        <CardTitle
          className={cn(
            "text-xl tabular-nums sm:text-2xl",
            tone === "good" && "text-emerald-700 dark:text-emerald-400",
            tone === "bad" && "text-red-600 dark:text-red-400",
            tone === "warn" && "text-amber-700 dark:text-amber-400",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {(hint || children) && (
        <CardContent className="px-4 text-xs text-muted-foreground">
          {hint}
          {children}
        </CardContent>
      )}
    </Card>
  );
}

export function EmptyState({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Disclaimer({ children }: { children?: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      {children ?? "Semua proyeksi memakai asumsi yang Anda tetapkan sendiri (bukan data pasar) dan bukan jaminan hasil investasi. Ubah asumsi di halaman Proyeksi."}
    </p>
  );
}
