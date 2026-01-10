import React, { useEffect, useMemo, useState } from 'react';
import { IconBan, IconX } from '@tabler/icons-react';
import localforage from 'localforage';
import Combobox from '@/app/components/generic/Combobox';
import LazyImage from '@/app/components/generic/LazyImage';
import { availableEquipment } from '@/lib/Equipment';
import { EquipmentPiece } from '@/types/Player';
import { getCdnImage } from '@/utils';

/**
 * LocalStorage key for blacklisted items.
 */
const BLACKLIST_STORAGE_KEY = 'optimizer-blacklisted-items';

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
 * Props for BlacklistManager component.
 */
interface BlacklistManagerProps {
  /** Current set of blacklisted item IDs */
  blacklistedItems: Set<number>;
  /** Callback when blacklisted items change */
  setBlacklistedItems: (items: Set<number>) => void;
}

/**
 * Load blacklisted items from localStorage.
 *
 * @returns Promise resolving to a Set of blacklisted item IDs
 */
export async function loadBlacklistedItems(): Promise<Set<number>> {
  try {
    const stored = await localforage.getItem<number[]>(BLACKLIST_STORAGE_KEY);
    if (stored && Array.isArray(stored)) {
      return new Set(stored);
    }
  } catch (e) {
    console.warn('Failed to load blacklisted items from storage:', e);
  }
  return new Set();
}

/**
 * Save blacklisted items to localStorage.
 *
 * @param items - Set of blacklisted item IDs to save
 */
export async function saveBlacklistedItems(items: Set<number>): Promise<void> {
  try {
    await localforage.setItem(BLACKLIST_STORAGE_KEY, Array.from(items));
  } catch (e) {
    console.warn('Failed to save blacklisted items to storage:', e);
  }
}

/**
 * Clear blacklisted items from localStorage.
 */
export async function clearBlacklistedItems(): Promise<void> {
  try {
    await localforage.removeItem(BLACKLIST_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear blacklisted items from storage:', e);
  }
}

/**
 * Component for managing blacklisted items.
 *
 * Provides:
 * - A searchable combobox to find and add items to blacklist
 * - A list of currently blacklisted items with remove buttons
 * - Persistence to localStorage
 */
const BlacklistManager: React.FC<BlacklistManagerProps> = ({ blacklistedItems, setBlacklistedItems }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  // Build options for the combobox from available equipment
  // Filter out items that are already blacklisted
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
        // Filter out items that are already blacklisted
        if (blacklistedItems.has(eq.id)) {
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
    [blacklistedItems],
  );

  // Get the list of blacklisted items with full equipment data
  const blacklistedItemsList: EquipmentPiece[] = useMemo(() => {
    const items: EquipmentPiece[] = [];
    blacklistedItems.forEach((id) => {
      const eq = availableEquipment.find((e) => e.id === id);
      if (eq) {
        items.push(eq);
      }
    });
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [blacklistedItems]);

  // Load blacklisted items from localStorage on mount
  useEffect(() => {
    if (isLoaded) return;

    loadBlacklistedItems().then((loaded) => {
      setBlacklistedItems(loaded);
      setIsLoaded(true);
    });
  }, [isLoaded, setBlacklistedItems]);

  // Save blacklisted items to localStorage whenever they change
  useEffect(() => {
    if (!isLoaded) return;

    saveBlacklistedItems(blacklistedItems);
  }, [blacklistedItems, isLoaded]);

  // Add an item to blacklist
  const handleAddItem = (option: EquipmentOption | null | undefined) => {
    if (!option) return;

    const newBlacklist = new Set(blacklistedItems);
    newBlacklist.add(option.equipment.id);
    setBlacklistedItems(newBlacklist);
  };

  // Remove an item from blacklist
  const handleRemoveItem = (itemId: number) => {
    const newBlacklist = new Set(blacklistedItems);
    newBlacklist.delete(itemId);
    setBlacklistedItems(newBlacklist);
  };

  // Clear all blacklisted items
  const handleClearAll = () => {
    setBlacklistedItems(new Set());
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-300">Blacklisted Items</span>
        {blacklistedItems.size > 0 && (
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
        Blacklisted items will be excluded from optimization results.
      </p>

      {/* Search and add items */}
      <div className="relative mb-3">
        <Combobox<EquipmentOption>
          id="blacklist-search"
          className="w-full text-sm"
          items={equipmentOptions}
          placeholder="Search to blacklist items..."
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
                <IconBan size={14} className="text-red-400 ml-1" />
              </div>
            </div>
          )}
        />
      </div>

      {/* List of blacklisted items */}
      {blacklistedItems.size > 0 ? (
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {blacklistedItemsList.map((item) => (
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
                className="p-1 text-gray-400 hover:text-green-400 transition-colors"
                onClick={() => handleRemoveItem(item.id)}
                aria-label={`Remove ${item.name} from blacklist`}
              >
                <IconX size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-500 text-sm py-4">
          No blacklisted items. Search above to add items to exclude.
        </div>
      )}

      {/* Count display */}
      {blacklistedItems.size > 0 && (
        <div className="mt-2 text-xs text-gray-500 text-right">
          {blacklistedItems.size}
          {' '}
          item
          {blacklistedItems.size !== 1 ? 's' : ''}
          {' '}
          blacklisted
        </div>
      )}
    </div>
  );
};

export default BlacklistManager;
