import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { StateStorage } from 'zustand/middleware';

// Define our database schema
interface SW5EDatabase extends DBSchema {
  characters: {
    key: string;
    value: any;
  };
  campaigns: {
    key: string;
    value: any;
  };
  gameState: {
    key: string;
    value: any;
  };
  combatState: {
    key: string;
    value: any;
  };
  syncLog: {
    key: string;
    value: {
      id: string;
      timestamp: number;
      operation: 'create' | 'update' | 'delete';
      entityType: 'character' | 'campaign';
      entityId: string;
      data: any;
      synced: boolean;
    };
  };
}

// Database version
const DB_VERSION = 1;
const DB_NAME = 'sw5e-app-storage';

// Create and initialize the database
const initDB = async (): Promise<IDBPDatabase<SW5EDatabase>> => {
  return openDB<SW5EDatabase>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Characters store
      if (!db.objectStoreNames.contains('characters')) {
        db.createObjectStore('characters');
      }

      // Campaigns store
      if (!db.objectStoreNames.contains('campaigns')) {
        db.createObjectStore('campaigns');
      }

      // Game state store
      if (!db.objectStoreNames.contains('gameState')) {
        db.createObjectStore('gameState');
      }

      // Combat state store
      if (!db.objectStoreNames.contains('combatState')) {
        db.createObjectStore('combatState');
      }

      // Sync log store with index
      if (!db.objectStoreNames.contains('syncLog')) {
        const syncStore = db.createObjectStore('syncLog', { keyPath: 'id' });
        syncStore.createIndex('by_synced', 'synced');
        syncStore.createIndex('by_entity', ['entityType', 'entityId']);
      }
    },
  });
};

// Initialize database connection
let dbPromise = initDB();

// Create a storage object for Zustand persist middleware that uses IndexedDB
export const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const db = await dbPromise;
      const [type, key] = name.split(':');

      // Handle different store types
      if (type && key) {
        switch (type) {
          case 'character':
            return JSON.stringify(await db.get('characters', key));
          case 'campaign':
            return JSON.stringify(await db.get('campaigns', key));
          case 'gameState':
            return JSON.stringify(await db.get('gameState', key));
          case 'combatState':
            return JSON.stringify(await db.get('combatState', key));
          default:
            return JSON.stringify(await db.get(type as any, key));
        }
      }

      // Full store retrieval (for Zustand persist)
      return JSON.stringify(await db.get('gameState', name));
    } catch (error) {
      console.error('Error retrieving from IndexedDB:', error);
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const db = await dbPromise;
      const [type, key] = name.split(':');
      const parsedValue = JSON.parse(value);

      // Handle different store types
      if (type && key) {
        switch (type) {
          case 'character':
            await db.put('characters', parsedValue, key);
            // Log sync operation
            await db.add('syncLog', {
              id: `${Date.now()}-${key}`,
              timestamp: Date.now(),
              operation: 'update',
              entityType: 'character',
              entityId: key,
              data: parsedValue,
              synced: false,
            });
            break;
          case 'campaign':
            await db.put('campaigns', parsedValue, key);
            // Log sync operation
            await db.add('syncLog', {
              id: `${Date.now()}-${key}`,
              timestamp: Date.now(),
              operation: 'update',
              entityType: 'campaign',
              entityId: key,
              data: parsedValue,
              synced: false,
            });
            break;
          case 'gameState':
            await db.put('gameState', parsedValue, key);
            break;
          case 'combatState':
            await db.put('combatState', parsedValue, key);
            break;
          default:
            await db.put(type as any, parsedValue, key);
        }
      } else {
        // Full store storage (for Zustand persist)
        await db.put('gameState', parsedValue, name);
      }
    } catch (error) {
      console.error('Error storing in IndexedDB:', error);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      const db = await dbPromise;
      const [type, key] = name.split(':');

      // Handle different store types
      if (type && key) {
        switch (type) {
          case 'character':
            await db.delete('characters', key);
            // Log sync operation
            await db.add('syncLog', {
              id: `${Date.now()}-${key}`,
              timestamp: Date.now(),
              operation: 'delete',
              entityType: 'character',
              entityId: key,
              data: null,
              synced: false,
            });
            break;
          case 'campaign':
            await db.delete('campaigns', key);
            // Log sync operation
            await db.add('syncLog', {
              id: `${Date.now()}-${key}`,
              timestamp: Date.now(),
              operation: 'delete',
              entityType: 'campaign',
              entityId: key,
              data: null,
              synced: false,
            });
            break;
          case 'gameState':
            await db.delete('gameState', key);
            break;
          case 'combatState':
            await db.delete('combatState', key);
            break;
          default:
            await db.delete(type as any, key);
        }
      } else {
        // Full store removal
        await db.delete('gameState', name);
      }
    } catch (error) {
      console.error('Error removing from IndexedDB:', error);
    }
  },
};

// Export additional utility functions for sync management
export const syncUtils = {
  // Get all pending sync operations
  getPendingSyncOperations: async () => {
    const db = await dbPromise;
    return db.getAllFromIndex('syncLog', 'by_synced', false);
  },

  // Mark operation as synced
  markAsSynced: async (id: string) => {
    const db = await dbPromise;
    const operation = await db.get('syncLog', id);
    if (operation) {
      operation.synced = true;
      await db.put('syncLog', operation);
    }
  },

  // Batch sync multiple operations
  batchSync: async (operations: string[]) => {
    const db = await dbPromise;
    const tx = db.transaction('syncLog', 'readwrite');

    for (const id of operations) {
      const operation = await tx.store.get(id);
      if (operation) {
        operation.synced = true;
        await tx.store.put(operation);
      }
    }

    await tx.done;
  },

  // Get entity sync history
  getEntitySyncHistory: async (entityType: 'character' | 'campaign', entityId: string) => {
    const db = await dbPromise;
    return db.getAllFromIndex('syncLog', 'by_entity', [entityType, entityId]);
  },

  // Clear sync history older than a certain date
  clearOldSyncHistory: async (olderThan: Date) => {
    const db = await dbPromise;
    const tx = db.transaction('syncLog', 'readwrite');
    const timestamp = olderThan.getTime();

    // Use a cursor to efficiently scan and delete
    let cursor = await tx.store.openCursor();

    while (cursor) {
      if (cursor.value.timestamp < timestamp && cursor.value.synced) {
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }

    await tx.done;
  },

  // Export all data
  exportAllData: async () => {
    const db = await dbPromise;

    const characters = await db.getAll('characters');
    const campaigns = await db.getAll('campaigns');
    const gameState = await db.getAll('gameState');

    return {
      characters,
      campaigns,
      gameState,
      exportDate: new Date().toISOString(),
      version: DB_VERSION,
    };
  },

  // Import data
  importData: async (data: any) => {
    if (!data || !data.version) {
      throw new Error('Invalid import data format');
    }

    const db = await dbPromise;
    const tx = db.transaction(['characters', 'campaigns', 'gameState'], 'readwrite');

    // Import characters
    if (data.characters && Array.isArray(data.characters)) {
      for (const [key, character] of Object.entries(data.characters)) {
        await tx.objectStore('characters').put(character, key);
      }
    }

    // Import campaigns
    if (data.campaigns && Array.isArray(data.campaigns)) {
      for (const [key, campaign] of Object.entries(data.campaigns)) {
        await tx.objectStore('campaigns').put(campaign, key);
      }
    }

    // Import game state
    if (data.gameState && Array.isArray(data.gameState)) {
      for (const [key, state] of Object.entries(data.gameState)) {
        await tx.objectStore('gameState').put(state, key);
      }
    }

    await tx.done;
    return true;
  },

  // Check for conflicts when importing
  checkImportConflicts: async (data: any) => {
    if (!data || !data.characters) {
      return { hasConflicts: false, conflicts: [] };
    }

    const db = await dbPromise;
    const conflicts = [];

    // Check character conflicts
    if (data.characters) {
      for (const [key, importedChar] of Object.entries(data.characters)) {
        const existingChar = await db.get('characters', key);
        if (existingChar) {
          // Compare versions or timestamps
          const importVer = importedChar.version || 0;
          const existingVer = existingChar.version || 0;

          if (importVer !== existingVer) {
            conflicts.push({
              type: 'character',
              id: key,
              importedVersion: importVer,
              existingVersion: existingVer,
            });
          }
        }
      }
    }

    // Similar checks for campaigns if needed

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  },

  // Resolve a conflict by choosing one version
  resolveConflict: async (type: 'character' | 'campaign', id: string, keepImported: boolean, importedData: any) => {
    const db = await dbPromise;

    if (keepImported) {
      // Use the imported version
      await db.put(type === 'character' ? 'characters' : 'campaigns', importedData, id);
    }
    // Otherwise keep existing (do nothing)

    return true;
  },

  // Handle multiple browser tabs
  registerTabSyncListener: (onExternalChange: (key: string, newValue: any) => void) => {
    // Listen for storage events from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('sw5e-')) {
        try {
          const newValue = e.newValue ? JSON.parse(e.newValue) : null;
          onExternalChange(e.key, newValue);
        } catch (error) {
          console.error('Error handling external storage change:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Return a function to remove the listener
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  },
};

// Export for direct database access in advanced scenarios
export const getDB = () => dbPromise;


// Adapted export/import functions for the new database
export const exportCharacters = async (characterIds?: string[]): Promise<string> => {
  const db = await dbPromise;
  const characters = await db.getAll('characters');

  //Filter characters if specific IDs are provided
  const filteredCharacters = characterIds ? characters.filter(char => characterIds.includes(char.id)) : characters;

  return JSON.stringify({
    characters: filteredCharacters,
    version: 1,
    exportDate: new Date().toISOString(),
  });
};

export const importCharacters = async (jsonData: string, options: { replaceAll?: boolean; handleConflicts?: 'keep' | 'replace' | 'rename'; } = {}): Promise<string[]> => {
  const { replaceAll = false, handleConflicts = 'rename' } = options;

  try {
    const importedData = JSON.parse(jsonData);
    const db = await dbPromise;
    const tx = db.transaction('characters', 'readwrite');
    const importedIds: string[] = [];

    if (replaceAll) {
      await tx.store.clear();
    }

    for (const character of importedData.characters) {
      const existingChar = await tx.store.get(character.id);
      if (existingChar && handleConflicts !== 'replace') {
        if (handleConflicts === 'keep') {
          continue;
        } else {
          const newId = `${character.id}-${Date.now()}`;
          character.id = newId;
          character.name = `${character.name} (Imported)`;
          character.updatedAt = new Date().toISOString();
          importedIds.push(newId);
        }
      } else {
        importedIds.push(character.id);
      }
      await tx.store.put(character);
    }
    await tx.done;
    return importedIds;
  } catch (error) {
    console.error('Error importing characters:', error);
    throw error;
  }
};