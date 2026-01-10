import React from 'react';
import { OptimizationObjective } from '@/types/Optimizer';

interface ObjectiveSelectorProps {
  objective: OptimizationObjective;
  setObjective: (objective: OptimizationObjective) => void;
}

const OBJECTIVES: { value: OptimizationObjective; label: string; description: string }[] = [
  { value: 'dps', label: 'DPS', description: 'Maximize damage per second' },
  { value: 'accuracy', label: 'Accuracy', description: 'Maximize hit chance' },
  { value: 'max_hit', label: 'Max Hit', description: 'Maximize maximum hit' },
];

const ObjectiveSelector: React.FC<ObjectiveSelectorProps> = ({
  objective,
  setObjective,
}) => (
  <div className="space-y-2">
    <span className="text-sm text-gray-300">Optimization Objective</span>

    <div className="flex rounded overflow-hidden border border-dark-300">
      {OBJECTIVES.map(({ value, label }) => {
        const isSelected = objective === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setObjective(value)}
            className={`
                flex-1 px-4 py-2 text-sm font-medium transition-colors
                ${isSelected
              ? 'bg-dark-300 text-yellow-400'
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
      {OBJECTIVES.find((o) => o.value === objective)?.description || 'Select what to optimize for.'}
    </p>
  </div>
);

export default ObjectiveSelector;
