import { Injectable, Logger } from '@nestjs/common';
import { Workflow, OnEvent, OnCompensation, Entity, Payload, RollbackStrategy } from '@/workflow';
import { ISagaHistoryStore, SagaContext } from '@/workflow';

/**
 * SIMPLE SAGA EXAMPLE
 *
 * This is a minimal example showing how to integrate SAGA pattern into your workflow.
 * It demonstrates a simple 2-step process with automatic compensation on failure.
 */

// ==================== Domain Model ====================

interface UserAccount {
  id: string;
  email: string;
  status: AccountStatus;
  subscriptionId?: string;
  paymentId?: string;
}

enum AccountStatus {
  CREATED = 'created',
  SUBSCRIBED = 'subscribed',
  ACTIVE = 'active',
  FAILED = 'failed',
}

// ==================== Workflow with SAGA ====================

@Injectable()
@Workflow({
  name: 'user-onboarding',
  entityService: 'AccountEntityService',
  brokerPublisher: 'AccountBrokerPublisher',
  states: {
    finals: [AccountStatus.ACTIVE, AccountStatus.FAILED],
    failed: AccountStatus.FAILED,
    idles: [],
  },
  transitions: [
    {
      from: [AccountStatus.CREATED],
      to: AccountStatus.SUBSCRIBED,
      event: 'account.subscribe',
    },
    {
      from: [AccountStatus.SUBSCRIBED],
      to: AccountStatus.ACTIVE,
      event: 'account.activate',
    },
  ],
  saga: {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'AccountSagaHistoryService',
  },
})
export class UserOnboardingWorkflow {
  private readonly logger = new Logger(UserOnboardingWorkflow.name);

  // ==================== Step 1: Create Subscription ====================

  @OnEvent('account.subscribe')
  async createSubscription(@Entity() account: UserAccount): Promise<any> {
    this.logger.log(`Creating subscription for ${account.email}`);

    // Your business logic here
    const subscriptionId = `SUB-${Date.now()}`;

    return { subscriptionId };
  }

  @OnCompensation('account.subscribe', {
    enabled: true,
    mode: 'saga',
    rollbackStrategy: RollbackStrategy.REVERSE_ORDER,
    historyService: 'AccountSagaHistoryService',
  })
  async cancelSubscription(@Entity() account: UserAccount, @Payload() payload: any): Promise<void> {
    this.logger.warn(`Canceling subscription for ${account.email}`);

    // Undo the subscription
    // await this.subscriptionService.cancel(payload.subscriptionId);
  }

  // ==================== Step 2: Activate Account ====================

  @OnEvent('account.activate')
  async activateAccount(@Entity() account: UserAccount, @Payload() payload: any): Promise<void> {
    this.logger.log(`Activating account for ${account.email}`);

    // Your activation logic
    // await this.emailService.sendWelcome(account.email);
  }
}

// ==================== Simple In-Memory History Store ====================

@Injectable()
export class AccountSagaHistoryService implements ISagaHistoryStore<UserAccount> {
  private readonly storage = new Map<string, SagaContext<UserAccount>>();

  async saveSagaContext(context: SagaContext<UserAccount>): Promise<void> {
    this.storage.set(context.sagaId, JSON.parse(JSON.stringify(context)));
  }

  async getSagaContext(sagaId: string): Promise<SagaContext<UserAccount> | null> {
    return this.storage.get(sagaId) || null;
  }

  async deleteSagaContext(sagaId: string): Promise<void> {
    this.storage.delete(sagaId);
  }
}

// ==================== Usage Example ====================

/**
 * HOW IT WORKS:
 *
 * 1. User account starts in CREATED status
 * 2. Event 'account.subscribe' triggers → createSubscription()
 *    - If successful, moves to SUBSCRIBED status
 *    - SAGA records this step
 * 3. Event 'account.activate' triggers → activateAccount()
 *    - If successful, moves to ACTIVE status
 *    - SAGA records this step
 *    - Workflow completes ✓
 *
 * IF STEP 2 FAILS:
 * - SAGA marks the workflow as failed
 * - Compensations execute in REVERSE order:
 *   1. cancelSubscription() is called
 * - Account moves to FAILED status
 *
 * Module Registration:
 *
 * @Module({
 *   providers: [
 *     UserOnboardingWorkflow,
 *     { provide: 'AccountEntityService', useClass: AccountEntityService },
 *     { provide: 'AccountBrokerPublisher', useClass: AccountBrokerPublisher },
 *     { provide: 'AccountSagaHistoryService', useClass: AccountSagaHistoryService },
 *   ],
 * })
 * export class UserModule {}
 */
