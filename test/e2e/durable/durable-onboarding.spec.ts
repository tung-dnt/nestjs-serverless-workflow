import type { DurableWorkflowEvent, DurableWorkflowResult } from '@/adapter';
import { DurableLambdaEventHandler } from '@/adapter';
import { WorkflowModule } from '@/core';
import { Test } from '@nestjs/testing';
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { MockDurableContext, mockWithDurableExecution } from '../fixtures/mock-durable-context';
import {
  ONBOARDING_ENTITY_TOKEN,
  OnboardingEvent,
  UserOnboardingWorkflow,
} from '../workflows/user-onboarding/onboarding.workflow';
import { OnboardingState, UserEntityService } from '../workflows/user-onboarding/user.entity';

describe('Durable Lambda Adapter — User Onboarding E2E', () => {
  let handler: (event: DurableWorkflowEvent, ctx: MockDurableContext) => Promise<DurableWorkflowResult>;
  let entityService: UserEntityService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        WorkflowModule.register({
          entities: [
            {
              provide: ONBOARDING_ENTITY_TOKEN,
              useValue: new UserEntityService(),
            },
          ],
          workflows: [UserOnboardingWorkflow],
        }),
      ],
    }).compile();

    const app = module.createNestApplication();
    await app.init();

    entityService = module.get<UserEntityService>(ONBOARDING_ENTITY_TOKEN);
    handler = DurableLambdaEventHandler(app, mockWithDurableExecution) as any;
  });

  beforeEach(() => {
    entityService.clear();
  });

  test('should walk REGISTRATION → EMAIL_VERIFICATION → PROFILE_SETUP → COMPLETED via callbacks', async () => {
    const user = await entityService.create();
    await entityService.update(user, OnboardingState.REGISTRATION);

    const ctx = new MockDurableContext();

    const resultPromise = handler({ urn: user.id, initialEvent: OnboardingEvent.REGISTERED }, ctx);

    // Wait for adapter to register callback at EMAIL_VERIFICATION idle state
    const idleKey1 = `idle:${OnboardingState.EMAIL_VERIFICATION}:0`;
    await ctx.waitUntilCallbackRegistered(idleKey1);
    ctx.submitCallback(idleKey1, {
      event: OnboardingEvent.EMAIL_VERIFIED,
      payload: {},
    });

    // Wait for adapter to register callback at PROFILE_SETUP idle state
    const idleKey2 = `idle:${OnboardingState.PROFILE_SETUP}:1`;
    await ctx.waitUntilCallbackRegistered(idleKey2);
    ctx.submitCallback(idleKey2, {
      event: OnboardingEvent.PROFILE_SETUP,
      payload: { profileData: { firstName: 'Test', lastName: 'User' } },
    });

    const result = await resultPromise;

    expect(result.status).toBe('completed');
    expect(result.state).toBe(OnboardingState.COMPLETED);

    const updatedUser = await entityService.load(user.id);
    expect(entityService.status(updatedUser!)).toBe(OnboardingState.COMPLETED);
  });

  test('should handle abandonment at any idle state', async () => {
    const user = await entityService.create();
    await entityService.update(user, OnboardingState.REGISTRATION);

    const ctx = new MockDurableContext();

    const resultPromise = handler({ urn: user.id, initialEvent: OnboardingEvent.REGISTERED }, ctx);

    const idleKey = `idle:${OnboardingState.EMAIL_VERIFICATION}:0`;
    await ctx.waitUntilCallbackRegistered(idleKey);
    ctx.submitCallback(idleKey, {
      event: OnboardingEvent.ABANDONED,
      payload: {},
    });

    const result = await resultPromise;

    expect(result.status).toBe('completed');
    expect(result.state).toBe(OnboardingState.ABANDONED);
  });
});
