import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, EyeOff, Eye, Plus, Check, X } from "lucide-react";
import type { Tag } from "@/hooks/use-watchlist";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: (Tag & { entry_count?: number })[];
  onCreate: (data: { short_code: string; full_name: string; color: string }) => Promise<void>;
  onUpdate: (id: string, data: { short_code?: string; full_name?: string; color?: string; is_active?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ManageTagsModal({ open, onOpenChange, tags, onCreate, onUpdate, onDelete }: Props) {
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(Tag & { entry_count?: number }) | null>(null);

  // New tag form
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3498DB");

  // Edit form
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const startEdit = (tag: Tag) => {
    setEditId(tag.id);
    setEditCode(tag.short_code);
    setEditName(tag.full_name ?? "");
    setEditColor(tag.color ?? "#3498DB");
  };

  const saveEdit = async () => {
    if (!editId || !editCode.trim()) return;
    await onUpdate(editId, {
      short_code: editCode.toUpperCase().trim(),
      full_name: editName.trim(),
      color: editColor,
    });
    setEditId(null);
  };

  const handleCreate = async () => {
    if (!newCode.trim() || !newName.trim()) return;
    await onCreate({ short_code: newCode.toUpperCase().trim(), full_name: newName.trim(), color: newColor });
    setNewCode("");
    setNewName("");
    setNewColor("#3498DB");
    setCreating(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Tags</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {tags.map((tag) => (
              <div key={tag.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${!tag.is_active ? "opacity-50" : ""}`}>
                {editId === tag.id ? (
                  <>
                    <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-6 w-6 rounded border-0 p-0 cursor-pointer" />
                    <Input className="h-7 w-16 text-xs" value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                    <Input className="h-7 flex-1 text-xs" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}><Check className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                    <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: tag.color ?? "#888" }} />
                    <span className="text-sm font-medium w-14">{tag.short_code}</span>
                    <span className="text-sm text-muted-foreground flex-1">{tag.full_name}</span>
                    <span className="text-xs text-muted-foreground">{tag.entry_count ?? 0} stocks</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(tag)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onUpdate(tag.id, { is_active: !tag.is_active })}
                    >
                      {tag.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(tag)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          {creating ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2">
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-6 w-6 rounded border-0 p-0 cursor-pointer" />
              <Input className="h-7 w-16 text-xs" placeholder="CODE" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
              <Input className="h-7 flex-1 text-xs" placeholder="Full Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCreate}><Check className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCreating(false)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New Tag
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag "{deleteTarget?.short_code}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {(deleteTarget?.entry_count ?? 0) > 0
                ? `This tag is assigned to ${deleteTarget?.entry_count} stock${(deleteTarget?.entry_count ?? 0) > 1 ? "s" : ""}. Deleting it will remove the association. This cannot be undone.`
                : "This tag has no stocks assigned. This cannot be undone."}
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
