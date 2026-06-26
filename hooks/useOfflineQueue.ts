'use client';

import { useEffect, useRef, useCallback } from 'react';

// ================================================================
// useOfflineQueue — IndexedDB-backed offline action queue
// Persists failed Supabase writes and flushes them when online.
// ================================================================

export interface QueuedAction {
  id: string;
  type: 'complete_lesson' | 'update_vocab' | 'update_kanji' | 'update_grammar' | 'update_streak';
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

const DB_NAME = 'velmorth_offline_queue';
const DB_VERSION = 1;
const STORE_NAME = 'actions';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllActions(): Promise<QueuedAction[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as QueuedAction[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function deleteAction(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silently fail
  }
}

async function putAction(action: QueuedAction): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(action);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silently fail
  }
}

export function useOfflineQueue() {
  const isFlushing = useRef(false);

  /** Enqueue an action for background/offline processing */
  const enqueue = useCallback(async (action: Omit<QueuedAction, 'id' | 'timestamp' | 'retries'>) => {
    const queued: QueuedAction = {
      ...action,
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      retries: 0,
    };
    await putAction(queued);
  }, []);

  /** Flush the queue by calling the provided executor per action type */
  const flush = useCallback(async (
    executor: (action: QueuedAction) => Promise<boolean>
  ) => {
    if (isFlushing.current || !navigator.onLine) return;
    isFlushing.current = true;
    try {
      const actions = await getAllActions();
      for (const action of actions.sort((a, b) => a.timestamp - b.timestamp)) {
        try {
          const success = await executor(action);
          if (success) {
            await deleteAction(action.id);
          } else if (action.retries < 5) {
            await putAction({ ...action, retries: action.retries + 1 });
          } else {
            // Max retries reached — drop the action
            await deleteAction(action.id);
          }
        } catch {
          if (action.retries >= 5) await deleteAction(action.id);
          else await putAction({ ...action, retries: action.retries + 1 });
        }
      }
    } finally {
      isFlushing.current = false;
    }
  }, []);

  /** Returns the current queue size */
  const getQueueSize = useCallback(async (): Promise<number> => {
    const actions = await getAllActions();
    return actions.length;
  }, []);

  return { enqueue, flush, getQueueSize };
}
