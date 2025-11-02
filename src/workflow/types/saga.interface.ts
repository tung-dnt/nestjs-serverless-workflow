/**
 * SAGA pattern interfaces for implementing distributed transaction consistency
 * with compensation-based rollback mechanisms in workflow definitions.
 */

export interface CompensationHandler<T = any, P = any> {
  /**
   * Unique identifier for the compensation handler
   */
  id: string;

  /**
   * The compensation function to execute during rollback
   */
  compensate: (context: SagaContext<T>, payload?: P) => Promise<void>;

  /**
   * Optional timeout for compensation execution (in milliseconds)
   */
  timeout?: number;

  /**
   * Whether this compensation is critical - if true, rollback fails if compensation fails
   */
  critical?: boolean;

  /**
   * Number of retry attempts for compensation
   */
  retries?: number;
}

export interface SagaStep<T = any, P = any> {
  /**
   * Step identifier
   */
  stepId: string;

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
  beforeState: any;

  /**
   * The entity state after this step
   */
  afterState: any;

  /**
   * Payload used for this step
   */
  payload?: P;

  /**
   * Compensation handler for this step
   */
  compensationHandler?: CompensationHandler<T, P>;

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

export interface SagaRollbackRule<T = any> {
  /**
   * Condition that triggers this rollback rule
   */
  condition: (error: Error, context: SagaContext<T>) => boolean;

  /**
   * Strategy for rollback execution
   */
  strategy: RollbackStrategy;

  /**
   * Custom compensation handlers to execute (overrides step-level handlers)
   */
  customCompensations?: CompensationHandler<T>[];

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

  /**
   * Custom strategy using provided compensation handlers
   */
  CUSTOM = 'custom',

  /**
   * No rollback - just mark as failed
   */
  NO_ROLLBACK = 'no_rollback',
}

/**
 * SAGA configuration that can be added to workflow definitions
 */
export interface SagaConfig<T = any> {
  /**
   * Enable SAGA pattern for this workflow
   */
  enabled: boolean;

  /**
   * Global rollback rules that apply to all transitions
   */
  globalRollbackRules?: SagaRollbackRule<T>[];

  /**
   * Default rollback strategy if no specific rules match
   */
  defaultRollbackStrategy?: RollbackStrategy;

  /**
   * Maximum time to wait for SAGA completion
   */
  timeout?: number;

  /**
   * Custom SAGA context persistence strategy
   */
  persistenceStrategy?: 'memory' | 'database' | 'external';

  /**
   * Custom SAGA ID generator
   */
  sagaIdGenerator?: () => string;
}

/**
 * Events emitted during SAGA execution
 */
export interface SagaEvents {
  'saga.started': { sagaId: string; context: SagaContext };
  'saga.step.executed': { sagaId: string; step: SagaStep };
  'saga.rollback.started': { sagaId: string; reason: string };
  'saga.step.compensated': { sagaId: string; stepId: string };
  'saga.completed': { sagaId: string; context: SagaContext };
  'saga.failed': { sagaId: string; error: Error; context: SagaContext };
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
