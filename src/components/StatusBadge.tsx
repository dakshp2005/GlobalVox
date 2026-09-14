const CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  CONFIRMED: { bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500" },
  DECLINED: { bg: "bg-rose-50", text: "text-rose-800", dot: "bg-rose-500" },
  UNDECIDED: { bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-500" },
  PENDING: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
  IN_PROGRESS: { bg: "bg-sky-50", text: "text-sky-800", dot: "bg-sky-500" },
  FAILED: { bg: "bg-red-50", text: "text-red-800", dot: "bg-red-500" },
  INVALID: { bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-300" },
  DRAFT: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
  RUNNING: { bg: "bg-sky-50", text: "text-sky-800", dot: "bg-sky-500" },
  COMPLETED: { bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500" },
  NO_ANSWER: { bg: "bg-orange-50", text: "text-orange-800", dot: "bg-orange-500" },
  PROVIDER_ERROR: { bg: "bg-red-50", text: "text-red-800", dot: "bg-red-500" },
};

export default function StatusBadge({
  status,
  size = "md",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const cfg = CONFIG[status] ?? {
    bg: "bg-slate-100",
    text: "text-slate-700",
    dot: "bg-slate-400",
  };
  const padding = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold tracking-wide ${padding} ${cfg.bg} ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {status.replace("_", " ")}
    </span>
  );
}
