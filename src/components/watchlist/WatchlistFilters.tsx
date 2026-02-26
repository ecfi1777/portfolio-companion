import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Search, ChevronDown, X, Flame } from "lucide-react";

type PerfFilter = "all" | "gainers" | "losers";

/* ── Multi-select filter dropdown ── */
export function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string; color?: string | null }[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const count = selected.size;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          {label}
          {count > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {count}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        {options.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
            <Checkbox
              checked={selected.has(opt.value)}
              onCheckedChange={() => onToggle(opt.value)}
            />
            {opt.color && (
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
            )}
            {opt.label}
          </label>
        ))}
        {options.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">None available</p>}
      </PopoverContent>
    </Popover>
  );
}

interface WatchlistFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  tagOptions: { value: string; label: string; color?: string | null }[];
  capOptions: { value: string; label: string }[];
  groupOptions: { value: string; label: string; color?: string | null }[];
  sectorOptions: { value: string; label: string }[];
  selectedTags: Set<string>;
  selectedCaps: Set<string>;
  selectedGroups: Set<string>;
  selectedSectors: Set<string>;
  onToggleTag: (value: string) => void;
  onToggleCap: (value: string) => void;
  onToggleGroup: (value: string) => void;
  onToggleSector: (value: string) => void;
  perfFilter: PerfFilter;
  onPerfFilterChange: (value: PerfFilter) => void;
  screenedFilter: boolean;
  onScreenedFilterChange: (value: boolean) => void;
  hasScreenHits: boolean;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  activeFilters: number;
  onClearFilters: () => void;
}

export function WatchlistFilters({
  search,
  onSearchChange,
  tagOptions,
  capOptions,
  groupOptions,
  sectorOptions,
  selectedTags,
  selectedCaps,
  selectedGroups,
  selectedSectors,
  onToggleTag,
  onToggleCap,
  onToggleGroup,
  onToggleSector,
  perfFilter,
  onPerfFilterChange,
  screenedFilter,
  onScreenedFilterChange,
  hasScreenHits,
  showArchived,
  onShowArchivedChange,
  activeFilters,
  onClearFilters,
}: WatchlistFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search symbol or company..." className="pl-9 h-8" value={search} onChange={(e) => onSearchChange(e.target.value)} />
      </div>

      <FilterDropdown label="Tags" options={tagOptions} selected={selectedTags} onToggle={onToggleTag} />
      <FilterDropdown label="Mkt Cap" options={capOptions} selected={selectedCaps} onToggle={onToggleCap} />
      <FilterDropdown label="Group" options={groupOptions} selected={selectedGroups} onToggle={onToggleGroup} />
      <FilterDropdown label="Sector" options={sectorOptions} selected={selectedSectors} onToggle={onToggleSector} />

      {/* Performance toggle */}
      <div className="flex items-center rounded-md border border-border h-8 text-xs">
        {(["all", "gainers", "losers"] as PerfFilter[]).map((pf) => (
          <button
            key={pf}
            onClick={() => onPerfFilterChange(pf)}
            className={`px-3 h-full capitalize transition-colors ${
              perfFilter === pf ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            } ${pf === "all" ? "rounded-l-md" : pf === "losers" ? "rounded-r-md" : ""}`}
          >
            {pf}
          </button>
        ))}
      </div>

      {/* Screened filter toggle */}
      {hasScreenHits && (
        <Button
          variant={screenedFilter ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => onScreenedFilterChange(!screenedFilter)}
        >
          <Flame className="h-3 w-3" />
          Screened
        </Button>
      )}

      {/* Show Archived toggle */}
      <div className="flex items-center gap-2 h-8">
        <Switch checked={showArchived} onCheckedChange={onShowArchivedChange} id="show-archived" />
        <Label htmlFor="show-archived" className="text-xs cursor-pointer">Show Archived</Label>
      </div>

      {activeFilters > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClearFilters}>
          Clear filters
          <X className="ml-1 h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
