import { Player } from '@/types/Player';
import { Monster } from '@/types/Monster';
import { NPCVsPlayerCalculatedLoadout, PlayerVsNPCCalculatedLoadout } from '@/types/State';
import { CalcOpts } from '@/lib/BaseCalc';
import {
  CompareResult, CompareXAxis, CompareYAxis,
} from '@/lib/Comparator';
import {
  CombatStyle, OptimizationObjective, OptimizerConstraints, OptimizerProgress, OptimizerResult,
} from '@/types/Optimizer';

/**
 * Requests
 */

export enum WorkerRequestType {
  COMPUTE_BASIC,
  COMPUTE_REVERSE,
  COMPUTE_TTK_PARALLEL,
  COMPUTE_TTK,
  COMPARE,
  OPTIMIZE,
  OPTIMIZE_PROGRESS,
}

export interface WorkerRequest<T extends WorkerRequestType> {
  type: T,
  sequenceId?: number,
}

export interface WorkerCalcOpts {
  hitDistHideMisses?: boolean,
  detailedOutput?: CalcOpts['detailedOutput'],
  disableMonsterScaling?: CalcOpts['disableMonsterScaling'],
}

export interface ComputeBasicRequest extends WorkerRequest<WorkerRequestType.COMPUTE_BASIC> {
  data: {
    loadouts: Player[],
    monster: Monster,
    calcOpts: WorkerCalcOpts,
  }
}

export interface ComputeReverseRequest extends WorkerRequest<WorkerRequestType.COMPUTE_REVERSE> {
  data: {
    loadouts: Player[],
    monster: Monster,
    calcOpts: WorkerCalcOpts,
  }
}

export interface CompareRequest extends WorkerRequest<WorkerRequestType.COMPARE> {
  data: {
    axes: {
      x: CompareXAxis,
      y: CompareYAxis,
    },
    loadouts: Player[],
    monster: Monster,
  },
}

export interface TtkRequest extends WorkerRequest<WorkerRequestType.COMPUTE_TTK> {
  data: {
    loadouts: Player[],
    monster: Monster,
    calcOpts: WorkerCalcOpts,
  },
}

export interface TtkRequestParallel extends WorkerRequest<WorkerRequestType.COMPUTE_TTK_PARALLEL> {
  data: TtkRequest['data']
}

export interface OptimizeRequest extends WorkerRequest<WorkerRequestType.OPTIMIZE> {
  data: {
    /** Base player to optimize from (provides skills, prayers, style context) */
    player: Player,
    /** Monster to optimize against */
    monster: Monster,
    /** Combat style to optimize for */
    combatStyle?: CombatStyle,
    /** Optimization objective (dps, accuracy, max_hit) */
    objective?: OptimizationObjective,
    /** Constraints for the optimization */
    constraints?: OptimizerConstraints,
  }
}

export type CalcRequestsUnion =
  ComputeBasicRequest |
  ComputeReverseRequest |
  CompareRequest |
  TtkRequest |
  TtkRequestParallel |
  OptimizeRequest;

/**
 * Responses
 */

export interface WorkerResponse<T extends WorkerRequestType> {
  type: T,
  sequenceId: number,
  error?: string,
  payload: unknown,
}

export interface ComputeBasicResponse extends WorkerResponse<WorkerRequestType.COMPUTE_BASIC> {
  payload: Omit<PlayerVsNPCCalculatedLoadout, 'ttkDist'>[],
}

export interface ComputeReverseResponse extends WorkerResponse<WorkerRequestType.COMPUTE_REVERSE> {
  payload: NPCVsPlayerCalculatedLoadout[],
}

export interface CompareResponse extends WorkerResponse<WorkerRequestType.COMPARE> {
  payload: CompareResult,
}

export interface TtkResponse extends WorkerResponse<WorkerRequestType.COMPUTE_TTK> {
  payload: Pick<PlayerVsNPCCalculatedLoadout, 'ttkDist'>[],
}

export interface TtkResponseParallel extends WorkerResponse<WorkerRequestType.COMPUTE_TTK_PARALLEL> {
  payload: TtkResponse['payload'],
}

export interface OptimizeResponse extends WorkerResponse<WorkerRequestType.OPTIMIZE> {
  payload: OptimizerResult,
}

/**
 * Progress update sent during optimization.
 * This is sent as an intermediate message before the final OptimizeResponse.
 */
export interface OptimizeProgressResponse extends WorkerResponse<WorkerRequestType.OPTIMIZE_PROGRESS> {
  payload: OptimizerProgress,
}

export type CalcResponsesUnion =
  ComputeBasicResponse |
  ComputeReverseResponse |
  CompareResponse |
  TtkResponse |
  TtkResponseParallel |
  OptimizeResponse |
  OptimizeProgressResponse;
export type CalcResponse<T extends WorkerRequestType> = CalcResponsesUnion & { type: T };

export type Handler<T extends WorkerRequestType> = (data: Extract<CalcRequestsUnion, { type: T }>['data'], rawRequest: CalcRequestsUnion) => Promise<CalcResponse<T>['payload']>;

export const WORKER_JSON_REPLACER = (k: string, v: Map<unknown, unknown> | Set<unknown> | never) => {
  if (v instanceof Map) {
    return {
      _dataType: 'Map',
      m: Array.from(v),
    };
  }
  if (v instanceof Set) {
    return {
      _dataType: 'Set',
      s: Array.from(v),
    };
  }
  return v;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const WORKER_JSON_REVIVER = (k: string, v: any) => {
  if (typeof v === 'object' && v?._dataType === 'Map') {
    return new Map(v.m);
  }
  if (typeof v === 'object' && v?._dataType === 'Set') {
    return new Set(v.s);
  }
  return v;
};
