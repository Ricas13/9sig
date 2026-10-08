import type { StrategyEngine } from "./types";
import { valueTargetEngine } from "./value-target";
import { fixedAllocationEngine } from "./fixed-allocation";
import { momentumRotationEngine } from "./momentum-rotation";

const engines = new Map<string, StrategyEngine>([
  [valueTargetEngine.key, valueTargetEngine],
  [fixedAllocationEngine.key, fixedAllocationEngine],
  [momentumRotationEngine.key, momentumRotationEngine]
]);

export function getStrategyEngine(key: string) {
  const engine = engines.get(key);
  if (!engine) throw new Error("Unsupported strategy engine: " + key);
  return engine;
}

export function validateEngineConfig(key: string, config: Record<string, unknown>) {
  getStrategyEngine(key).validateConfig(config);
}

export function supportedEngineKeys() {
  return [...engines.keys()];
}
