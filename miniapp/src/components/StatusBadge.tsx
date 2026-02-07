"use client";

export function StatusBadge({ status }: { status: "live" | "offline" }) {
  const isLive = status === "live";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
        isLive
          ? "bg-intern-green/10 text-intern-green border border-intern-green/30"
          : "bg-red-500/10 text-red-400 border border-red-500/30"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          isLive ? "bg-intern-green live-pulse" : "bg-red-500"
        }`}
      />
      {isLive ? "LIVE" : "OFFLINE"}
    </span>
  );
}
