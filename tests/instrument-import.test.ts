import { describe, expect, it } from "vitest";
import { coverageReport, isValidIsin, parseInstrumentCsv } from "../src/domain/instrument-import";

const header = "isin,name,exposure,leverage,direction,fundCurrency,ticker,exchange,currency,timezone,country,wrapper";
// US0378331005 (Apple) and GB0002634946 are published ISINs with valid check digits.
describe("ISIN check digit", () => {
  it("accepts valid ISINs and rejects altered ones", () => {
    expect(isValidIsin("US0378331005")).toBe(true);
    expect(isValidIsin("GB0002634946")).toBe(true);
    expect(isValidIsin("US0378331006")).toBe(false);
    expect(isValidIsin("us0378331005")).toBe(false);
    expect(isValidIsin("")).toBe(false);
  });
});

describe("instrument CSV import", () => {
  it("parses valid rows and reports each bad row with its line number", () => {
    const csv = [header,
      "GB0002634946,Example fund,BROAD_EQUITY,1,LONG,GBP,EXMP,LSE,GBP,Europe/London,GB,ISA",
      "GB0002634947,Bad check digit,BROAD_EQUITY,1,LONG,GBP,BAD,LSE,GBP,Europe/London,GB,ISA",
      "GB0002634946,Unknown exposure,VOO,1,LONG,GBP,EXMP2,LSE,GBP,Europe/London,GB,ISA"].join("\n");
    const result = parseInstrumentCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].isin).toBe("GB0002634946");
    expect(result.errors.map((e) => e.line)).toEqual([3, 4]);
    expect(result.errors[0].message).toContain("ISIN");
    expect(result.errors[1].message).toContain("registry");
  });
  it("rejects a file with missing columns, an empty file, and duplicate rows", () => {
    expect(parseInstrumentCsv("isin,name").errors[0].message).toContain("Missing columns");
    expect(parseInstrumentCsv("").errors[0].message).toContain("empty");
    const row = "GB0002634946,Example,BROAD_EQUITY,1,LONG,GBP,EXMP,LSE,GBP,Europe/London,GB,ISA";
    expect(parseInstrumentCsv([header, row, row].join("\n")).errors[0].message).toContain("duplicate");
  });
  it("handles quoted commas and a byte-order mark", () => {
    const csv = "﻿" + [header, 'GB0002634946,"Example, Acc",BROAD_EQUITY,1,LONG,GBP,EXMP,LSE,GBP,Europe/London,GB,ISA'].join("\r\n");
    expect(parseInstrumentCsv(csv).rows[0].name).toBe("Example, Acc");
  });
});

describe("coverage report", () => {
  const mappings = [
    { exposure: "BROAD_EQUITY", country: "GB", wrapper: "ISA", fidelity: "EXACT" },
    { exposure: "GOLD", country: "GB", wrapper: "ISA", fidelity: "CANDIDATE" },
    { exposure: "GOLD", country: "US", wrapper: "TAXABLE", fidelity: "EXACT" }
  ];
  it("distinguishes ready, candidate-only and missing per country and wrapper", () => {
    expect(coverageReport(["GOLD", "BROAD_EQUITY", "LONG_TREASURY", "GOLD"], mappings, "GB", "ISA")).toEqual([
      { exposure: "BROAD_EQUITY", status: "READY" },
      { exposure: "GOLD", status: "CANDIDATE_ONLY" },
      { exposure: "LONG_TREASURY", status: "MISSING" }
    ]);
  });
});

import { readFileSync } from "node:fs";
describe("candidates never reach customers", () => {
  it("customer-facing instrument pickers only accept EXACT mappings", () => {
    for (const file of ["src/app/app/strategies/[id]/page.tsx", "src/app/api/strategies/[id]/overrides/route.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("m.fidelity='EXACT'");
    }
  });
});
