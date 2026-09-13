// `@turboslide/export/batch`: the batched Perfect export's plan and merge (gslides-parity SPEC-2
// 8.1, 0.48) under the one entry the integrator named at merge 1. `./batch/plan` is the
// isomorphic half a page may import (no node module); this entry reaches merge.ts, which reads
// and writes files, so only server code imports it. Named re-exports, no `export *` (SPEC 3.3).
export {
  BATCH_BUDGET_S,
  BATCH_SIZE_VARIABLE,
  EXPORT_BATCH_SIZE,
  JOB_ID_PATTERN,
  JOB_MAX_AGE_MS,
  MARGIN,
  PARTS_DIR,
  PLAN_FILE,
  SECONDS_PER_SLIDE,
  assetHashes,
  batchRecordName,
  batchSize,
  deckExportsPrefix,
  derivedBatchSize,
  isStale,
  jobIdNow,
  jobPrefix,
  jobStartedAt,
  leftWords,
  partNames,
  partsPrefix,
  planBatches,
  planKey,
  planPlayList,
  referencedAssets,
  secondsLeft,
  staleJobPaths,
} from './plan.ts';
export type { AssetHash, BatchExportInput, ExportPlan, StoredEntry } from './plan.ts';
export {
  localizeScene,
  mergeParts,
  readSceneParts,
  relocateScene,
  scenePartName,
  wordmarkPartName,
  zipStoredFiles,
} from './merge.ts';
export type { BatchRecord, MergeDeps, MergeParts, MergeResult, PartUpload } from './merge.ts';
