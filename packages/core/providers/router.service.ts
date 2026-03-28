import { BadRequestException, type Logger } from '@nestjs/common';
import type { Duration, ITransitionEvent, IWorkflowDefinition, IWorkflowEntity, PayloadValidator } from '../types';

/**
 * Transition-matching and entity-validation logic for a single workflow event.
 *
 * Created per-request by {@link StateRouterHelperFactory}. Encapsulates the
 * rules for finding a valid transition, checking conditions, resolving idle
 * states, and building handler arguments from parameter decorators.
 *
 * @typeParam T     - Entity type
 * @typeParam Event - Event name type
 * @typeParam State - State value type
 * @internal
 */
export class RouterService<T, Event, State> {
  constructor(
    private readonly event: Event,
    private readonly entityService: IWorkflowEntity,
    private readonly workflowDefinition: IWorkflowDefinition<T, Event, State>,
    private readonly logger: Logger,
    private readonly payloadValidator: PayloadValidator | null,
  ) {}

  /** Load the entity by URN and verify it exists. Warns if already in a final state. */
  async loadAndValidateEntity(urn: string | number): Promise<T> {
    const entity = await this.entityService.load(urn);
    if (!entity) {
      this.logger.error(`Element not found`, urn);
      throw new BadRequestException(`Entity not found`, String(urn));
    }

    const entityStatus = this.entityService.status(entity);
    const definedFinalStates = this.workflowDefinition.states.finals as Array<string | number>;

    if (definedFinalStates.includes(entityStatus)) {
      this.logger.warn(`Entity: ${urn} is in a final status. Accepting transitions due to a retry mechanism.`, urn);
    }

    return entity;
  }

  /**
   * Search the workflow's transitions for a valid match given the entity's
   * current state, the incoming event, and any guard conditions.
   *
   * @param options.skipEventCheck - When `true`, matches transitions by state
   *   only (used for auto-transition after a handler completes).
   * @returns The first matching transition and whether any event+state pair matched.
   */
  findValidTransition<P>(
    entity: T,
    payload: P,
    options?: { skipEventCheck?: boolean },
  ): { transition: ITransitionEvent<T, Event, State, P> | null; hasEventStateMatch: boolean } {
    const currentStatus = this.entityService.status(entity);
    const skipEventCheck = options?.skipEventCheck === true;

    let firstMatch: ITransitionEvent<T, Event, State, P> | null = null;
    let hasEventStateMatch = false;

    for (const t of this.workflowDefinition.transitions) {
      if (!this.matchesState(t.from, currentStatus)) continue;
      if (!skipEventCheck && !this.matchesEvent(t.event)) continue;

      hasEventStateMatch = true;

      if (t.conditions?.some((c) => !c(entity, payload))) continue;

      if (!firstMatch) {
        firstMatch = t;
      } else if (t.to !== firstMatch.to) {
        if (skipEventCheck) return { transition: null, hasEventStateMatch };
        throw new BadRequestException(
          `Multiple "to" transition states is not allowed, please verify Workflow Definition at @Workflow decorator: [${firstMatch.to}, ${t.to}]`,
        );
      }
    }

    return { transition: firstMatch, hasEventStateMatch };
  }

  private matchesState(from: State | State[], currentStatus: string | number): boolean {
    return Array.isArray(from)
      ? (from as Array<string | number>).includes(currentStatus)
      : (from as string | number) === currentStatus;
  }

  private matchesEvent(event: Event | Event[]): boolean {
    return Array.isArray(event) ? event.includes(this.event) : event === this.event;
  }

  /** Check whether the entity's current state is listed as an idle state. */
  isInIdleStatus(entity: T): boolean {
    const status = this.entityService.status(entity);
    if (!status) {
      throw new Error('Entity status is not defined. Unable to determine if the entity is idle or not.');
    }
    return this.workflowDefinition.states.idles.some((entry) =>
      typeof entry === 'object' && entry !== null && 'state' in entry
        ? (entry.state as string | number) === status
        : (entry as string | number) === status,
    );
  }

  /** Return the per-state timeout for an idle state, or `undefined` if none configured. */
  getIdleTimeout(state: string | number): Duration | undefined {
    for (const entry of this.workflowDefinition.states.idles) {
      if (typeof entry === 'object' && entry !== null && 'state' in entry) {
        if ((entry.state as string | number) === state) return entry.timeout;
      }
    }
    return undefined;
  }

  /**
   * Resolve `@Entity()` and `@Payload()` parameter decorators into an ordered
   * argument array for the handler method. Falls back to the legacy
   * `{ entity, payload }` shape when no decorator metadata is present.
   */
  buildParamDecorators(entity: T, payload: any, target: any, propertyKey: string | symbol) {
    // Metadata is stored on the prototype when decorators are applied
    const prototype = target.constructor?.prototype || target;
    const paramsMeta: Array<{ index: number; type: string; dto?: any }> =
      Reflect.getOwnMetadata('workflow:params', prototype, propertyKey) || [];

    let args: any[] = [];
    if (paramsMeta && paramsMeta.length > 0) {
      // populate args according to metadata indices
      for (const meta of paramsMeta) {
        if (meta.type === 'entity') args[meta.index] = entity;
        else if (meta.type === 'payload') args[meta.index] = this.validatePayload(meta.dto, payload);
        else args[meta.index] = undefined;
      }
    } else {
      // legacy: single object param { entity, payload }
      args = [{ entity, payload }];
    }
    return args;
  }

  /** Validate and optionally transform the payload using the user-supplied validator. */
  private validatePayload(dto: unknown, payload: unknown): unknown {
    if (!dto || !this.payloadValidator) return payload;
    try {
      return this.payloadValidator(dto, payload);
    } catch (error) {
      throw new BadRequestException(
        `Payload validation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
