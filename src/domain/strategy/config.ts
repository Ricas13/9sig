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

export function parseInputSchema(raw: unknown): StrategyInputField[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((field) => {
    if (!field || typeof field !== "object") throw new Error("INVALID_INPUT_SCHEMA");
    const value = field as Record<string, unknown>;
    const type = String(value.type ?? "");
    if (!["text","number","date","select","boolean"].includes(type)) throw new Error("INVALID_INPUT_SCHEMA");
    const key = String(value.key ?? "");
    const label = String(value.label ?? "");
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || !label) throw new Error("INVALID_INPUT_SCHEMA");
    const options = Array.isArray(value.options) ? value.options.map((option) => {
      if (!option || typeof option !== "object") throw new Error("INVALID_INPUT_SCHEMA");
      const item = option as Record<string, unknown>;
      return { label: String(item.label ?? item.value ?? ""), value: String(item.value ?? "") };
    }) : undefined;
    if (type === "select" && (!options || options.length === 0)) throw new Error("INVALID_INPUT_SCHEMA");
    return {
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
  });
}

export function validateInstanceSettings(schema: StrategyInputField[], raw: Record<string, unknown> | undefined) {
  const input = raw ?? {};
  const allowed = new Set(schema.map((field) => field.key));
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error("UNKNOWN_STRATEGY_INPUT");
  const result: Record<string, unknown> = {};

  for (const field of schema) {
    const value = input[field.key] ?? field.default;
    const missing = value === undefined || value === null || value === "";
    if (missing) {
      if (field.required) throw new Error("MISSING_STRATEGY_INPUT:" + field.key);
      continue;
    }
    if (field.type === "boolean") {
      result[field.key] = value === true || value === "true";
      continue;
    }
    if (field.type === "number") {
      const decimal = new Decimal(String(value));
      if (!decimal.isFinite()) throw new Error("INVALID_STRATEGY_INPUT:" + field.key);
      if (field.min != null && decimal.lt(String(field.min))) throw new Error("INVALID_STRATEGY_INPUT:" + field.key);
      if (field.max != null && decimal.gt(String(field.max))) throw new Error("INVALID_STRATEGY_INPUT:" + field.key);
      result[field.key] = decimal.toString();
      continue;
    }
    const text = String(value);
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("INVALID_STRATEGY_INPUT:" + field.key);
    if (field.type === "select" && !field.options?.some((option) => option.value === text)) throw new Error("INVALID_STRATEGY_INPUT:" + field.key);
    result[field.key] = text;
  }
  return result;
}
