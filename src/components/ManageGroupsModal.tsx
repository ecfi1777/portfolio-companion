import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Plus, Check, X, ChevronUp, ChevronDown } from "lucide-react";
import type { WatchlistGroup } from "@/hooks/use-watchlist";

const PRESET_COLORS = ["#3498DB", "#2ECC71", "#E74C3C", "#9B59B6", "#F39C12", "#1ABC9C", "#E91E63", "#607D8B"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: WatchlistGroup[];
  onCreate: (data: { name: string; color?: string }) => Promise<void>;
  onUpdate: (id: string, data: { name?: string; color?: string; sort_order?: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ManageGroupsModal({ open, onOpenChange, groups, onCreate, onUpdate, onDelete }: Props) {
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WatchlistGroup | null>(null);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3498DB");

  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order);

  const startEdit = (g: WatchlistGroup) => {
    setEditId(g.id);
    setEditName(g.name);
    setEditColor(g.color ?? "#3498DB");
  };

  const saveEdit = async () => {
    if (!editId || !editName.trim()) return;
    await onUpdate(editId, { name: editName.trim(), color: editColor });
    setEditId(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await onCreate({ name: newName.trim(), color: newColor });
    setNewName("");
    setNewColor("#3498DB");
    setCreating(false);
  };

  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const current = sorted[index];
    const above = sorted[index - 1];
    await onUpdate(current.id, { sort_order: above.sort_order });
    await onUpdate(above.id, { sort_order: current.sort_order });
  };

  const handleMoveDown = async (index: number) => {
    if (index >= sorted.length - 1) return;
    const current = sorted[index];
    const below = sorted[index + 1];
    await onUpdate(current.id, { sort_order: below.sort_order });
    await onUpdate(below.id, { sort_order: current.sort_order });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Groups</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {sorted.map((group, idx) => (
              <div key={group.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                {editId === group.id ? (
                  <>
                    <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-6 w-6 rounded border-0 p-0 cursor-pointer" />
                    <Input className="h-7 flex-1 text-xs" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}><Check className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                    <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: group.color ?? "#888" }} />
                    <span className="text-sm font-medium flex-1">{group.name}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveUp(idx)} disabled={idx === 0}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveDown(idx)} disabled={idx === sorted.length - 1}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(group)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(group)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          {creating ? (
            <div className="space-y-2 rounded-md border border-dashed px-3 py-2">
              <div className="flex items-center gap-2">
                <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-6 w-6 rounded border-0 p-0 cursor-pointer" />
                <Input className="h-7 flex-1 text-xs" placeholder="Group name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCreate}><Check className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCreating(false)}><X className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="flex gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`h-5 w-5 rounded-full border-2 transition-all ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Group
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Entries in this group will become ungrouped. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
