'use client';

import React from 'react';
import { observer } from 'mobx-react-lite';
import { Tooltip } from 'react-tooltip';
import { ToastContainer } from 'react-toastify';
import { IconArrowLeft, IconSparkles } from '@tabler/icons-react';
import Link from 'next/link';

const OptimizerPage: React.FC = observer(() => (
  <div className="max-w-[800px] mx-auto mt-4 md:mb-8 px-4">
    <div className="mb-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-sm"
      >
        <IconArrowLeft size={16} />
        Back to Calculator
      </Link>
    </div>

    <div className="bg-tile dark:bg-dark-300 rounded-lg shadow-lg overflow-hidden">
      <div className="bg-btns-300 dark:bg-dark-500 px-5 py-3 border-b border-body-400 dark:border-dark-200">
        <h1 className="text-lg font-bold font-serif text-white flex items-center gap-2">
          <IconSparkles size={24} className="text-yellow-400" />
          Gear Optimizer
        </h1>
      </div>

      <div className="p-5">
        <p className="text-gray-300 mb-4">
          The gear optimizer will find the best equipment setup for your current player stats and selected monster.
        </p>

        <div className="bg-dark-400 rounded p-4 mb-4">
          <h2 className="font-semibold text-white mb-2">Features coming soon:</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            <li>Budget constraints</li>
            <li>Combat style selection (melee, ranged, magic)</li>
            <li>Owned item tracking</li>
            <li>Item blacklisting</li>
            <li>One-click loadout application</li>
            <li>DPS comparison with current loadout</li>
          </ul>
        </div>

        <div className="text-sm text-gray-400">
          <p>
            The optimizer uses your current player stats and selected monster from the main calculator.
            Return to the calculator to configure your setup, then come back here to optimize.
          </p>
        </div>
      </div>
    </div>

    <Tooltip id="tooltip" />
    <ToastContainer
      position="bottom-right"
      hideProgressBar
      draggable={false}
      limit={3}
      closeButton={false}
      className="text-sm"
    />
  </div>
));

export default OptimizerPage;
