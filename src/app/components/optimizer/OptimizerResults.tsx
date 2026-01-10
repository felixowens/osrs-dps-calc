import React, { useState } from 'react';
import { Tooltip } from 'react-tooltip';
import { IconCheck, IconX } from '@tabler/icons-react';
import { OptimizerResult, EquipmentSlot } from '@/types/Optimizer';
import { EquipmentPiece, PlayerEquipment } from '@/types/Player';
import { getCdnImage } from '@/utils';
import { formatBudget } from '@/app/components/optimizer/BudgetInput';
import ItemTooltip, { getWikiUrl } from '@/app/components/optimizer/ItemTooltip';
import head from '@/public/img/slots/head.png';
import cape from '@/public/img/slots/cape.png';
import neck from '@/public/img/slots/neck.png';
import ammo from '@/public/img/slots/ammo.png';
import weapon from '@/public/img/slots/weapon.png';
import body from '@/public/img/slots/body.png';
import shield from '@/public/img/slots/shield.png';
import legs from '@/public/img/slots/legs.png';
import hands from '@/public/img/slots/hands.png';
import feet from '@/public/img/slots/feet.png';
import ring from '@/public/img/slots/ring.png';

/**
 * Comparison data for showing differences from current loadout.
 */
export interface ComparisonData {
  /** Current loadout's DPS */
  currentDps: number;
  /** Current loadout's accuracy (0-1) */
  currentAccuracy: number;
  /** Current loadout's max hit */
  currentMaxHit: number;
  /** Current loadout's total cost */
  currentCost: number;
  /** Current loadout's equipment */
  currentEquipment: PlayerEquipment;
}

interface OptimizerResultsProps {
  result: OptimizerResult;
  onApply?: () => void;
  loadoutName?: string;
  /** Optional comparison data to show differences from current loadout */
  comparison?: ComparisonData;
}

/**
 * Map slot names to placeholder images
 */
const SLOT_PLACEHOLDERS: Record<EquipmentSlot, string> = {
  head: head.src,
  cape: cape.src,
  neck: neck.src,
  ammo: ammo.src,
  weapon: weapon.src,
  body: body.src,
  shield: shield.src,
  legs: legs.src,
  hands: hands.src,
  feet: feet.src,
  ring: ring.src,
};

/**
 * Display a single equipment slot in the results grid
 */
const ResultSlot: React.FC<{
  slot: EquipmentSlot;
  equipment: PlayerEquipment;
  cost?: number;
  isChanged?: boolean;
}> = ({
  slot, equipment, cost, isChanged,
}) => {
  const item = equipment[slot];
  const placeholder = SLOT_PLACEHOLDERS[slot];

  // Determine border color based on whether item changed
  const borderClass = isChanged
    ? 'border-2 border-green-500'
    : 'border border-dark-300';

  // If there's an item, make it clickable and use the item tooltip
  if (item) {
    return (
      <div className="flex flex-col items-center">
        <a
          href={getWikiUrl(item.id)}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex justify-center items-center h-[40px] w-[40px] bg-dark-400 ${borderClass} rounded cursor-pointer hover:border-blue-400 transition-colors`}
          data-tooltip-id="item-tooltip"
          data-item-id={item.id}
        >
          <img src={getCdnImage(`equipment/${item.image}`)} alt={item.name} />
        </a>
        {cost !== undefined && cost > 0 && (
          <span className="text-[10px] text-yellow-400 mt-0.5">{formatBudget(cost)}</span>
        )}
      </div>
    );
  }

  // Empty slot - show placeholder
  return (
    <div className="flex flex-col items-center">
      <div
        className={`flex justify-center items-center h-[40px] w-[40px] bg-dark-400 ${borderClass} rounded`}
        data-tooltip-id="tooltip"
        data-tooltip-content={`Empty ${slot}`}
      >
        <img className="opacity-30 dark:filter dark:invert" src={placeholder} alt={slot} />
      </div>
    </div>
  );
};

/**
 * Get an item from the equipment by its ID.
 * Used by the tooltip render function to find the item data.
 */
function getItemFromEquipment(equipment: PlayerEquipment, itemId: number): EquipmentPiece | null {
  for (const slot of Object.keys(equipment) as EquipmentSlot[]) {
    const item = equipment[slot];
    if (item && item.id === itemId) {
      return item;
    }
  }
  return null;
}

/**
 * Check if an item in a slot has changed between two equipment sets.
 */
function hasSlotChanged(
  slot: EquipmentSlot,
  optimized: PlayerEquipment,
  current?: PlayerEquipment,
): boolean {
  if (!current) return false;

  const optimizedItem = optimized[slot];
  const currentItem = current[slot];

  // Both empty - no change
  if (!optimizedItem && !currentItem) return false;

  // One is empty, other is not - changed
  if (!optimizedItem || !currentItem) return true;

  // Both have items - compare IDs
  return optimizedItem.id !== currentItem.id;
}

/**
 * Display the optimized equipment in a grid similar to the main equipment grid
 */
const ResultsEquipmentGrid: React.FC<{
  equipment: PlayerEquipment;
  perSlotCost: Partial<Record<EquipmentSlot, number>>;
  currentEquipment?: PlayerEquipment;
}> = ({ equipment, perSlotCost, currentEquipment }) => (
  <div className="flex flex-col items-center">
    <div className="flex justify-center">
      <ResultSlot slot="head" equipment={equipment} cost={perSlotCost.head} isChanged={hasSlotChanged('head', equipment, currentEquipment)} />
    </div>
    <div className="mt-1 flex justify-center gap-2">
      <ResultSlot slot="cape" equipment={equipment} cost={perSlotCost.cape} isChanged={hasSlotChanged('cape', equipment, currentEquipment)} />
      <ResultSlot slot="neck" equipment={equipment} cost={perSlotCost.neck} isChanged={hasSlotChanged('neck', equipment, currentEquipment)} />
      <ResultSlot slot="ammo" equipment={equipment} cost={perSlotCost.ammo} isChanged={hasSlotChanged('ammo', equipment, currentEquipment)} />
    </div>
    <div className="mt-1 flex justify-center gap-6">
      <ResultSlot slot="weapon" equipment={equipment} cost={perSlotCost.weapon} isChanged={hasSlotChanged('weapon', equipment, currentEquipment)} />
      <ResultSlot slot="body" equipment={equipment} cost={perSlotCost.body} isChanged={hasSlotChanged('body', equipment, currentEquipment)} />
      <ResultSlot slot="shield" equipment={equipment} cost={perSlotCost.shield} isChanged={hasSlotChanged('shield', equipment, currentEquipment)} />
    </div>
    <div className="mt-1 flex justify-center">
      <ResultSlot slot="legs" equipment={equipment} cost={perSlotCost.legs} isChanged={hasSlotChanged('legs', equipment, currentEquipment)} />
    </div>
    <div className="mt-1 flex justify-center gap-6">
      <ResultSlot slot="hands" equipment={equipment} cost={perSlotCost.hands} isChanged={hasSlotChanged('hands', equipment, currentEquipment)} />
      <ResultSlot slot="feet" equipment={equipment} cost={perSlotCost.feet} isChanged={hasSlotChanged('feet', equipment, currentEquipment)} />
      <ResultSlot slot="ring" equipment={equipment} cost={perSlotCost.ring} isChanged={hasSlotChanged('ring', equipment, currentEquipment)} />
    </div>
  </div>
);

/**
 * Format DPS to a reasonable number of decimal places
 */
function formatDps(dps: number): string {
  if (dps >= 10) {
    return dps.toFixed(2);
  }
  return dps.toFixed(3);
}

/**
 * Format accuracy as percentage
 */
function formatAccuracy(accuracy: number): string {
  return `${(accuracy * 100).toFixed(1)}%`;
}

/**
 * Format a numeric difference with sign and color.
 */
interface DifferenceDisplayProps {
  value: number;
  format?: (v: number) => string;
  suffix?: string;
  showPercent?: boolean;
  baseValue?: number;
}

const DifferenceDisplay: React.FC<DifferenceDisplayProps> = ({
  value, format, suffix = '', showPercent, baseValue,
}) => {
  if (value === 0) return null;

  const isPositive = value > 0;
  const sign = isPositive ? '+' : '';
  const colorClass = isPositive ? 'text-green-400' : 'text-red-400';
  const formatted = format ? format(Math.abs(value)) : Math.abs(value).toString();

  // Calculate percentage change if requested
  let percentStr = '';
  if (showPercent && baseValue && baseValue !== 0) {
    const percentChange = (value / baseValue) * 100;
    percentStr = ` (${isPositive ? '+' : ''}${percentChange.toFixed(1)}%)`;
  }

  return (
    <span className={`text-xs ${colorClass} ml-1`}>
      {sign}
      {formatted}
      {suffix}
      {percentStr}
    </span>
  );
};

const OptimizerResults: React.FC<OptimizerResultsProps> = ({
  result, onApply, loadoutName, comparison,
}) => {
  const {
    equipment, metrics, cost, meta,
  } = result;

  // Calculate differences if comparison data is available
  const dpsDiff = comparison ? metrics.dps - comparison.currentDps : 0;
  const accuracyDiff = comparison ? metrics.accuracy - comparison.currentAccuracy : 0;
  const maxHitDiff = comparison ? metrics.maxHit - comparison.currentMaxHit : 0;
  const costDiff = comparison ? cost.total - comparison.currentCost : 0;

  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleApplyClick = () => {
    setShowConfirmation(true);
  };

  const handleConfirm = () => {
    setShowConfirmation(false);
    if (onApply) {
      onApply();
    }
  };

  const handleCancel = () => {
    setShowConfirmation(false);
  };

  return (
    <div className="space-y-4">
      {/* Metrics Summary */}
      <div className="bg-dark-500 rounded p-3">
        <h4 className="text-sm font-semibold text-gray-200 mb-2">Performance</h4>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="flex items-center justify-center">
              <span className="text-lg font-bold text-green-400">{formatDps(metrics.dps)}</span>
              {comparison && (
                <DifferenceDisplay
                  value={dpsDiff}
                  format={formatDps}
                  showPercent
                  baseValue={comparison.currentDps}
                />
              )}
            </div>
            <div className="text-xs text-gray-400">DPS</div>
          </div>
          <div>
            <div className="flex items-center justify-center">
              <span className="text-lg font-bold text-blue-400">{formatAccuracy(metrics.accuracy)}</span>
              {comparison && (
                <DifferenceDisplay
                  value={accuracyDiff}
                  format={(v) => `${(v * 100).toFixed(1)}%`}
                />
              )}
            </div>
            <div className="text-xs text-gray-400">Accuracy</div>
          </div>
          <div>
            <div className="flex items-center justify-center">
              <span className="text-lg font-bold text-orange-400">{metrics.maxHit}</span>
              {comparison && (
                <DifferenceDisplay value={maxHitDiff} />
              )}
            </div>
            <div className="text-xs text-gray-400">Max Hit</div>
          </div>
        </div>
      </div>

      {/* Equipment Grid */}
      <div className="bg-dark-500 rounded p-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-200">Optimized Gear</h4>
          {comparison && (
            <span className="text-xs text-gray-400">
              <span className="inline-block w-2 h-2 bg-green-500 rounded mr-1" />
              Changed slots
            </span>
          )}
        </div>
        <ResultsEquipmentGrid
          equipment={equipment}
          perSlotCost={cost.perSlot}
          currentEquipment={comparison?.currentEquipment}
        />
      </div>

      {/* Cost Summary */}
      <div className="bg-dark-500 rounded p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Cost to Buy</span>
          <div className="flex items-center">
            <span className="text-lg font-bold text-yellow-400">
              {cost.total > 0 ? formatBudget(cost.total) : 'Free'}
            </span>
            {comparison && costDiff !== 0 && (
              <DifferenceDisplay
                value={costDiff}
                format={formatBudget}
              />
            )}
          </div>
        </div>

        {/* Cost comparison to current loadout */}
        {comparison && comparison.currentCost > 0 && (
          <div className="text-xs text-gray-400 mt-2">
            Current gear cost:
            {' '}
            <span className="text-gray-300">{formatBudget(comparison.currentCost)}</span>
          </div>
        )}

        {/* Cost breakdown when there are owned items */}
        {cost.ownedSavings > 0 && (
          <div className="text-xs text-gray-400 mt-2 font-mono">
            {formatBudget(cost.fullTotal)}
            {' '}
            -
            {' '}
            <span className="text-green-400">
              {formatBudget(cost.ownedSavings)}
              {' '}
              (owned)
            </span>
            {' '}
            =
            {' '}
            <span className="text-yellow-400">{formatBudget(cost.total)}</span>
          </div>
        )}

        {/* Full cost details */}
        {cost.fullTotal > 0 && (
          <div className="text-xs text-gray-500 mt-1">
            Total gear value:
            {' '}
            {cost.fullTotal.toLocaleString()}
            {' '}
            gp
          </div>
        )}
      </div>

      {/* Apply to Loadout section */}
      {onApply && (
        <div className="bg-dark-500 rounded p-3">
          {showConfirmation ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-200 text-center">
                Replace equipment in
                {' '}
                <span className="font-semibold text-white">{loadoutName || 'current loadout'}</span>
                ?
              </p>
              <p className="text-xs text-gray-400 text-center">
                This will overwrite your current gear setup.
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  className="btn flex items-center gap-1 text-sm px-3 py-1.5"
                  onClick={handleCancel}
                >
                  <IconX size={16} />
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn flex items-center gap-1 text-sm px-3 py-1.5 bg-green-700 hover:bg-green-600"
                  onClick={handleConfirm}
                >
                  <IconCheck size={16} />
                  Confirm
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="w-full btn flex items-center justify-center gap-2 py-2"
              onClick={handleApplyClick}
            >
              <IconCheck size={18} />
              Apply to Loadout
            </button>
          )}
        </div>
      )}

      {/* Meta info (for debugging/transparency) */}
      <div className="text-xs text-gray-500 text-center">
        Evaluated
        {' '}
        {meta.evaluations.toLocaleString()}
        {' '}
        items in
        {' '}
        {meta.timeMs.toFixed(0)}
        ms
      </div>

      {/* Item tooltip - renders rich content for equipment items */}
      <Tooltip
        id="item-tooltip"
        className="z-50"
        place="top"
        delayShow={100}
        clickable
        render={({ activeAnchor }) => {
          const itemIdStr = activeAnchor?.getAttribute('data-item-id');
          if (!itemIdStr) return null;
          const itemId = parseInt(itemIdStr);
          const item = getItemFromEquipment(equipment, itemId);
          if (!item) return null;
          return <ItemTooltip item={item} />;
        }}
      />
    </div>
  );
};

export default OptimizerResults;
