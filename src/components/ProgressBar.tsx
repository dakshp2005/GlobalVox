export default function ProgressBar({
  segments,
}: {
  segments: { value: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
      {total === 0
        ? null
        : segments.map((seg, i) =>
            seg.value > 0 ? (
              <div
                key={i}
                className={seg.color}
                style={{ width: `${(seg.value / total) * 100}%` }}
              />
            ) : null
          )}
    </div>
  );
}
