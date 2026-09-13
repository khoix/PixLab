/**
 * M8.1 — the state seams `GameCanvas` splits along.
 *
 * `seams.ts` has the types the later stages extract against; `inventory.ts` has
 * the classification of all 45 refs with the evidence behind it, checked
 * against the component by `inventory.test.ts`.
 */
export type {
  EngineState,
  MirroredReactState,
  RenderState,
  InputState,
  OrchestrationState,
} from './seams';
export { STATE_INVENTORY, MODULE_LEVEL_STATE, cellsForSeam } from './inventory';
export type { Seam, StateCell } from './inventory';
