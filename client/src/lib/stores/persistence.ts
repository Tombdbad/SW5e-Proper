
/**
 * Advanced persistence implementation for character data
 * Supports both localStorage and IndexedDB
 */

import { openDB, IDBPDatabase } from 'idb';

// Database configuration
const DB_NAME = 'sw5e-character-db';
const DB_VERSION = 1;
const CHARACTERS_STORE = 'characters';
const METADATA_STORE = 'metadata';

interface StorageAdapter {
  getItem: (key: string) => Promise<any>;
  setItem: (key: string, value: any) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  clear: () => Promise<void>;
}

// Factory function to create storage adapters
export const createStorage = (preferIndexedDB = true): StorageAdapter => {
  // Feature detection
  const hasIndexedDB = typeof indexedDB !== 'undefined';
  const hasLocalStorage = typeof localStorage !== 'undefined';
  
  // Determine which storage to use based on preferences and availability
  if (preferIndexedDB && hasIndexedDB) {
    return createIndexedDBStorage();
  } else if (hasLocalStorage) {
    return createLocalStorage();
  } else {
    return createMemoryStorage();
  }
};

// LocalStorage adapter
const createLocalStorage = (): StorageAdapter => {
  return {
    getItem: async (key: string) => {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        console.error('Error retrieving from localStorage:', error);
        return null;
      }
    },
    
    setItem: async (key: string, value: any) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.error('Error saving to localStorage:', error);
        throw error;
      }
    },
    
    removeItem: async (key: string) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error('Error removing from localStorage:', error);
        throw error;
      }
    },
    
    clear: async () => {
      try {
        localStorage.clear();
      } catch (error) {
        console.error('Error clearing localStorage:', error);
        throw error;
      }
    },
  };
};

// IndexedDB adapter
const createIndexedDBStorage = (): StorageAdapter => {
  let db: IDBPDatabase | null = null;
  
  const getDatabase = async (): Promise<IDBPDatabase> => {
    if (db) return db;
    
    db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        // Create character store with id as key path
        if (!database.objectStoreNames.contains(CHARACTERS_STORE)) {
          const characterStore = database.createObjectStore(CHARACTERS_STORE, {
            keyPath: 'id',
          });
          characterStore.createIndex('updatedAt', 'updatedAt');
        }
        
        // Create metadata store for app settings
        if (!database.objectStoreNames.contains(METADATA_STORE)) {
          database.createObjectStore(METADATA_STORE, {
            keyPath: 'key',
          });
        }
      },
    });
    
    return db;
  };
  
  return {
    getItem: async (key: string) => {
      try {
        const database = await getDatabase();
        
        if (key === 'sw5e-character-storage') {
          // Get all characters for the main store
          const characters = await database.getAll(CHARACTERS_STORE);
          const activeCharacterId = await database.get(METADATA_STORE, 'activeCharacterId');
          
          // Convert array of characters to an object map
          const charactersMap = characters.reduce((map, character) => {
            map[character.id] = character;
            return map;
          }, {} as Record<string, any>);
          
          return {
            characters: charactersMap,
            activeCharacterId: activeCharacterId ? activeCharacterId.value : null,
          };
        } else {
          // Handle other keys (e.g., metadata)
          const result = await database.get(METADATA_STORE, key);
          return result ? result.value : null;
        }
      } catch (error) {
        console.error('Error retrieving from IndexedDB:', error);
        return null;
      }
    },
    
    setItem: async (key: string, value: any) => {
      try {
        const database = await getDatabase();
        
        if (key === 'sw5e-character-storage') {
          // Store each character separately
          const { characters, activeCharacterId } = value;
          
          const tx = database.transaction([CHARACTERS_STORE, METADATA_STORE], 'readwrite');
          
          // Store active character ID
          await tx.objectStore(METADATA_STORE).put({
            key: 'activeCharacterId',
            value: activeCharacterId,
          });
          
          // Store each character
          const characterPromises = Object.values(characters).map((character: any) => 
            tx.objectStore(CHARACTERS_STORE).put(character)
          );
          
          await Promise.all([...characterPromises, tx.done]);
        } else {
          // Handle other keys
          await database.put(METADATA_STORE, { key, value });
        }
      } catch (error) {
        console.error('Error saving to IndexedDB:', error);
        throw error;
      }
    },
    
    removeItem: async (key: string) => {
      try {
        const database = await getDatabase();
        
        if (key === 'sw5e-character-storage') {
          // Clear all characters and metadata
          const tx = database.transaction([CHARACTERS_STORE, METADATA_STORE], 'readwrite');
          await tx.objectStore(CHARACTERS_STORE).clear();
          await tx.objectStore(METADATA_STORE).delete('activeCharacterId');
          await tx.done;
        } else {
          // Handle other keys
          await database.delete(METADATA_STORE, key);
        }
      } catch (error) {
        console.error('Error removing from IndexedDB:', error);
        throw error;
      }
    },
    
    clear: async () => {
      try {
        const database = await getDatabase();
        const tx = database.transaction([CHARACTERS_STORE, METADATA_STORE], 'readwrite');
        await tx.objectStore(CHARACTERS_STORE).clear();
        await tx.objectStore(METADATA_STORE).clear();
        await tx.done;
      } catch (error) {
        console.error('Error clearing IndexedDB:', error);
        throw error;
      }
    },
  };
};

// In-memory storage adapter (fallback)
const createMemoryStorage = (): StorageAdapter => {
  const storage = new Map<string, any>();
  
  return {
    getItem: async (key: string) => {
      return storage.get(key) || null;
    },
    
    setItem: async (key: string, value: any) => {
      storage.set(key, value);
    },
    
    removeItem: async (key: string) => {
      storage.delete(key);
    },
    
    clear: async () => {
      storage.clear();
    },
  };
};

// Multi-tab synchronization helper
export const createSyncedStorage = (baseStorage = createStorage()): StorageAdapter => {
  const broadcastChannel = typeof BroadcastChannel !== 'undefined' 
    ? new BroadcastChannel('sw5e-storage-sync')
    : null;
  
  // Listen for changes from other tabs
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      const { action, key, value } = event.data;
      
      // Dispatch a custom event for the store to handle
      window.dispatchEvent(
        new CustomEvent('sw5e-storage-update', {
          detail: { action, key, value },
        })
      );
    };
  }
  
  return {
    getItem: async (key: string) => {
      return baseStorage.getItem(key);
    },
    
    setItem: async (key: string, value: any) => {
      await baseStorage.setItem(key, value);
      
      // Notify other tabs
      if (broadcastChannel) {
        broadcastChannel.postMessage({
          action: 'setItem',
          key,
          value,
        });
      }
    },
    
    removeItem: async (key: string) => {
      await baseStorage.removeItem(key);
      
      // Notify other tabs
      if (broadcastChannel) {
        broadcastChannel.postMessage({
          action: 'removeItem',
          key,
        });
      }
    },
    
    clear: async () => {
      await baseStorage.clear();
      
      // Notify other tabs
      if (broadcastChannel) {
        broadcastChannel.postMessage({
          action: 'clear',
        });
      }
    },
  };
};

// Character versioning and conflict resolution
export const createVersionedStorage = (baseStorage = createStorage()): StorageAdapter => {
  return {
    getItem: async (key: string) => {
      return baseStorage.getItem(key);
    },
    
    setItem: async (key: string, value: any) => {
      // For the character store, handle versioning
      if (key === 'sw5e-character-storage') {
        // Get the current stored value
        const storedValue = await baseStorage.getItem(key);
        
        if (storedValue) {
          const { characters: storedCharacters } = storedValue;
          const { characters: newCharacters } = value;
          
          // Check for conflicts
          const mergedCharacters = { ...newCharacters };
          
          for (const id in newCharacters) {
            const newChar = newCharacters[id];
            const storedChar = storedCharacters[id];
            
            // If a conflict is detected (same ID but different versions)
            if (storedChar && storedChar.version !== newChar.version) {
              // Determine which is newer
              const storedDate = new Date(storedChar.updatedAt).getTime();
              const newDate = new Date(newChar.updatedAt).getTime();
              
              if (storedDate > newDate) {
                // The stored version is newer, keep it
                mergedCharacters[id] = storedChar;
                console.warn(`Conflict resolved: Used stored version of character ${id}`);
              } else {
                // The new version is newer, keep it (already in mergedCharacters)
                console.warn(`Conflict resolved: Used new version of character ${id}`);
              }
            }
          }
          
          // Save merged characters
          await baseStorage.setItem(key, {
            ...value,
            characters: mergedCharacters,
          });
          
          return;
        }
      }
      
      // For other keys or if no conflicts, just store the value
      await baseStorage.setItem(key, value);
    },
    
    removeItem: async (key: string) => {
      await baseStorage.removeItem(key);
    },
    
    clear: async () => {
      await baseStorage.clear();
    },
  };
};

// Export a combined storage solution
export const createCustomStorage = () => {
  const baseStorage = createStorage(true); // Prefer IndexedDB
  const syncedStorage = createSyncedStorage(baseStorage);
  return createVersionedStorage(syncedStorage);
};

// Helper for export/import with version migration
export const exportCharacters = async (characterIds?: string[]): Promise<string> => {
  const storage = createStorage();
  const data = await storage.getItem('sw5e-character-storage');
  
  if (!data || !data.characters) {
    throw new Error('No characters found to export');
  }
  
  // Filter characters if specific IDs are provided
  const characters = characterIds
    ? Object.fromEntries(
        Object.entries(data.characters).filter(([id]) => 
          characterIds.includes(id)
        )
      )
    : data.characters;
  
  return JSON.stringify({
    characters,
    version: 1,
    exportDate: new Date().toISOString(),
  });
};

export const importCharacters = async (
  jsonData: string,
  options: {
    replaceAll?: boolean;
    handleConflicts?: 'keep' | 'replace' | 'rename';
  } = {}
): Promise<string[]> => {
  const { replaceAll = false, handleConflicts = 'rename' } = options;
  
  try {
    const importedData = JSON.parse(jsonData);
    const storage = createStorage();
    const currentData = await storage.getItem('sw5e-character-storage') || { characters: {} };
    
    // Validate the imported data
    if (!importedData.characters || typeof importedData.characters !== 'object') {
      throw new Error('Invalid character data in import');
    }
    
    // Handle the import
    if (replaceAll) {
      // Replace all characters
      await storage.setItem('sw5e-character-storage', {
        ...currentData,
        characters: importedData.characters,
      });
      
      return Object.keys(importedData.characters);
    } else {
      // Merge with existing characters
      const mergedCharacters = { ...currentData.characters };
      const importedIds: string[] = [];
      
      for (const [id, character] of Object.entries<any>(importedData.characters)) {
        if (mergedCharacters[id] && handleConflicts !== 'replace') {
          if (handleConflicts === 'keep') {
            // Skip this character
            continue;
          } else if (handleConflicts === 'rename') {
            // Create a new ID and rename the character
            const newId = `${id}-${Date.now()}`;
            mergedCharacters[newId] = {
              ...character,
              id: newId,
              name: `${character.name} (Imported)`,
              updatedAt: new Date().toISOString(),
            };
            importedIds.push(newId);
          }
        } else {
          // Add or replace the character
          mergedCharacters[id] = character;
          importedIds.push(id);
        }
      }
      
      // Save the merged data
      await storage.setItem('sw5e-character-storage', {
        ...currentData,
        characters: mergedCharacters,
      });
      
      return importedIds;
    }
  } catch (error) {
    console.error('Error importing characters:', error);
    throw error;
  }
};
