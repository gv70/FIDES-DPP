/**
 * Pilot Context (client-side)
 *
 * Stores the current Pilot DID in localStorage so users don't need to copy/paste it
 * across create/update flows.
 *
 * @license Apache-2.0
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'fidesdpp.pilotContext.v1';

export type PilotContext = {
  pilotId: string;
  did: string;
  createdAt: string;
};

function safeParse(value: string | null): PilotContext | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.pilotId !== 'string') return null;
    if (typeof parsed.did !== 'string') return null;
    if (typeof parsed.createdAt !== 'string') return null;
    return parsed as PilotContext;
  } catch {
    return null;
  }
}

function readFromStorage(): PilotContext | null {
  if (typeof window === 'undefined') return null;
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function setPilotContext(ctx: { pilotId: string; did: string }) {
  if (typeof window === 'undefined') return;
  const payload: PilotContext = {
    pilotId: String(ctx.pilotId),
    did: String(ctx.did),
    createdAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event('fidesdpp:pilotContext'));
}

export function clearPilotContext() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('fidesdpp:pilotContext'));
}

export function usePilotContext() {
  const [pilotContext, setState] = useState<PilotContext | null>(null);

  const refresh = useCallback(() => {
    setState(readFromStorage());
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh();
    };
    const onCustom = () => refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener('fidesdpp:pilotContext', onCustom as any);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('fidesdpp:pilotContext', onCustom as any);
    };
  }, [refresh]);

  return {
    pilotContext,
    pilotDid: pilotContext?.did || '',
    pilotId: pilotContext?.pilotId || '',
    setPilot: setPilotContext,
    clearPilot: clearPilotContext,
    refresh,
  };
}

