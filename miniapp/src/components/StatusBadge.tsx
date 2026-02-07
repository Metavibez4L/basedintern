"use client";

export function StatusBadge({ status }: { status: "live" | "offline" }) {
  const isLive = status === "live";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-sm ${
        isLive
          ? "bg-neon-blue/10 text-neon-blue border border-neon-blue/40"
          : "bg-red-500/10 text-red-400 border border-red-500/30"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          isLive ? "bg-neon-blue live-pulse" : "bg-red-500"
        }`}
      />
      {isLive ? "LIVE" : "OFFLINE"}
    </span>
  );
}
