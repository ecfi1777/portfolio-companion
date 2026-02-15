export interface ParsedPosition {
  symbol: string;
  companyName: string;
  shares: number;
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  account: string;
}

export interface ParseResult {
  positions: ParsedPosition[];
  cashBalance: number;
  errors: string[];
}

const CASH_SYMBOLS = ["SPAXX", "FDRXX", "FCASH"];

function cleanNumber(value: string): number {
  if (!value || value === "n/a" || value === "--" || value === "") return 0;
  // Remove $, commas, and whitespace
  const cleaned = value.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function cleanString(value: string): string {
  return value ? value.trim() : "";
}

export function parseFidelityCSV(csvText: string): ParseResult {
  const errors: string[] = [];
  const lines = csvText.split(/\r?\n/);

  // Find header row — Fidelity CSVs may have preamble lines
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("symbol") && lower.includes("quantity") || lower.includes("symbol") && lower.includes("shares")) {
      headerIndex = i;
      break;
    }
    // Also check for "Account Name/Number" pattern
    if (lower.includes("account") && (lower.includes("symbol") || lower.includes("description"))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    errors.push("Could not find a valid header row. Expected columns like Symbol, Quantity/Shares, etc.");
    return { positions: [], cashBalance: 0, errors };
  }

  // Parse headers — handle trailing spaces
  const headers = parseCSVLine(lines[headerIndex]).map((h) => h.trim().toLowerCase());

  // Map column names to indices (Fidelity uses various column names)
  const colMap = {
    symbol: findCol(headers, ["symbol"]),
    company: findCol(headers, ["description", "security description", "company name", "name"]),
    shares: findCol(headers, ["quantity", "shares"]),
    price: findCol(headers, ["last price", "current price", "price"]),
    value: findCol(headers, ["current value", "value", "market value"]),
    costBasis: findCol(headers, ["cost basis total", "cost basis", "total cost basis"]),
    account: findCol(headers, ["account name/number", "account name", "account number", "account"]),
  };

  if (colMap.symbol === -1) {
    errors.push("Could not find 'Symbol' column.");
    return { positions: [], cashBalance: 0, errors };
  }

  const rawPositions: ParsedPosition[] = [];
  let cashBalance = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const symbol = cleanString(cols[colMap.symbol] ?? "").toUpperCase();

    // Skip empty or footer rows
    if (!symbol || symbol.startsWith("TOTAL") || symbol === "") continue;

    const value = cleanNumber(cols[colMap.value] ?? "");
    const shares = cleanNumber(cols[colMap.shares] ?? "");

    // Detect cash equivalents
    if (CASH_SYMBOLS.includes(symbol) || symbol.includes("**")) {
      cashBalance += value || shares; // some show cash as value, some as quantity
      continue;
    }

    // Skip "Pending Activity" or similar non-position rows
    if (symbol.includes("PENDING") || shares === 0) continue;

    rawPositions.push({
      symbol,
      companyName: cleanString(cols[colMap.company] ?? ""),
      shares,
      currentPrice: cleanNumber(cols[colMap.price] ?? ""),
      currentValue: value,
      costBasis: cleanNumber(cols[colMap.costBasis] ?? ""),
      account: cleanString(cols[colMap.account] ?? ""),
    });
  }

  // Aggregate by symbol
  const aggregated = new Map<string, ParsedPosition>();
  for (const p of rawPositions) {
    const existing = aggregated.get(p.symbol);
    if (existing) {
      existing.shares += p.shares;
      existing.currentValue += p.currentValue;
      existing.costBasis += p.costBasis;
      // Keep the higher price (they should be the same across accounts)
      existing.currentPrice = Math.max(existing.currentPrice, p.currentPrice);
      // Combine account names
      if (p.account && !existing.account.includes(p.account)) {
        existing.account = existing.account ? `${existing.account}, ${p.account}` : p.account;
      }
    } else {
      aggregated.set(p.symbol, { ...p });
    }
  }

  const positions = Array.from(aggregated.values()).sort(
    (a, b) => b.currentValue - a.currentValue
  );

  return { positions, cashBalance, errors };
}

function findCol(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
