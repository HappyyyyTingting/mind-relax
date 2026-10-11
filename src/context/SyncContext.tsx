import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { syncService, type SyncStatus } from '../services/SyncService';

interface SyncState {
  status: SyncStatus;
  retry: () => void;
}

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>(() => syncService.getStatus());

  useEffect(() => {
    return syncService.subscribe(setStatus);
  }, []);

  const retry = () => {
    void syncService.align();
  };

  return (
    <SyncContext.Provider value={{ status, retry }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
