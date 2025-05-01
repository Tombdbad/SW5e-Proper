import { createJSONStorage, PersistOptions } from 'zustand/middleware';
import { openDB, IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';

// Interface for consistent stored data
interface StorageItem<T> {
  version: number;
  state: T;
  timestamp: number;
  id: string;
}

// Type for conflict resolution callback
type ConflictResolver<T> = (local: StorageItem<T>, remote: StorageItem<T>) => StorageItem<T>;

// Default conflict resolver uses most recent version
const defaultConflictResolver = <T>(local: StorageItem<T>, remote: StorageItem<T>): StorageItem<T> => {
  if (local.version > remote.version) return local;
  if (remote.version > local.version) return remote;
  return local.timestamp > remote.timestamp ? local : remote;
};

/**
 * Configure storage with both IndexedDB and localStorage fallback
 */
export const createHybridStorage = <T>(
  options: {
    name: string;
    storeKey?: string;
    conflictResolver?: ConflictResolver<T>;
    syncInterval?: number; // ms
    onSyncConflict?: (local: T, remote: T, resolved: T) => void;
  }
) => {
  const {
    name,
    storeKey = 'state',
    conflictResolver = defaultConflictResolver,
    syncInterval = 30000, // Default: sync every 30 seconds
    onSyncConflict
  } = options;

  let db: IDBPDatabase | null = null;
  let syncTimer: ReturnType<typeof setInterval> | null = null;
  let lastSyncTimestamp = 0;

  // Initialize IndexedDB
  const initDB = async () => {
    if (db) return db;

    try {
      db = await openDB(`sw5e-${name}`, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(storeKey)) {
            const store = db.createObjectStore(storeKey, { keyPath: 'id' });
            store.createIndex('version', 'version');
            store.createIndex('timestamp', 'timestamp');
          }
        }
      });
      return db;
    } catch (err) {
      console.error(`Failed to initialize IndexedDB for ${name}:`, err);
      return null;
    }
  };

  // Start background sync for multi-tab support
  const startSync = () => {
    if (syncTimer) return;

    syncTimer = setInterval(async () => {
      try {
        // Check for updates from other tabs
        await syncWithOtherTabs();
      } catch (err) {
        console.error(`Error syncing ${name}:`, err);
      }
    }, syncInterval);
  };

  const stopSync = () => {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  };

  // Sync data between multiple tabs
  const syncWithOtherTabs = async () => {
    const currentData = getFromLocalStorage();
    if (!currentData) return;

    const idbData = await getFromIDB();
    if (!idbData) {
      // No IDB data, store our current data
      await saveToIDB(currentData);
      return;
    }

    // Check versions
    if (idbData.timestamp > lastSyncTimestamp) {
      // IDB has newer data, potential conflict
      if (idbData.version !== currentData.version) {
        // Resolve conflict
        const resolved = conflictResolver(currentData, idbData);

        // Notify if there was a conflict that needed resolution
        if (onSyncConflict && resolved !== currentData && resolved !== idbData) {
          onSyncConflict(currentData.state, idbData.state, resolved.state);
        }

        // Update localStorage with resolved state
        saveToLocalStorage(resolved);

        // Also update IDB with the resolved version
        await saveToIDB(resolved);

        // If we're using a custom event approach, broadcast the change
        window.dispatchEvent(new CustomEvent(`sw5e-${name}-updated`, { 
          detail: { state: resolved.state, source: 'sync' } 
        }));
      }

      lastSyncTimestamp = idbData.timestamp;
    } else if (currentData.timestamp > lastSyncTimestamp) {
      // We have newer data, update IDB
      await saveToIDB(currentData);
      lastSyncTimestamp = currentData.timestamp;
    }
  };

  // Get data from localStorage
  const getFromLocalStorage = (): StorageItem<T> | null => {
    try {
      const storedValue = localStorage.getItem(`sw5e-${name}`);
      if (!storedValue) return null;
      return JSON.parse(storedValue);
    } catch (err) {
      console.error(`Error reading ${name} from localStorage:`, err);
      return null;
    }
  };

  // Save data to localStorage
  const saveToLocalStorage = (item: StorageItem<T>) => {
    try {
      localStorage.setItem(`sw5e-${name}`, JSON.stringify(item));
    } catch (err) {
      console.error(`Error saving ${name} to localStorage:`, err);
    }
  };

  // Get data from IndexedDB
  const getFromIDB = async (): Promise<StorageItem<T> | null> => {
    try {
      const database = await initDB();
      if (!database) return null;

      const tx = database.transaction(storeKey, 'readonly');
      const store = tx.objectStore(storeKey);
      const items = await store.getAll();
      await tx.done;

      if (items.length === 0) return null;

      // Find highest version
      return items.reduce((max, item) => 
        item.version > max.version || 
        (item.version === max.version && item.timestamp > max.timestamp) 
          ? item : max, items[0]);
    } catch (err) {
      console.error(`Error reading ${name} from IndexedDB:`, err);
      return null;
    }
  };

  // Save data to IndexedDB
  const saveToIDB = async (item: StorageItem<T>) => {
    try {
      const database = await initDB();
      if (!database) return;

      const tx = database.transaction(storeKey, 'readwrite');
      const store = tx.objectStore(storeKey);
      await store.put(item);
      await tx.done;
    } catch (err) {
      console.error(`Error saving ${name} to IndexedDB:`, err);
    }
  };

  // Export state from local and IDB (for recovery/debugging)
  const exportState = async (): Promise<{
    localStorage: StorageItem<T> | null,
    indexedDB: StorageItem<T> | null
  }> => {
    const localData = getFromLocalStorage();
    const idbData = await getFromIDB();

    return {
      localStorage: localData,
      indexedDB: idbData
    };
  };

  // Import state (useful for recovery)
  const importState = async (state: T, version: number = 1): Promise<void> => {
    const item: StorageItem<T> = {
      version,
      state,
      timestamp: Date.now(),
      id: uuidv4()
    };

    saveToLocalStorage(item);
    await saveToIDB(item);

    // Notify subscribers
    window.dispatchEvent(new CustomEvent(`sw5e-${name}-updated`, { 
      detail: { state, source: 'import' } 
    }));
  };

  // Initialize database and start sync
  initDB().then(() => startSync());

  // Create Zustand-compatible storage object
  const storage = createJSONStorage<T>(() => ({
    getItem: async () => {
      // First check localStorage (fast)
      const localData = getFromLocalStorage();
      if (!localData) return null;

      // If there's an active DB connection, also check IDB for more recent data
      if (db) {
        try {
          const idbData = await getFromIDB();
          if (idbData && idbData.version > localData.version) {
            // IDB has newer data, update localStorage and return it
            saveToLocalStorage(idbData);
            return idbData.state;
          }
        } catch (err) {
          console.error('Error syncing with IndexedDB during getItem:', err);
        }
      }

      return localData.state;
    },

    setItem: async (_, newState) => {
      // Create storage item with incremented version
      const currentData = getFromLocalStorage();
      const version = currentData ? currentData.version + 1 : 1;

      const item: StorageItem<T> = {
        version,
        state: newState as T,
        timestamp: Date.now(),
        id: currentData?.id || uuidv4()
      };

      // Save to both storage mechanisms
      saveToLocalStorage(item);
      await saveToIDB(item);
      lastSyncTimestamp = item.timestamp;
    },

    removeItem: async (_) => {
      try {
        localStorage.removeItem(`sw5e-${name}`);

        const database = await initDB();
        if (database) {
          const tx = database.transaction(storeKey, 'readwrite');
          const store = tx.objectStore(storeKey);
          await store.clear();
          await tx.done;
        }
      } catch (err) {
        console.error(`Error clearing ${name} storage:`, err);
      }
    }
  }));

  // Return the storage and utility functions
  return {
    storage,
    utils: {
      exportState,
      importState,
      sync: syncWithOtherTabs,
      stopSync,
      startSync
    }
  };
};

/**
 * Create persistence options for a Zustand store
 */
export function createPersistOptions<T>(name: string): PersistOptions<T, string> {
  const { storage, utils } = createHybridStorage<T>({ 
    name,
    onSyncConflict: (local, remote, resolved) => {
      console.info(`Resolved sync conflict for ${name}`, { local, remote, resolved });
    }
  });

  // Attach utils to window for debugging
  if (typeof window !== 'undefined') {
    // @ts-ignore
    window.__SW5E_STORAGE = window.__SW5E_STORAGE || {};
    // @ts-ignore
    window.__SW5E_STORAGE[name] = utils;
  }

  return {
    name: `sw5e-${name}`,
    storage,
    partialize: (state) => {
      // We can filter out some properties here to keep storage size smaller
      const copy = { ...state };

      // Remove any calculated properties or large objects that can be recalculated
      // These property names should be customized for each store
      const omitKeys = ['derived', 'temporaryData', 'ui', 'calculated', '_internal'];

      for (const key of omitKeys) {
        if (key in copy) {
          delete (copy as any)[key];
        }
      }

      return copy;
    },
    onRehydrateStorage: (state) => {
      return (rehydratedState, error) => {
        if (error) {
          console.error(`Error rehydrating ${name} store:`, error);
        } else {
          console.debug(`${name} store rehydrated successfully`);
        }
      };
    },
    version: 1, // increment this when schema changes
  };
}

export default {
  createHybridStorage,
  createPersistOptions
};