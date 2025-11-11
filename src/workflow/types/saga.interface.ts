export interface SagaStep<T = any, P = any> {
  /**
   * The original event that triggered this step
   */
  event: string;

  /**
   * Timestamp when step was executed
   */
  executedAt: Date;

  /**
   * The entity state before this step
   */
  beforeState: T;

  /**
   * The entity state after this step
   */
  afterState: T;

  /**
   * Payload used for this step
   */
  payload?: P;

  /**
   * Whether this step has been compensated
   */
  compensated: boolean;
}

export interface SagaContext<T = any> {
  /**
   * Unique identifier for the SAGA transaction
   */
  sagaId: string;

  /**
   * The entity being processed
   */
  entity: T;

  /**
   * List of executed steps in chronological order
   */
  executedSteps: SagaStep<T>[];

  /**
   * Current SAGA status
   */
  status: SagaStatus;

  /**
   * Timestamp when SAGA started
   */
  startedAt: Date;

  /**
   * Timestamp when SAGA completed/failed
   */
  completedAt?: Date;

  /**
   * Error that caused the SAGA to fail (if any)
   */
  error?: Error;

  /**
   * Additional metadata for the SAGA
   */
  metadata?: Record<string, any>;
}

export enum SagaStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  COMPENSATING = 'compensating',
  COMPENSATED = 'compensated',
  FAILED = 'failed',
}

/**
 * NOTE: used in decorator
 */
export interface ISagaRollbackRule<T = any> {
  /**
   * Condition that triggers this rollback rule
   */
  condition?: (error: Error, context: SagaContext<T>) => boolean;

  /**
   * Whether to stop on first compensation failure
   */
  failFast?: boolean;

  /**
   * Maximum time to wait for all compensations to complete
   */
  timeout?: number;
}

export enum RollbackStrategy {
  /**
   * Execute compensations in reverse order of execution
   */
  REVERSE_ORDER = 'reverse_order',

  /**
   * Execute all compensations in parallel
   */
  PARALLEL = 'parallel',

  /* *
   * Exucute compensations in the order of execution
   */
  IN_ORDER = 'in_order',
}

/**
 * SAGA configuration that can be added to workflow definitions
 */
export interface ISagaConfig {
  /**
   * Enable SAGA pattern for this workflow
   */
  enabled: boolean;

  /**
   * Selective mode, for type-safe purposes
   */
  mode: 'saga';

  /**
   * Rollback strategy if no specific rules match
   */
  rollbackStrategy: RollbackStrategy;

  /**
   * Maximum time to wait for SAGA completion
   * DEFAULT: 30000 ms
   */
  timeout?: number;

  /**
   *
   */
  failFast?: boolean;

  /**
   * Injection token refer to saga history service that implements ISagaHistoryStore<T>
   */
  historyService: string;

  /**
   * Custom SAGA ID generator
   */
  sagaIdGenerator?: () => string;
}

export interface ISagaHistoryStore<T = any> {
  /**
   * Save the current SAGA context state
   */
  saveSagaContext: (context: SagaContext<T>) => Promise<void>;

  /**
   * Retrieve a SAGA context by its ID
   */
  getSagaContext: (sagaId: string) => Promise<SagaContext<T> | null>;

  /**
   * Delete a SAGA context by its ID
   */
  deleteSagaContext: (sagaId: string) => Promise<void>;
}
