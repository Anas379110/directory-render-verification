'use client';

import { useCallback, useEffect, useRef } from 'react';
import Script from 'next/script';

type Turnstile = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
  reset(id: string): void;
};
/** Supabase Auth consumes this token. Do not call local Siteverify with it. */
export default function AuthChallenge({ onToken, generation }: { onToken: (value: string) => void; generation: number }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  useEffect(() => { callback.current = onToken; }, [onToken]);
  const render = useCallback(() => {
    const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (!api || !container.current || widget.current !== null || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return;
    widget.current = api.render(container.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      callback: (value: string) => callback.current(value),
      'error-callback': () => callback.current(''),
      'expired-callback': () => callback.current(''),
    });
  }, []);
  useEffect(() => {
    render();
    return () => {
      const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (widget.current !== null) api?.remove(widget.current);
      widget.current = null;
    };
  }, [render]);
  useEffect(() => {
    callback.current('');
    const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (widget.current !== null) api?.reset(widget.current);
  }, [generation]);
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={render} onReady={render} />
    <div ref={container} />
    {!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && <p role="alert">التحقق الأمني غير مهيأ حاليًا.</p>}
  </>;
}
