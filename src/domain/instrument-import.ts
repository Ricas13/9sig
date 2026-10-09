import { isRegisteredExposure } from "./strategy/exposures";

/**
 * Bulk instrument candidates from a CSV. Everything imported here is a CANDIDATE: the resolver only
 * accepts fidelity EXACT for financial actions, so a candidate can never drive a trade until a person
 * verifies it against the fund's documents and promotes it.
 */
export const IMPORT_COLUMNS = ["isin", "name", "exposure", "leverage", "direction", "fundCurrency", "ticker", "exchange", "currency", "timezone", "country", "wrapper"] as const;

export type CandidateRow = {
  isin: string; name: string; exposure: string; leverage: string; direction: "LONG" | "SHORT";
  fundCurrency: string; ticker: string; exchange: string; currency: string; timezone: string;
  country: string; wrapper: string;
};
export type ImportResult = { rows: CandidateRow[]; errors: Array<{ line: number; message: string }> };

/** ISO 6166 check digit: letters become two digits, then Luhn over the digit string. */
export function isValidIsin(value: string) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value)) return false;
  const digits = value.split("").map((char) => (/[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char)).join("");
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (double) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { cells.push(cell); cell = ""; } else cell += char;
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

export function parseInstrumentCsv(text: string): ImportResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  const result: ImportResult = { rows: [], errors: [] };
  if (!lines.length) return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };
  const header = splitCsvLine(lines[0]);
  const missing = IMPORT_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) return { rows: [], errors: [{ line: 1, message: "Missing columns: " + missing.join(", ") }] };
  const seen = new Set<string>();
  lines.slice(1).forEach((line, index) => {
    const lineNumber = index + 2;
    const cells = splitCsvLine(line);
    const get = (column: (typeof IMPORT_COLUMNS)[number]) => cells[header.indexOf(column)] ?? "";
    const problems: string[] = [];
    const isin = get("isin").toUpperCase();
    if (!isValidIsin(isin)) problems.push("ISIN is not valid");
    if (!get("name")) problems.push("name is required");
    const exposure = get("exposure");
    if (!isRegisteredExposure(exposure)) problems.push("exposure is not in the registry");
    const leverage = get("leverage") || "1";
    if (!/^\d+(\.\d+)?$/.test(leverage) || Number(leverage) <= 0) problems.push("leverage must be a positive number");
    const direction = (get("direction") || "LONG").toUpperCase();
    if (direction !== "LONG" && direction !== "SHORT") problems.push("direction must be LONG or SHORT");
    const currency = get("currency").toUpperCase();
    const fundCurrency = (get("fundCurrency") || currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency) || !/^[A-Z]{3}$/.test(fundCurrency)) problems.push("currencies must be 3-letter codes");
    const country = get("country").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) problems.push("country must be a 2-letter code");
    if (!get("ticker") || !get("exchange") || !get("timezone") || !get("wrapper")) problems.push("ticker, exchange, timezone and wrapper are required");
    const key = [isin, get("exchange"), get("ticker"), country, get("wrapper")].join("|");
    if (seen.has(key)) problems.push("duplicate of an earlier row");
    seen.add(key);
    if (problems.length) result.errors.push({ line: lineNumber, message: problems.join("; ") });
    else result.rows.push({ isin, name: get("name"), exposure, leverage, direction: direction as "LONG" | "SHORT", fundCurrency, ticker: get("ticker"), exchange: get("exchange"), currency, timezone: get("timezone"), country, wrapper: get("wrapper") });
  });
  return result;
}

export type CoverageMapping = { exposure: string; country: string; wrapper: string; fidelity: string };
export type CoverageRow = { exposure: string; status: "READY" | "CANDIDATE_ONLY" | "MISSING" };

/** For one country and wrapper: which required exposures can trade (EXACT), are only candidates, or are missing. */
export function coverageReport(required: readonly string[], mappings: readonly CoverageMapping[], country: string, wrapper: string): CoverageRow[] {
  return [...new Set(required)].sort().map((exposure) => {
    const here = mappings.filter((m) => m.exposure === exposure && m.country === country && m.wrapper === wrapper);
    const status = here.some((m) => m.fidelity === "EXACT") ? "READY" : here.length ? "CANDIDATE_ONLY" : "MISSING";
    return { exposure, status };
  });
}
