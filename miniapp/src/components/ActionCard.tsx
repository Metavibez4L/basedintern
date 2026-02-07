import { BASESCAN_TX_URL } from "@/lib/constants";
import type { ActionLogEntry } from "@/lib/api";

const typeIcons: Record<string, string> = {
  trade: "⚡",
  lp: "💎",
  social: "🔗",
  news: "📡",
};

const typeColors: Record<string, string> = {
  trade: "text-neon-blue",
  lp: "text-neon-purple",
  social: "text-cyan-300",
  news: "text-blue-300",
};

const typeBorders: Record<string, string> = {
  trade: "border-l-neon-blue",
  lp: "border-l-neon-purple",
  social: "border-l-cyan-300",
  news: "border-l-blue-300",
};

export function ActionCard({ action }: { action: ActionLogEntry }) {
  const icon = typeIcons[action.type] ?? "⚡";
  const color = typeColors[action.type] ?? "text-white";
  const borderL = typeBorders[action.type] ?? "border-l-neon-blue";
  const timeAgo = getTimeAgo(action.timestamp);

  return (
    <div
      className={`bg-cyber-card border border-cyber-border ${borderL} border-l-2 rounded-xl p-4 card-glow group`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5 group-hover:scale-110 transition-transform">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${color}`}
            >
              {action.type}
            </span>
            <span className="text-xs text-cyber-muted">{timeAgo}</span>
          </div>
          <p className="text-sm text-cyber-text leading-relaxed">
            {action.summary}
          </p>
          {action.txHash && (
            <a
              href={BASESCAN_TX_URL(action.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neon-blue hover:text-neon-blue-dim hover:underline mt-2 inline-block transition-colors"
            >
              View on BaseScan →
            </a>
          )}
          {action.platform && (
            <span className="text-xs text-cyber-muted ml-3">
              via {action.platform}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
