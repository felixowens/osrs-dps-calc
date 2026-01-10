import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import Modal from '@/app/components/generic/Modal';
import { IconSparkles } from '@tabler/icons-react';
import BlacklistManager from '@/app/components/optimizer/BlacklistManager';
import BudgetInput from '@/app/components/optimizer/BudgetInput';
import CombatStyleSelector, { getCombatStyleFromType } from '@/app/components/optimizer/CombatStyleSelector';
import ObjectiveSelector from '@/app/components/optimizer/ObjectiveSelector';
import OwnedItemsManager from '@/app/components/optimizer/OwnedItemsManager';
import { CombatStyle, OptimizationObjective } from '@/types/Optimizer';
import { useStore } from '@/state';

interface OptimizerModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const OptimizerModal: React.FC<OptimizerModalProps> = observer(({ isOpen, setIsOpen }) => {
  const store = useStore();

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
            Cancel
          </button>
          <button
            type="button"
            className="btn"
          >
            Optimize
          </button>
        </>
      )}
    >
      <div className="text-sm">
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
      </div>
    </Modal>
  );
});

export default OptimizerModal;
