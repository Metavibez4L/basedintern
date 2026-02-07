import { BASESCAN_TX_URL } from "@/lib/constants";
import type { ActionLogEntry } from "@/lib/api";

const typeIcons: Record<string, string> = {
  trade: "📊",
  lp: "💧",
  social: "📢",
  news: "📰",
};

const typeColors: Record<string, string> = {
  trade: "text-yellow-400",
  lp: "text-blue-400",
  social: "text-purple-400",
  news: "text-cyan-400",
};

export function ActionCard({ action }: { action: ActionLogEntry }) {
  const icon = typeIcons[action.type] ?? "⚡";
  const color = typeColors[action.type] ?? "text-white";
  const timeAgo = getTimeAgo(action.timestamp);

  return (
    <div className="bg-intern-card border border-intern-border rounded-xl p-4 hover:border-intern-green/30 transition-colors">
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${color}`}
            >
              {action.type}
            </span>
            <span className="text-xs text-intern-muted">{timeAgo}</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            {action.summary}
          </p>
          {action.txHash && (
            <a
              href={BASESCAN_TX_URL(action.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-intern-green hover:underline mt-2 inline-block"
            >
              View on BaseScan →
            </a>
          )}
          {action.platform && (
            <span className="text-xs text-intern-muted ml-3">
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
