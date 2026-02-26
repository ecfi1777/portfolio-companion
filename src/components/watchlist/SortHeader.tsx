import { TableHead } from "@/components/ui/table";
import { ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";

interface SortHeaderProps<T extends string> {
  label: string;
  sortKey: T;
  currentKey: T;
  currentDir: "asc" | "desc";
  onSort: (k: T) => void;
  className?: string;
}

export function SortHeader<T extends string>({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className,
}: SortHeaderProps<T>) {
  const active = currentKey === sortKey;
  const isRight = className?.includes("text-right");
  const isCenter = className?.includes("text-center");
  return (
    <TableHead className={`cursor-pointer select-none group ${className ?? ""}`} onClick={() => onSort(sortKey)}>
      <div className={`flex items-center gap-1 ${isRight ? "justify-end" : isCenter ? "justify-center" : ""}`}>
        {label}
        {active ? (
          currentDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </div>
    </TableHead>
  );
}
