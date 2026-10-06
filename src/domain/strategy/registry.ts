import type { StrategyEngine } from "./types";
import { valueTargetEngine } from "./value-target";
import { fixedAllocationEngine } from "./fixed-allocation";

const engines = new Map<string, StrategyEngine>([
  [valueTargetEngine.key, valueTargetEngine],
  [fixedAllocationEngine.key, fixedAllocationEngine]
]);

export function getStrategyEngine(key: string) {
  const engine = engines.get(key);
  if (!engine) throw new Error("Unsupported strategy engine: " + key);
  return engine;
}

export function supportedEngineKeys() {
  return [...engines.keys()];
}
