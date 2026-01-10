import React, { useEffect, useMemo, useState } from 'react';
import { IconPlus, IconX } from '@tabler/icons-react';
import localforage from 'localforage';
import Combobox from '@/app/components/generic/Combobox';
import LazyImage from '@/app/components/generic/LazyImage';
import { availableEquipment } from '@/lib/Equipment';
import { EquipmentPiece } from '@/types/Player';
import { getCdnImage } from '@/utils';

/**
 * LocalStorage key for owned items.
 */
const OWNED_ITEMS_STORAGE_KEY = 'optimizer-owned-items';

/**
 * Equipment option for the search combobox.
 */
interface EquipmentOption {
  label: string;
  value: string;
  version: string;
  equipment: EquipmentPiece;
}

/**
 * Props for OwnedItemsManager component.
 */
interface OwnedItemsManagerProps {
  /** Current set of owned item IDs */
  ownedItems: Set<number>;
  /** Callback when owned items change */
  setOwnedItems: (items: Set<number>) => void;
}

/**
 * Load owned items from localStorage.
 *
 * @returns Promise resolving to a Set of owned item IDs
 */
export async function loadOwnedItems(): Promise<Set<number>> {
  try {
    const stored = await localforage.getItem<number[]>(OWNED_ITEMS_STORAGE_KEY);
    if (stored && Array.isArray(stored)) {
      return new Set(stored);
    }
  } catch (e) {
    console.warn('Failed to load owned items from storage:', e);
  }
  return new Set();
}

/**
 * Save owned items to localStorage.
 *
 * @param items - Set of owned item IDs to save
 */
export async function saveOwnedItems(items: Set<number>): Promise<void> {
  try {
    await localforage.setItem(OWNED_ITEMS_STORAGE_KEY, Array.from(items));
  } catch (e) {
    console.warn('Failed to save owned items to storage:', e);
  }
}

/**
 * Clear owned items from localStorage.
 */
export async function clearOwnedItems(): Promise<void> {
  try {
    await localforage.removeItem(OWNED_ITEMS_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear owned items from storage:', e);
  }
}

/**
 * Component for managing owned items.
 *
 * Provides:
 * - A searchable combobox to find and add items
 * - A list of currently owned items with remove buttons
 * - Persistence to localStorage
 */
const OwnedItemsManager: React.FC<OwnedItemsManagerProps> = ({ ownedItems, setOwnedItems }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  // Build options for the combobox from available equipment
  // Filter out items that are already owned
  const equipmentOptions: EquipmentOption[] = useMemo(
    () => availableEquipment
      .filter((eq) => {
        // Filter out items with no stats (unless specifically useful)
        if (
          Object.values(eq.bonuses).every((val) => val === 0)
          && Object.values(eq.offensive).every((val) => val === 0)
          && Object.values(eq.defensive).every((val) => val === 0)
          && (eq.speed === 4 || eq.speed <= 0)
        ) {
          return false;
        }
        // Filter out items that are already owned
        if (ownedItems.has(eq.id)) {
          return false;
        }
        // Filter out broken/inactive versions
        if (eq.version?.match(/^(Broken|Inactive|Locked)$/)) {
          return false;
        }
        return true;
      })
      .map((eq) => ({
        label: eq.name,
        value: eq.id.toString(),
        version: eq.version || '',
        equipment: eq,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [ownedItems],
  );

  // Get the list of owned items with full equipment data
  const ownedItemsList: EquipmentPiece[] = useMemo(() => {
    const items: EquipmentPiece[] = [];
    ownedItems.forEach((id) => {
      const eq = availableEquipment.find((e) => e.id === id);
      if (eq) {
        items.push(eq);
      }
    });
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [ownedItems]);

  // Load owned items from localStorage on mount
  useEffect(() => {
    if (isLoaded) return;

    loadOwnedItems().then((loaded) => {
      setOwnedItems(loaded);
      setIsLoaded(true);
    });
  }, [isLoaded, setOwnedItems]);

  // Save owned items to localStorage whenever they change
  useEffect(() => {
    if (!isLoaded) return;

    saveOwnedItems(ownedItems);
  }, [ownedItems, isLoaded]);

  // Add an item to owned list
  const handleAddItem = (option: EquipmentOption | null | undefined) => {
    if (!option) return;

    const newOwned = new Set(ownedItems);
    newOwned.add(option.equipment.id);
    setOwnedItems(newOwned);
  };

  // Remove an item from owned list
  const handleRemoveItem = (itemId: number) => {
    const newOwned = new Set(ownedItems);
    newOwned.delete(itemId);
    setOwnedItems(newOwned);
  };

  // Clear all owned items
  const handleClearAll = () => {
    setOwnedItems(new Set());
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-300">Owned Items</span>
        {ownedItems.size > 0 && (
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-red-400 transition-colors"
            onClick={handleClearAll}
          >
            Clear all
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-2">
        Mark items you own so they&apos;re treated as free when budgeting.
      </p>

      {/* Search and add items */}
      <div className="relative mb-3">
        <Combobox<EquipmentOption>
          id="owned-items-search"
          className="w-full text-sm"
          items={equipmentOptions}
          placeholder="Search to add items..."
          resetAfterSelect
          blurAfterSelect
          onSelectedItemChange={handleAddItem}
          CustomItemComponent={({ item }) => (
            <div className="flex items-center gap-2">
              <div className="basis-4 flex justify-center h-[20px] w-auto shrink-0">
                {item.equipment.image && (
                  <LazyImage
                    responsive
                    src={getCdnImage(`equipment/${item.equipment.image}`)}
                    alt=""
                  />
                )}
              </div>
              <div className="flex items-center gap-1">
                <span>{item.label}</span>
                {item.version && (
                  <span className="text-xs text-gray-400">
                    #
                    {item.version}
                  </span>
                )}
                <IconPlus size={14} className="text-green-400 ml-1" />
              </div>
            </div>
          )}
        />
      </div>

      {/* List of owned items */}
      {ownedItems.size > 0 ? (
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {ownedItemsList.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between bg-dark-500 rounded px-2 py-1.5 text-sm"
            >
              <div className="flex items-center gap-2">
                <div className="basis-4 flex justify-center h-[18px] w-auto shrink-0">
                  {item.image && (
                    <LazyImage
                      responsive
                      src={getCdnImage(`equipment/${item.image}`)}
                      alt=""
                    />
                  )}
                </div>
                <span className="text-gray-200">{item.name}</span>
                {item.version && (
                  <span className="text-xs text-gray-500">
                    #
                    {item.version}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                onClick={() => handleRemoveItem(item.id)}
                aria-label={`Remove ${item.name} from owned items`}
              >
                <IconX size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-500 text-sm py-4">
          No owned items. Search above to add items you own.
        </div>
      )}

      {/* Count display */}
      {ownedItems.size > 0 && (
        <div className="mt-2 text-xs text-gray-500 text-right">
          {ownedItems.size}
          {' '}
          item
          {ownedItems.size !== 1 ? 's' : ''}
          {' '}
          marked as owned
        </div>
      )}
    </div>
  );
};

export default OwnedItemsManager;
