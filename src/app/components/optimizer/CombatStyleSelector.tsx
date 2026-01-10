import React from 'react';
import { CombatStyle } from '@/types/Optimizer';
import { CombatStyleType } from '@/types/PlayerCombatStyle';

interface CombatStyleSelectorProps {
  combatStyle: CombatStyle;
  setCombatStyle: (style: CombatStyle) => void;
}

/**
 * Derive the optimizer CombatStyle from a player's combat style type.
 * Maps stab/slash/crush to 'melee', keeps 'ranged' and 'magic' as-is.
 */
export function getCombatStyleFromType(type: CombatStyleType): CombatStyle {
  if (type === 'stab' || type === 'slash' || type === 'crush') {
    return 'melee';
  }
  if (type === 'ranged') {
    return 'ranged';
  }
  if (type === 'magic') {
    return 'magic';
  }
  // Default to melee if type is null or unknown
  return 'melee';
}

const COMBAT_STYLES: { value: CombatStyle; label: string; color: string }[] = [
  { value: 'melee', label: 'Melee', color: 'text-red-400' },
  { value: 'ranged', label: 'Ranged', color: 'text-green-400' },
  { value: 'magic', label: 'Magic', color: 'text-blue-400' },
];

const CombatStyleSelector: React.FC<CombatStyleSelectorProps> = ({
  combatStyle,
  setCombatStyle,
}) => (
  <div className="space-y-2">
    <span className="text-sm text-gray-300">Combat Style</span>

    <div className="flex rounded overflow-hidden border border-dark-300">
      {COMBAT_STYLES.map(({ value, label, color }) => {
        const isSelected = combatStyle === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setCombatStyle(value)}
            className={`
                flex-1 px-4 py-2 text-sm font-medium transition-colors
                ${isSelected
              ? `bg-dark-300 ${color}`
              : 'bg-dark-500 text-gray-400 hover:bg-dark-400 hover:text-gray-300'
            }
              `}
            aria-pressed={isSelected}
          >
            {label}
          </button>
        );
      })}
    </div>

    <p className="text-xs text-gray-500">
      Filter equipment to items useful for this combat style.
    </p>
  </div>
);

export default CombatStyleSelector;
