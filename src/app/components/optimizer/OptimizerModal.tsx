import React from 'react';
import { observer } from 'mobx-react-lite';
import Modal from '@/app/components/generic/Modal';
import { IconSparkles } from '@tabler/icons-react';

interface OptimizerModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const OptimizerModal: React.FC<OptimizerModalProps> = observer(({ isOpen, setIsOpen }) => (
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
          <p className="text-gray-400 text-xs">
            Settings will be added here in future updates (budget, combat style, owned items, blacklist).
          </p>
        </div>
      </div>
    </div>
  </Modal>
));

export default OptimizerModal;
