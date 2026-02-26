import type { WatchlistGroup } from "@/hooks/use-watchlist";

interface WatchlistGroupTabsProps {
  sortedGroups: WatchlistGroup[];
  groupTab: string;
  onSelect: (id: string) => void;
}

export function WatchlistGroupTabs({ sortedGroups, groupTab, onSelect }: WatchlistGroupTabsProps) {
  if (sortedGroups.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      <button
        onClick={() => onSelect("all")}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
          groupTab === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
        }`}
      >
        All
      </button>
      {sortedGroups.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelect(g.id)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            groupTab === g.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
          }`}
        >
          {g.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />}
          {g.name}
        </button>
      ))}
      <button
        onClick={() => onSelect("__ungrouped__")}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
          groupTab === "__ungrouped__" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
        }`}
      >
        Ungrouped
      </button>
    </div>
  );
}
