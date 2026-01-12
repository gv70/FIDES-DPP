/**
 * React hook for the client-side tx log.
 *
 * @license Apache-2.0
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TxLogAction, TxLogEntry } from '@/lib/tx/tx-log';
import { appendTxLog, clearTxLog, readTxLog } from '@/lib/tx/tx-log';

export function useTxLog(params?: { address?: string }) {
  const address = (params?.address || '').trim();
  const [items, setItems] = useState<TxLogEntry[]>([]);

  const refresh = useCallback(() => {
    const all = readTxLog();
    if (!address) {
      setItems(all);
      return;
    }
    setItems(all.filter((e) => String(e.address).trim() === address));
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(
    (input: { address: string; action: TxLogAction; txHash: string; tokenId?: string; network?: string; pilotId?: string }) => {
      const entry = appendTxLog(input);
      refresh();
      return entry;
    },
    [refresh]
  );

  const clear = useCallback(() => {
    clearTxLog();
    refresh();
  }, [refresh]);

  const byAction = useMemo(() => {
    const grouped = new Map<TxLogAction, TxLogEntry[]>();
    for (const entry of items) {
      const action = entry.action;
      grouped.set(action, [...(grouped.get(action) || []), entry]);
    }
    return grouped;
  }, [items]);

  return { items, byAction, refresh, add, clear };
}

