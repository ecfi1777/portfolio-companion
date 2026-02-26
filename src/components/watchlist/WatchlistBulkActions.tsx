import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Archive, EyeOff, Trash2, Folder, ChevronDown } from "lucide-react";
import type { WatchlistEntry, WatchlistGroup } from "@/hooks/use-watchlist";
import { toast } from "@/hooks/use-toast";

interface WatchlistBulkActionsProps {
  selectedIds: Set<string>;
  entries: WatchlistEntry[];
  sortedGroups: WatchlistGroup[];
  onArchive: (ids: string[]) => Promise<void>;
  onUnarchive: (ids: string[]) => Promise<void>;
  onAssignGroup: (ids: string[], groupId: string | null) => Promise<void>;
  onDeleteClick: () => void;
  onClearSelection: () => void;
}

export function WatchlistBulkActions({
  selectedIds,
  entries,
  sortedGroups,
  onArchive,
  onUnarchive,
  onAssignGroup,
  onDeleteClick,
  onClearSelection,
}: WatchlistBulkActionsProps) {
  if (selectedIds.size === 0) return null;

  const selectedEntries = entries.filter((e) => selectedIds.has(e.id));
  const hasArchivedSelected = selectedEntries.some((e) => e.archived_at);

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
      <span className="text-sm font-medium">{selectedIds.size} selected</span>
      <div className="flex items-center gap-2">
        {hasArchivedSelected ? (
          <Button variant="outline" size="sm" onClick={async () => {
            const ids = [...selectedIds];
            await onUnarchive(ids);
            onClearSelection();
            toast({ title: `Unarchived ${ids.length} entries` });
          }}>
            <EyeOff className="mr-1 h-4 w-4" />
            Unarchive Selected
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={async () => {
            const ids = [...selectedIds];
            await onArchive(ids);
            onClearSelection();
            toast({ title: `Archived ${ids.length} entries` });
          }}>
            <Archive className="mr-1 h-4 w-4" />
            Archive Selected
          </Button>
        )}
        {/* Move to Group dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Folder className="mr-1 h-4 w-4" />
              Move to Group
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="end">
            <button
              className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
              onClick={async () => {
                await onAssignGroup([...selectedIds], null);
                onClearSelection();
                toast({ title: `Moved ${selectedIds.size} entries to Ungrouped` });
              }}
            >
              Ungrouped
            </button>
            {sortedGroups.map((g) => (
              <button
                key={g.id}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-left"
                onClick={async () => {
                  await onAssignGroup([...selectedIds], g.id);
                  onClearSelection();
                  toast({ title: `Moved ${selectedIds.size} entries to ${g.name}` });
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color ?? "#888" }} />
                {g.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <Button variant="destructive" size="sm" onClick={onDeleteClick}>
          <Trash2 className="mr-1 h-4 w-4" />
          Delete Selected
        </Button>
      </div>
    </div>
  );
}
