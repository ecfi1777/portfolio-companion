/** Generic CSV parser that returns headers and rows */

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export interface GenericCSVResult {
  headers: string[];
  rows: string[][];
}

export function parseGenericCSV(csvText: string): GenericCSVResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Find header row — first line with at least 2 comma-separated values
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const parsed = parseCSVLine(lines[i]);
    if (parsed.length >= 2) {
      headerIdx = i;
      break;
    }
  }

  const headers = parseCSVLine(lines[headerIdx]);
  const rows: string[][] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.some((c) => c.length > 0)) {
      rows.push(row);
    }
  }

  return { headers, rows };
}

/** Auto-detect which column index likely contains ticker symbols */
export function detectSymbolColumn(headers: string[], rows: string[][]): number {
  // Check header names first
  const symbolKeywords = ["symbol", "ticker", "stock", "sym"];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (symbolKeywords.some((k) => h.includes(k))) return i;
  }

  // Heuristic: column with mostly short uppercase alphanumeric values
  const tickerPattern = /^[A-Z]{1,5}$/;
  let bestIdx = 0;
  let bestScore = 0;
  for (let col = 0; col < headers.length; col++) {
    const matches = rows.filter((r) => r[col] && tickerPattern.test(r[col].trim())).length;
    const score = matches / Math.max(rows.length, 1);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = col;
    }
  }
  return bestScore > 0.3 ? bestIdx : 0;
}
