export function checkModeratorCapabilities(client: {query(sql: string, params?: unknown[]): Promise<{rows: Record<string,unknown>[]}>}, actor: string): Promise<void>;
