const STYLES: Record<string, string> = {
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-rose-100 text-rose-800",
  UNDECIDED: "bg-amber-100 text-amber-800",
  PENDING: "bg-zinc-100 text-zinc-700",
  IN_PROGRESS: "bg-sky-100 text-sky-800",
  FAILED: "bg-red-100 text-red-800",
  INVALID: "bg-zinc-200 text-zinc-500",
  DRAFT: "bg-zinc-100 text-zinc-700",
  RUNNING: "bg-sky-100 text-sky-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  NO_ANSWER: "bg-orange-100 text-orange-800",
  PROVIDER_ERROR: "bg-red-100 text-red-800",
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? "bg-zinc-100 text-zinc-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
