import React, { useState, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { toast } from 'react-toastify';
import Modal from '@/app/components/generic/Modal';
import { IconSparkles, IconLoader2 } from '@tabler/icons-react';
import BlacklistManager from '@/app/components/optimizer/BlacklistManager';
import BudgetInput from '@/app/components/optimizer/BudgetInput';
import CombatStyleSelector from '@/app/components/optimizer/CombatStyleSelector';
import ObjectiveSelector from '@/app/components/optimizer/ObjectiveSelector';
import OwnedItemsManager from '@/app/components/optimizer/OwnedItemsManager';
import OptimizerResults, { ComparisonData } from '@/app/components/optimizer/OptimizerResults';
import { CombatStyle, OptimizationObjective, OptimizerResult } from '@/types/Optimizer';
import { calculateLoadoutCost } from '@/lib/Optimizer';
import PlayerVsNPCCalc from '@/lib/PlayerVsNPCCalc';
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

  // Get settings from global store (persists across modal open/close)
  const { combatStyle, objective, budget } = store.optimizerSettings;

  // Callbacks to update settings in the store
  const setCombatStyle = useCallback((style: CombatStyle) => {
    store.updateOptimizerSettings({ combatStyle: style });
  }, [store]);

  const setObjective = useCallback((obj: OptimizationObjective) => {
    store.updateOptimizerSettings({ objective: obj });
  }, [store]);

  const setBudget = useCallback((b: number | null) => {
    store.updateOptimizerSettings({ budget: b });
  }, [store]);

  // Owned items state: Set of item IDs the user owns
  // (uses component-level state + localStorage for persistence)
  const [ownedItems, setOwnedItems] = useState<Set<number>>(new Set());

  // Blacklisted items state: Set of item IDs to exclude from optimization
  // (uses component-level state + localStorage for persistence)
  const [blacklistedItems, setBlacklistedItems] = useState<Set<number>>(new Set());

  // Optimization result state
  const [result, setResult] = useState<OptimizerResult | null>(null);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Calculate comparison data from current loadout
  const comparisonData: ComparisonData | undefined = useMemo(() => {
    // Calculate current player's metrics
    const currentCalc = new PlayerVsNPCCalc(store.player, store.monster);
    const currentDps = currentCalc.getDps();
    const currentAccuracy = currentCalc.getHitChance();
    const currentMaxHit = currentCalc.getMax();

    // Calculate current equipment cost
    const currentCostInfo = calculateLoadoutCost(store.player.equipment, ownedItems);

    return {
      currentDps,
      currentAccuracy,
      currentMaxHit,
      currentCost: currentCostInfo.total,
      currentEquipment: store.player.equipment,
    };
  }, [store.player, store.monster, ownedItems]);

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
          objective,
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
  }, [calc, store.player, store.monster, combatStyle, objective, budget, ownedItems, blacklistedItems]);

  // Apply optimized loadout to current loadout
  const applyLoadout = useCallback(() => {
    if (!result) return;

    // Update the player's equipment with the optimized gear
    store.updatePlayer({
      equipment: result.equipment,
    });

    // Close the modal
    setIsOpen(false);

    // Show success toast
    toast.success(
      `Applied optimized gear to ${store.player.name}`,
      { toastId: 'optimizer-apply' },
    );
  }, [result, store, setIsOpen]);

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
            <OptimizerResults
              result={result}
              onApply={applyLoadout}
              loadoutName={store.player.name}
              comparison={comparisonData}
            />
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
