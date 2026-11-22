import { NextResponse } from 'next/server';

import { WRITE_PAUSED_MESSAGE } from './write-maintenance-message';

/** Server-only, fail closed on a typo. Never interprets request headers as config. */
export function areNewWritesPaused(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env.DIRECTORY_WRITE_PAUSED;
  return value !== undefined && value !== '' && value !== 'false';
}

/** Gate only new POSTs. Does not interrupt in-flight work or status reconciliation. */
export function pausedWriteResponse(env: Readonly<Record<string, string | undefined>> = process.env): NextResponse | null {
  if (!areNewWritesPaused(env)) return null;
  return NextResponse.json({ code: 'WRITE_PAUSED', error: WRITE_PAUSED_MESSAGE }, {
    status: 503,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
