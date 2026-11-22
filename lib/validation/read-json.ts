import { NextResponse } from 'next/server';

/** Bound raw input before JSON parsing. Current forms fit within 16 KiB in UTF-8. */
export const MAX_JSON_BYTES = 16 * 1024;

const oversized = () => ({
  success: false as const,
  response: NextResponse.json({ error: 'حجم الطلب أكبر من المسموح' }, { status: 413 }),
});

/** Do not trust Content-Length alone: streamed or forged lengths use the same byte cap. */
export async function readJson(request: Request): Promise<
  | { success: true; data: unknown }
  | { success: false; response: NextResponse }
> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) return oversized();

  const reader = request.body?.getReader();
  if (!reader) {
    return {
      success: false,
      response: NextResponse.json({ error: 'صيغة JSON غير صالحة' }, { status: 400 }),
    };
  }
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined);
        return oversized();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { success: true, data: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: 'صيغة JSON غير صالحة' }, { status: 400 }),
    };
  } finally {
    reader.releaseLock();
  }
}
