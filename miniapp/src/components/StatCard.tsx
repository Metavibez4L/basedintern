export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-intern-card border border-intern-border rounded-xl p-3">
      <p className="text-[10px] text-intern-muted uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-lg font-bold text-white truncate">{value}</p>
      {sub && (
        <p className="text-xs text-intern-muted mt-0.5 truncate">{sub}</p>
      )}
    </div>
  );
}
