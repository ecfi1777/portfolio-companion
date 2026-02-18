export interface AccountBreakdown {
  account: string;
  shares: number;
  value: number;
}

export interface ParsedPosition {
  symbol: string;
  companyName: string;
  shares: number;
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  accounts: AccountBreakdown[];
}

export interface CashBreakdown {
  account: string;
  shares: number;
  value: number;
}

export interface ParseResult {
  positions: ParsedPosition[];
  cashBalance: number;
  cashAccounts: CashBreakdown[];
  errors: string[];
  fileCount: number;
}

const CASH_SYMBOLS = ["SPAXX", "FDRXX", "FCASH"];

function cleanNumber(value: string): number {
  if (!value || value === "n/a" || value === "--" || value === "") return 0;
  const cleaned = value.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function cleanString(value: string): string {
  return value ? value.trim() : "";
}

/** Parse a single Fidelity CSV and return raw (non-aggregated) positions + cash */
function parseSingleCSV(csvText: string): { positions: ParsedPosition[]; cashBalance: number; cashAccounts: CashBreakdown[]; errors: string[] } {
  const errors: string[] = [];
  const lines = csvText.split(/\r?\n/);

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("symbol") && lower.includes("quantity") || lower.includes("symbol") && lower.includes("shares")) {
      headerIndex = i;
      break;
    }
    if (lower.includes("account") && (lower.includes("symbol") || lower.includes("description"))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    errors.push("Could not find a valid header row.");
    return { positions: [], cashBalance: 0, cashAccounts: [], errors };
  }

  const headers = parseCSVLine(lines[headerIndex]).map((h) => h.trim().toLowerCase());

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
    return { positions: [], cashBalance: 0, cashAccounts: [], errors };
  }

  const positions: ParsedPosition[] = [];
  let cashBalance = 0;
  const cashAccounts: CashBreakdown[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const symbol = cleanString(cols[colMap.symbol] ?? "").toUpperCase();

    if (!symbol || symbol.startsWith("TOTAL") || symbol === "") continue;

    const value = cleanNumber(cols[colMap.value] ?? "");
    const shares = cleanNumber(cols[colMap.shares] ?? "");

    if (CASH_SYMBOLS.includes(symbol) || symbol.includes("**")) {
      const cashAmt = value || shares;
      cashBalance += cashAmt;
      const accountName = cleanString(cols[colMap.account] ?? "");
      if (accountName && cashAmt > 0) {
        cashAccounts.push({ account: accountName, shares: cashAmt, value: cashAmt });
      }
      continue;
    }

    if (symbol.includes("PENDING") || shares === 0) continue;

    const accountName = cleanString(cols[colMap.account] ?? "");

    positions.push({
      symbol,
      companyName: cleanString(cols[colMap.company] ?? ""),
      shares,
      currentPrice: cleanNumber(cols[colMap.price] ?? ""),
      currentValue: value,
      costBasis: cleanNumber(cols[colMap.costBasis] ?? ""),
      accounts: accountName ? [{ account: accountName, shares, value }] : [],
    });
  }

  return { positions, cashBalance, cashAccounts, errors };
}

/** Merge new positions into an existing aggregated map */
function mergePositions(
  aggregated: Map<string, ParsedPosition>,
  newPositions: ParsedPosition[]
) {
  for (const p of newPositions) {
    const existing = aggregated.get(p.symbol);
    if (existing) {
      existing.shares += p.shares;
      existing.currentValue += p.currentValue;
      existing.costBasis += p.costBasis;
      existing.currentPrice = Math.max(existing.currentPrice, p.currentPrice);
      // Merge account breakdowns
      for (const acct of p.accounts) {
        const existingAcct = existing.accounts.find((a) => a.account === acct.account);
        if (existingAcct) {
          existingAcct.shares += acct.shares;
          existingAcct.value += acct.value;
        } else {
          existing.accounts.push({ ...acct });
        }
      }
    } else {
      aggregated.set(p.symbol, { ...p, accounts: p.accounts.map((a) => ({ ...a })) });
    }
  }
}

/** Parse and merge multiple Fidelity CSVs into a single result */
export function parseFidelityCSVs(csvTexts: string[]): ParseResult {
  const aggregated = new Map<string, ParsedPosition>();
  let cashBalance = 0;
  const allCashAccounts: CashBreakdown[] = [];
  const allErrors: string[] = [];

  for (const text of csvTexts) {
    const result = parseSingleCSV(text);
    allErrors.push(...result.errors);
    cashBalance += result.cashBalance;
    mergePositions(aggregated, result.positions);
    // Merge cash account breakdowns
    for (const ca of result.cashAccounts) {
      const existing = allCashAccounts.find((a) => a.account === ca.account);
      if (existing) {
        existing.shares += ca.shares;
        existing.value += ca.value;
      } else {
        allCashAccounts.push({ ...ca });
      }
    }
  }

  const positions = Array.from(aggregated.values()).sort(
    (a, b) => b.currentValue - a.currentValue
  );

  return { positions, cashBalance, cashAccounts: allCashAccounts, errors: allErrors, fileCount: csvTexts.length };
}

/** Convenience: parse a single CSV (backwards-compatible) */
export function parseFidelityCSV(csvText: string): ParseResult {
  return parseFidelityCSVs([csvText]);
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
