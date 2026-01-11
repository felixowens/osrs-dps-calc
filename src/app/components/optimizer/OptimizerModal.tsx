import React, {
  useState, useCallback, useMemo, useEffect,
} from 'react';
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
import {
  CombatStyle, OptimizationObjective, OptimizerProgress, OptimizerResult,
} from '@/types/Optimizer';
import { calculateLoadoutCost, fetchAndLoadPrices, arePricesLoaded } from '@/lib/Optimizer';
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
  const {
    combatStyle, objective, budget, enforceSkillReqs,
  } = store.optimizerSettings;

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

  const setEnforceSkillReqs = useCallback((enforce: boolean) => {
    store.updateOptimizerSettings({ enforceSkillReqs: enforce });
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

  // Progress state
  const [progress, setProgress] = useState<OptimizerProgress | null>(null);

  // Clean up progress callback when modal closes or component unmounts
  useEffect(() => {
    if (!isOpen) {
      calc.setOptimizeProgressCallback(undefined);
    }
    return () => {
      calc.setOptimizeProgressCallback(undefined);
    };
  }, [isOpen, calc]);

  // Load prices when modal opens (for tooltips and cost display)
  useEffect(() => {
    if (isOpen && !arePricesLoaded()) {
      fetchAndLoadPrices().then((res) => {
        if (res.success) {
          console.debug(`Loaded ${res.itemCount} item prices for tooltips`);
        }
      });
    }
  }, [isOpen]);

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
    setProgress(null);

    // Register progress callback to receive updates
    calc.setOptimizeProgressCallback((p) => {
      setProgress(p);
    });

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
            enforceSkillReqs: enforceSkillReqs || undefined,
            playerSkills: enforceSkillReqs ? store.player.skills : undefined,
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
      calc.setOptimizeProgressCallback(undefined);
    }
  }, [calc, store.player, store.monster, combatStyle, objective, budget, ownedItems, blacklistedItems, enforceSkillReqs]);

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

  // Format phase name for display
  const formatPhaseName = (phase: string): string => {
    const phaseNames: Record<string, string> = {
      initializing: 'Initializing',
      filtering: 'Filtering equipment',
      weapons: 'Evaluating weapons',
      ammunition: 'Selecting ammunition',
      slots: 'Optimizing slots',
      set_bonuses: 'Checking set bonuses',
      budget: 'Applying budget constraint',
      complete: 'Complete',
    };
    return phaseNames[phase] || phase;
  };

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

        {/* Loading state with progress */}
        {isLoading && (
          <div className="mb-4 p-4 flex flex-col items-center justify-center">
            <IconLoader2 size={32} className="animate-spin text-yellow-400 mb-3" />

            {/* Progress info */}
            {progress ? (
              <>
                {/* Phase and percentage */}
                <p className="text-gray-200 font-medium">
                  {formatPhaseName(progress.phase)}
                  <span className="text-yellow-400 ml-2">
                    {`${Math.round(progress.progress)}%`}
                  </span>
                </p>

                {/* Progress bar */}
                <div className="w-full max-w-xs mt-2 mb-2">
                  <div className="h-2 bg-dark-300 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 transition-all duration-200 ease-out"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                </div>

                {/* Step info */}
                <p className="text-xs text-gray-400">
                  Step
                  {' '}
                  {progress.currentStep}
                  {' '}
                  of
                  {' '}
                  {progress.totalSteps}
                </p>

                {/* Optional message */}
                {progress.message && (
                  <p className="text-xs text-gray-500 mt-1">{progress.message}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-gray-300">Finding optimal gear setup...</p>
                <p className="text-xs text-gray-500 mt-1">Starting optimization...</p>
              </>
            )}
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

              <div className="bg-dark-400 rounded p-3">
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enforceSkillReqs}
                    onChange={(e) => setEnforceSkillReqs(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-500 text-blue-600 focus:ring-blue-500 focus:ring-offset-dark-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-200">
                      Enforce skill requirements
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Only consider items your character can equip based on current skills
                    </p>
                  </div>
                </label>
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

              <div className="bg-dark-400 rounded p-3">
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enforceSkillReqs}
                    onChange={(e) => setEnforceSkillReqs(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-500 text-blue-600 focus:ring-blue-500 focus:ring-offset-dark-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-200">
                      Enforce skill requirements
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Only consider items your character can equip based on current skills
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
});

export default OptimizerModal;
