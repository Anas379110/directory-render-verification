export type ReadinessResult = { ok: true; skipped: true } | {
  ok: true; skipped: false; tlsAuthorized: true; limitedRoleChecked: true;
  readOnlyTransactions: 2; claimsCleared: true; poolClosed: true;
};
export class RestrictedDbReadinessError extends Error { stage: string; code: string | null; }
export function runRestrictedDbReadiness(options?: {
  env?: Readonly<Record<string, string | undefined>>;
  Pool?: typeof import('pg').Pool;
  expectedRuntimeRole?: string;
}): Promise<ReadinessResult>;
