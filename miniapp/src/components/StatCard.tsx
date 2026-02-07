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
    <div className="bg-cyber-card border border-cyber-border rounded-xl p-3 card-glow">
      <p className="text-[10px] text-cyber-muted uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-lg font-bold text-neon-blue truncate">{value}</p>
      {sub && (
        <p className="text-xs text-cyber-muted mt-0.5 truncate">{sub}</p>
      )}
    </div>
  );
}
