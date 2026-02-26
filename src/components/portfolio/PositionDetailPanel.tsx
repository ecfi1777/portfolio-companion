import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Calendar, X, Plus } from "lucide-react";
import { CategorySelector } from "@/components/CategorySelector";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import { hexToRgba } from "@/lib/portfolio-utils";

type Position = Tables<"positions">;
type TagRow = Tables<"tags">;
type Category = string | null;
type Tier = string | null;

export function TagBadge({ tag, onRemove }: { tag: TagRow; onRemove?: () => void }) {
  const color = tag.color || "#64748b";
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md border font-medium group"
      style={{
        backgroundColor: hexToRgba(color, 0.2),
        color: color,
        borderColor: hexToRgba(color, 0.4),
      }}
    >
      {tag.short_code}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function PositionDetailPanel({
  position,
  onUpdate,
  onDelete,
  onCategoryUpdate,
  tierCounts,
  categoryCounts,
  positionTags,
  allTags,
  onAddTag,
  onRemoveTag,
}: {
  position: Position;
  onUpdate: (updates: Partial<Position>) => void;
  onDelete: () => void;
  onCategoryUpdate: (cat: Category, tier: Tier) => void;
  tierCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  positionTags: TagRow[];
  allTags: TagRow[];
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(position.notes ?? "");
  const [source, setSource] = useState(position.source ?? "");
  const [deleting, setDeleting] = useState(false);
  const [addTagOpen, setAddTagOpen] = useState(false);

  const assignedTagIds = new Set(positionTags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !assignedTagIds.has(t.id) && t.is_active);

  const saveField = async (field: "notes" | "source", value: string) => {
    const update: Record<string, string | null> = { [field]: value || null };
    const { error } = await supabase
      .from("positions")
      .update(update)
      .eq("id", position.id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      onUpdate({ [field]: value || null });
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from("positions").delete().eq("id", position.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      setDeleting(false);
    } else {
      onDelete();
    }
  };

  const firstSeen = position.first_seen_at;

  return (
    <div className="px-6 py-4 space-y-4">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <Calendar className="h-3.5 w-3.5" />
        <span>
          {firstSeen
            ? `Tracked since ${format(new Date(firstSeen), "MMM d, yyyy")}`
            : "—"}
        </span>
      </div>

      {/* Tags section */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Tags</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {positionTags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} onRemove={() => onRemoveTag(tag.id)} />
          ))}
          <Popover open={addTagOpen} onOpenChange={setAddTagOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              {availableTags.length === 0 ? (
                <p className="text-xs text-muted-foreground p-1">No more tags available</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-left text-sm"
                      onClick={() => { onAddTag(tag.id); setAddTagOpen(false); }}
                    >
                      <TagBadge tag={tag} />
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (position.notes ?? "")) saveField("notes", notes);
            }}
            placeholder="Add a note..."
            className="min-h-[60px] text-sm resize-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Source</label>
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onBlur={() => {
              if (source !== (position.source ?? "")) saveField("source", source);
            }}
            placeholder="Where did you find this pick?"
            className="text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Reclassify:</span>
          <CategorySelector
            positionId={position.id}
            category={position.category as Category}
            tier={position.tier}
            onUpdate={onCategoryUpdate}
            tierCounts={tierCounts}
            categoryCounts={categoryCounts}
          />
        </div>
        <div className="ml-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {position.symbol} from portfolio?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. This position may reappear if it's still in your brokerage data on the next import.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? "Removing..." : "Remove"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
