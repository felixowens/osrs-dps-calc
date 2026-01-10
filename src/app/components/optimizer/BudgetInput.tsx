import React, { useEffect, useState } from 'react';
import Toggle from '@/app/components/generic/Toggle';

interface BudgetInputProps {
  budget: number | null; // null = unlimited
  setBudget: (budget: number | null) => void;
}

/**
 * Format a number with k/m/b suffixes for display
 * e.g., 1000 -> "1k", 1000000 -> "1m", 1000000000 -> "1b"
 */
export function formatBudget(value: number): string {
  if (value >= 1_000_000_000) {
    const b = value / 1_000_000_000;
    return b % 1 === 0 ? `${b}b` : `${b.toFixed(1)}b`;
  }
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return m % 1 === 0 ? `${m}m` : `${m.toFixed(1)}m`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return value.toString();
}

/**
 * Parse a string with k/m/b suffixes to a number
 * e.g., "10m" -> 10000000, "500k" -> 500000, "1b" -> 1000000000
 * Returns null if invalid
 */
export function parseBudget(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Match optional decimal number followed by optional suffix
  const match = trimmed.match(/^(\d+\.?\d*)(k|m|b)?$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return null;

  const suffix = match[2];
  let multiplier = 1;
  if (suffix === 'k') multiplier = 1_000;
  else if (suffix === 'm') multiplier = 1_000_000;
  else if (suffix === 'b') multiplier = 1_000_000_000;

  return Math.floor(num * multiplier);
}

const BudgetInput: React.FC<BudgetInputProps> = ({ budget, setBudget }) => {
  const isUnlimited = budget === null;
  const [inputValue, setInputValue] = useState<string>(
    budget !== null ? formatBudget(budget) : '',
  );

  // Update input value when budget prop changes (e.g., from external source)
  useEffect(() => {
    if (budget !== null) {
      setInputValue(formatBudget(budget));
    }
  }, [budget]);

  const handleToggleUnlimited = (checked: boolean) => {
    if (checked) {
      // Set to unlimited
      setBudget(null);
      setInputValue('');
    } else {
      // Set to default budget (100m)
      const defaultBudget = 100_000_000;
      setBudget(defaultBudget);
      setInputValue(formatBudget(defaultBudget));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Try to parse the value
    const parsed = parseBudget(value);
    if (parsed !== null && parsed >= 0) {
      setBudget(parsed);
    }
  };

  const handleInputBlur = () => {
    // On blur, format the value properly
    if (budget !== null) {
      setInputValue(formatBudget(budget));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">Budget</span>
        <Toggle
          checked={isUnlimited}
          setChecked={handleToggleUnlimited}
          label="Unlimited"
        />
      </div>

      {!isUnlimited && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="form-control w-full"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            placeholder="e.g., 100m, 500k, 1b"
            aria-label="Budget amount"
          />
          {budget !== null && (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {budget.toLocaleString()}
              {' '}
              gp
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500">
        {isUnlimited
          ? 'No budget limit - will find the absolute best gear.'
          : 'Enter budget using k (thousands), m (millions), or b (billions).'}
      </p>
    </div>
  );
};

export default BudgetInput;
