import React from 'react';
import { IconExternalLink } from '@tabler/icons-react';
import { EquipmentPiece } from '@/types/Player';
import { getItemPrice } from '@/lib/Optimizer';
import { formatBudget } from '@/app/components/optimizer/BudgetInput';

interface ItemTooltipProps {
  item: EquipmentPiece;
}

/**
 * Format attack speed from game ticks to a human-readable format.
 * Attack speed in OSRS is measured in game ticks (0.6 seconds each).
 */
function formatAttackSpeed(speedTicks: number): string {
  if (!speedTicks || speedTicks <= 0) return '';
  const seconds = speedTicks * 0.6;
  return `${seconds.toFixed(1)}s (${speedTicks}t)`;
}

/**
 * Get the wiki URL for an item.
 */
export function getWikiUrl(itemId: number): string {
  return `https://oldschool.runescape.wiki/w/Special:Lookup?type=item&id=${itemId}`;
}

/**
 * StatRow component for displaying a single stat with label and value.
 */
const StatRow: React.FC<{ label: string; value: number | string; color?: string }> = ({
  label,
  value,
  color = 'text-gray-300',
}) => {
  // Don't show zero values for cleaner display
  if (value === 0 || value === '0') return null;

  let displayValue: string;
  if (typeof value === 'number') {
    displayValue = value > 0 ? `+${value}` : `${value}`;
  } else {
    displayValue = value;
  }

  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-gray-400">{label}</span>
      <span className={color}>{displayValue}</span>
    </div>
  );
};

/**
 * StatSection component for grouping related stats.
 */
const StatSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  // Filter out null children (zero stats)
  const validChildren = React.Children.toArray(children).filter(Boolean);
  if (validChildren.length === 0) return null;

  return (
    <div className="mb-2">
      <div className="text-xs font-semibold text-gray-400 mb-1">{title}</div>
      {children}
    </div>
  );
};

/**
 * Rich tooltip content for equipment items.
 * Shows item name, stats, price, and a link to the Wiki.
 */
const ItemTooltip: React.FC<ItemTooltipProps> = ({ item }) => {
  const price = getItemPrice(item.id);
  const { offensive, defensive, bonuses } = item;

  // Check if there are any offensive stats to show
  const hasOffensive = offensive.stab !== 0
    || offensive.slash !== 0
    || offensive.crush !== 0
    || offensive.ranged !== 0
    || offensive.magic !== 0;

  // Check if there are any defensive stats to show
  const hasDefensive = defensive.stab !== 0
    || defensive.slash !== 0
    || defensive.crush !== 0
    || defensive.ranged !== 0
    || defensive.magic !== 0;

  // Check if there are any bonus stats to show
  const hasBonuses = bonuses.str !== 0
    || bonuses.ranged_str !== 0
    || bonuses.magic_str !== 0
    || bonuses.prayer !== 0;

  // Is this a weapon?
  const isWeapon = item.slot === 'weapon' && item.speed > 0;

  return (
    <div className="min-w-[180px] max-w-[220px]">
      {/* Item Name */}
      <div className="font-semibold text-white text-sm mb-2 border-b border-dark-300 pb-1">
        {item.name}
      </div>

      {/* Attack Speed (for weapons) */}
      {isWeapon && (
        <div className="mb-2">
          <StatRow label="Attack speed" value={formatAttackSpeed(item.speed)} color="text-blue-300" />
          {item.category && (
            <StatRow label="Weapon type" value={item.category} color="text-gray-300" />
          )}
        </div>
      )}

      {/* Offensive Stats */}
      {hasOffensive && (
        <StatSection title="Attack bonus">
          <StatRow label="Stab" value={offensive.stab} color="text-orange-300" />
          <StatRow label="Slash" value={offensive.slash} color="text-orange-300" />
          <StatRow label="Crush" value={offensive.crush} color="text-orange-300" />
          <StatRow label="Ranged" value={offensive.ranged} color="text-green-300" />
          <StatRow label="Magic" value={offensive.magic} color="text-blue-300" />
        </StatSection>
      )}

      {/* Defensive Stats */}
      {hasDefensive && (
        <StatSection title="Defence bonus">
          <StatRow label="Stab" value={defensive.stab} />
          <StatRow label="Slash" value={defensive.slash} />
          <StatRow label="Crush" value={defensive.crush} />
          <StatRow label="Ranged" value={defensive.ranged} />
          <StatRow label="Magic" value={defensive.magic} />
        </StatSection>
      )}

      {/* Other Bonuses */}
      {hasBonuses && (
        <StatSection title="Other bonuses">
          <StatRow label="Strength" value={bonuses.str} color="text-red-300" />
          <StatRow label="Ranged strength" value={bonuses.ranged_str} color="text-green-300" />
          <StatRow label="Magic damage %" value={bonuses.magic_str} color="text-blue-300" />
          <StatRow label="Prayer" value={bonuses.prayer} color="text-yellow-300" />
        </StatSection>
      )}

      {/* Price */}
      <div className="border-t border-dark-300 pt-2 mt-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-400">GE Price</span>
          <span className="text-yellow-400 font-semibold">
            {price !== null ? formatBudget(price) : 'Unknown'}
          </span>
        </div>
      </div>

      {/* Wiki Link */}
      <a
        href={getWikiUrl(item.id)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <IconExternalLink size={12} />
        View on Wiki
      </a>
    </div>
  );
};

export default ItemTooltip;
