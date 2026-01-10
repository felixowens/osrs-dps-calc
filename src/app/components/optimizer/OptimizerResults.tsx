import React, { useState } from 'react';
import { IconCheck, IconX } from '@tabler/icons-react';
import { OptimizerResult, EquipmentSlot } from '@/types/Optimizer';
import { PlayerEquipment } from '@/types/Player';
import { getCdnImage } from '@/utils';
import { formatBudget } from '@/app/components/optimizer/BudgetInput';
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

interface OptimizerResultsProps {
  result: OptimizerResult;
  onApply?: () => void;
  loadoutName?: string;
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
}> = ({ slot, equipment, cost }) => {
  const item = equipment[slot];
  const placeholder = SLOT_PLACEHOLDERS[slot];

  return (
    <div className="flex flex-col items-center">
      <div
        className="flex justify-center items-center h-[40px] w-[40px] bg-dark-400 border border-dark-300 rounded"
        data-tooltip-id="tooltip"
        data-tooltip-content={item?.name || `Empty ${slot}`}
      >
        {item?.image ? (
          <img src={getCdnImage(`equipment/${item.image}`)} alt={item.name} />
        ) : (
          <img className="opacity-30 dark:filter dark:invert" src={placeholder} alt={slot} />
        )}
      </div>
      {cost !== undefined && cost > 0 && (
        <span className="text-[10px] text-yellow-400 mt-0.5">{formatBudget(cost)}</span>
      )}
    </div>
  );
};

/**
 * Display the optimized equipment in a grid similar to the main equipment grid
 */
const ResultsEquipmentGrid: React.FC<{
  equipment: PlayerEquipment;
  perSlotCost: Partial<Record<EquipmentSlot, number>>;
}> = ({ equipment, perSlotCost }) => (
  <div className="flex flex-col items-center">
    <div className="flex justify-center">
      <ResultSlot slot="head" equipment={equipment} cost={perSlotCost.head} />
    </div>
    <div className="mt-1 flex justify-center gap-2">
      <ResultSlot slot="cape" equipment={equipment} cost={perSlotCost.cape} />
      <ResultSlot slot="neck" equipment={equipment} cost={perSlotCost.neck} />
      <ResultSlot slot="ammo" equipment={equipment} cost={perSlotCost.ammo} />
    </div>
    <div className="mt-1 flex justify-center gap-6">
      <ResultSlot slot="weapon" equipment={equipment} cost={perSlotCost.weapon} />
      <ResultSlot slot="body" equipment={equipment} cost={perSlotCost.body} />
      <ResultSlot slot="shield" equipment={equipment} cost={perSlotCost.shield} />
    </div>
    <div className="mt-1 flex justify-center">
      <ResultSlot slot="legs" equipment={equipment} cost={perSlotCost.legs} />
    </div>
    <div className="mt-1 flex justify-center gap-6">
      <ResultSlot slot="hands" equipment={equipment} cost={perSlotCost.hands} />
      <ResultSlot slot="feet" equipment={equipment} cost={perSlotCost.feet} />
      <ResultSlot slot="ring" equipment={equipment} cost={perSlotCost.ring} />
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

const OptimizerResults: React.FC<OptimizerResultsProps> = ({ result, onApply, loadoutName }) => {
  const {
    equipment, metrics, cost, meta,
  } = result;

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
            <div className="text-lg font-bold text-green-400">{formatDps(metrics.dps)}</div>
            <div className="text-xs text-gray-400">DPS</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-400">{formatAccuracy(metrics.accuracy)}</div>
            <div className="text-xs text-gray-400">Accuracy</div>
          </div>
          <div>
            <div className="text-lg font-bold text-orange-400">{metrics.maxHit}</div>
            <div className="text-xs text-gray-400">Max Hit</div>
          </div>
        </div>
      </div>

      {/* Equipment Grid */}
      <div className="bg-dark-500 rounded p-3">
        <h4 className="text-sm font-semibold text-gray-200 mb-3">Optimized Gear</h4>
        <ResultsEquipmentGrid equipment={equipment} perSlotCost={cost.perSlot} />
      </div>

      {/* Cost Summary */}
      <div className="bg-dark-500 rounded p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-300">Cost to Buy</span>
          <span className="text-lg font-bold text-yellow-400">
            {cost.total > 0 ? formatBudget(cost.total) : 'Free'}
          </span>
        </div>

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
    </div>
  );
};

export default OptimizerResults;
