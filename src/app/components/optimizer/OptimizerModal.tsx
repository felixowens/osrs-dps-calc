import React, { useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import Modal from '@/app/components/generic/Modal';
import { IconSparkles, IconLoader2 } from '@tabler/icons-react';
import BlacklistManager from '@/app/components/optimizer/BlacklistManager';
import BudgetInput from '@/app/components/optimizer/BudgetInput';
import CombatStyleSelector, { getCombatStyleFromType } from '@/app/components/optimizer/CombatStyleSelector';
import ObjectiveSelector from '@/app/components/optimizer/ObjectiveSelector';
import OwnedItemsManager from '@/app/components/optimizer/OwnedItemsManager';
import OptimizerResults from '@/app/components/optimizer/OptimizerResults';
import { CombatStyle, OptimizationObjective, OptimizerResult } from '@/types/Optimizer';
import { useStore } from '@/state';
import { useCalc } from '@/worker/CalcWorker';
import { OptimizeRequest, WorkerRequestType } from '@/worker/CalcWorkerTypes';

interface OptimizerModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const OptimizerModal: React.FC<OptimizerModalProps> = observer(({ isOpen, setIsOpen }) => {
  const store = useStore();
  const calc = useCalc();

  // Derive default combat style from current player's equipped style
  const defaultCombatStyle = getCombatStyleFromType(store.player.style.type);

  // Budget state: null = unlimited, number = specific budget in gp
  const [budget, setBudget] = useState<number | null>(null);

  // Combat style state: defaults to current loadout style
  const [combatStyle, setCombatStyle] = useState<CombatStyle>(defaultCombatStyle);

  // Optimization objective state: defaults to DPS
  const [objective, setObjective] = useState<OptimizationObjective>('dps');

  // Owned items state: Set of item IDs the user owns
  const [ownedItems, setOwnedItems] = useState<Set<number>>(new Set());

  // Blacklisted items state: Set of item IDs to exclude from optimization
  const [blacklistedItems, setBlacklistedItems] = useState<Set<number>>(new Set());

  // Optimization result state
  const [result, setResult] = useState<OptimizerResult | null>(null);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Run optimization
  const runOptimization = useCallback(async () => {
    if (!calc.isReady()) {
      setError('Calculator worker is not ready. Please try again.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const request: OptimizeRequest = {
        type: WorkerRequestType.OPTIMIZE,
        data: {
          player: store.player,
          monster: store.monster,
          combatStyle,
          constraints: {
            maxBudget: budget ?? undefined,
            ownedItems: ownedItems.size > 0 ? ownedItems : undefined,
            blacklistedItems: blacklistedItems.size > 0 ? blacklistedItems : undefined,
          },
        },
      };

      const response = await calc.do(request);
      setResult(response.payload);
    } catch (err) {
      console.error('Optimization failed:', err);
      setError(err instanceof Error ? err.message : 'Optimization failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [calc, store.player, store.monster, combatStyle, budget, ownedItems, blacklistedItems]);

  return (
    <Modal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title={(
        <span className="flex items-center gap-2">
          <IconSparkles size={20} className="text-yellow-400" />
          Gear Optimizer
        </span>
      )}
      footerChildren={(
        <>
          <button
            type="button"
            className="btn"
            onClick={() => setIsOpen(false)}
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            className="btn flex items-center gap-2"
            onClick={runOptimization}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <IconLoader2 size={16} className="animate-spin" />
                Optimizing...
              </>
            ) : (
              <>
                <IconSparkles size={16} />
                {result ? 'Re-optimize' : 'Optimize'}
              </>
            )}
          </button>
        </>
      )}
    >
      <div className="text-sm">
        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200">
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="mb-4 p-4 flex flex-col items-center justify-center">
            <IconLoader2 size={32} className="animate-spin text-yellow-400 mb-2" />
            <p className="text-gray-300">Finding optimal gear setup...</p>
            <p className="text-xs text-gray-500 mt-1">This may take a few seconds</p>
          </div>
        )}

        {/* Results display */}
        {result && !isLoading && (
          <div className="mb-4">
            <OptimizerResults result={result} />
          </div>
        )}

        {/* Settings (collapsible when results are shown) */}
        {result && !isLoading ? (
          <details className="mt-4">
            <summary className="text-gray-400 cursor-pointer hover:text-gray-200 text-sm">
              Show optimization settings
            </summary>
            <div className="space-y-4 mt-4">
              <div className="bg-dark-400 rounded p-3">
                <CombatStyleSelector combatStyle={combatStyle} setCombatStyle={setCombatStyle} />
              </div>

              <div className="bg-dark-400 rounded p-3">
                <ObjectiveSelector objective={objective} setObjective={setObjective} />
              </div>

              <div className="bg-dark-400 rounded p-3">
                <BudgetInput budget={budget} setBudget={setBudget} />
              </div>

              <div className="bg-dark-400 rounded p-3">
                <OwnedItemsManager ownedItems={ownedItems} setOwnedItems={setOwnedItems} />
              </div>

              <div className="bg-dark-400 rounded p-3">
                <BlacklistManager blacklistedItems={blacklistedItems} setBlacklistedItems={setBlacklistedItems} />
              </div>
            </div>
          </details>
        ) : !isLoading && (
          <>
            <p className="text-gray-300 mb-4">
              Configure optimization settings below and click Optimize to find the best gear setup.
            </p>

            <div className="space-y-4">
              <div className="bg-dark-400 rounded p-3">
                <CombatStyleSelector combatStyle={combatStyle} setCombatStyle={setCombatStyle} />
              </div>

              <div className="bg-dark-400 rounded p-3">
                <ObjectiveSelector objective={objective} setObjective={setObjective} />
              </div>

              <div className="bg-dark-400 rounded p-3">
                <BudgetInput budget={budget} setBudget={setBudget} />
              </div>

              <div className="bg-dark-400 rounded p-3">
                <OwnedItemsManager ownedItems={ownedItems} setOwnedItems={setOwnedItems} />
              </div>

              <div className="bg-dark-400 rounded p-3">
                <BlacklistManager blacklistedItems={blacklistedItems} setBlacklistedItems={setBlacklistedItems} />
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
});

export default OptimizerModal;
