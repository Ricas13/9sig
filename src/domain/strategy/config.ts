import Decimal from "decimal.js";

export type StrategyInputField = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "boolean";
  required?: boolean;
  help?: string;
  default?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  min?: string | number;
  max?: string | number;
};

const MAX_TEXT_LENGTH = 500;
const MAX_ABS_NUMBER = new Decimal("1e15");

function isCalendarDate(text: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseDecimal(value: unknown) {
  if (value !== null && typeof value === "object") return null;
  try {
    const decimal = new Decimal(String(value));
    return decimal.isFinite() && decimal.abs().lte(MAX_ABS_NUMBER) ? decimal : null;
  } catch {
    return null;
  }
}

// One validator for user input and for schema defaults. Returns the stored value, or throws the
// error code `onInvalid` so a bad default is reported as a schema problem, not at first use.
function coerceValue(field: StrategyInputField, value: unknown, onInvalid: string): unknown {
  const invalid = () => new Error(onInvalid);
  switch (field.type) {
    case "boolean":
      // Anything else used to become false silently, so a typo turned a safeguard off.
      if (value === true || value === "true") return true;
      if (value === false || value === "false") return false;
      throw invalid();
    case "number": {
      const decimal = parseDecimal(value);
      if (!decimal) throw invalid();
      if (field.min != null && decimal.lt(String(field.min))) throw invalid();
      if (field.max != null && decimal.gt(String(field.max))) throw invalid();
      return decimal.toString();
    }
    case "date":
      if (typeof value !== "string" || !isCalendarDate(value)) throw invalid();
      return value;
    case "select":
      if (typeof value !== "string" || !field.options?.some((option) => option.value === value)) throw invalid();
      return value;
    default:
      if ((typeof value !== "string" && typeof value !== "number") || String(value).length > MAX_TEXT_LENGTH) throw invalid();
      return String(value);
  }
}

export function parseInputSchema(raw: unknown): StrategyInputField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.map((field) => {
    if (!field || typeof field !== "object") throw new Error("INVALID_INPUT_SCHEMA");
    const value = field as Record<string, unknown>;
    const type = String(value.type ?? "");
    if (!["text","number","date","select","boolean"].includes(type)) throw new Error("INVALID_INPUT_SCHEMA");
    const key = String(value.key ?? "");
    const label = String(value.label ?? "");
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || !label) throw new Error("INVALID_INPUT_SCHEMA");
    if (seen.has(key)) throw new Error("INVALID_INPUT_SCHEMA");
    seen.add(key);
    const options = Array.isArray(value.options) ? value.options.map((option) => {
      if (!option || typeof option !== "object") throw new Error("INVALID_INPUT_SCHEMA");
      const item = option as Record<string, unknown>;
      return { label: String(item.label ?? item.value ?? ""), value: String(item.value ?? "") };
    }) : undefined;
    if (type === "select") {
      if (!options || options.length === 0) throw new Error("INVALID_INPUT_SCHEMA");
      const values = options.map((option) => option.value);
      if (values.some((optionValue) => !optionValue) || new Set(values).size !== values.length) throw new Error("INVALID_INPUT_SCHEMA");
    }
    if (type === "number") {
      const min = value.min == null ? null : parseDecimal(value.min);
      const max = value.max == null ? null : parseDecimal(value.max);
      if ((value.min != null && !min) || (value.max != null && !max) || (min && max && min.gt(max))) throw new Error("INVALID_INPUT_SCHEMA");
    }
    const parsed: StrategyInputField = {
      key,
      label,
      type: type as StrategyInputField["type"],
      required: Boolean(value.required),
      help: value.help == null ? undefined : String(value.help),
      default: value.default as StrategyInputField["default"],
      options,
      min: value.min as StrategyInputField["min"],
      max: value.max as StrategyInputField["max"]
    };
    if (parsed.default !== undefined && parsed.default !== null && parsed.default !== "") coerceValue(parsed, parsed.default, "INVALID_INPUT_SCHEMA");
    return parsed;
  });
}

export function validateInstanceSettings(schema: StrategyInputField[], raw: Record<string, unknown> | undefined) {
  const input = raw ?? {};
  const allowed = new Set(schema.map((field) => field.key));
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error("UNKNOWN_STRATEGY_INPUT");
  const result: Record<string, unknown> = {};

  for (const field of schema) {
    // Own properties only: input["constructor"] would otherwise read Object's inherited function.
    const supplied = Object.hasOwn(input, field.key) ? input[field.key] : undefined;
    const value = supplied ?? field.default;
    const missing = value === undefined || value === null || value === "";
    if (missing) {
      if (field.required) throw new Error("MISSING_STRATEGY_INPUT:" + field.key);
      continue;
    }
    result[field.key] = coerceValue(field, value, "INVALID_STRATEGY_INPUT:" + field.key);
  }
  return result;
}
