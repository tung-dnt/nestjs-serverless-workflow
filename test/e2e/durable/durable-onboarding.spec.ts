import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { Test } from '@nestjs/testing';
import { withDurableExecution } from '@aws/durable-execution-sdk-js';
import { LocalDurableTestRunner, WaitingOperationStatus } from '@aws/durable-execution-sdk-js-testing';
import { WorkflowModule } from '@/core';
import { DurableLambdaEventHandler } from '@/adapter';
import type { DurableWorkflowResult } from '@/adapter';
import {
  ONBOARDING_ENTITY_TOKEN,
  OnboardingEvent,
  UserOnboardingWorkflow,
} from '../workflows/user-onboarding/onboarding.workflow';
import { OnboardingState, UserEntityService } from '../workflows/user-onboarding/user.entity';

describe('Durable Lambda Adapter — User Onboarding E2E', () => {
  let handler: ReturnType<typeof DurableLambdaEventHandler>;
  let entityService: UserEntityService;

  beforeAll(async () => {
    await LocalDurableTestRunner.setupTestEnvironment({ skipTime: true });

    const module = await Test.createTestingModule({
      imports: [
        WorkflowModule.register({
          entities: [{ provide: ONBOARDING_ENTITY_TOKEN, useValue: new UserEntityService() }],
          workflows: [UserOnboardingWorkflow],
        }),
      ],
    }).compile();

    const app = module.createNestApplication();
    await app.init();

    entityService = module.get<UserEntityService>(ONBOARDING_ENTITY_TOKEN);
    handler = DurableLambdaEventHandler(app, withDurableExecution as any);
  });

  afterAll(async () => {
    await LocalDurableTestRunner.teardownTestEnvironment();
  });

  beforeEach(() => {
    entityService.clear();
  });

  test('should walk REGISTRATION → EMAIL_VERIFICATION → PROFILE_SETUP → COMPLETED via callbacks', async () => {
    const user = await entityService.create();
    await entityService.update(user, OnboardingState.REGISTRATION);

    const runner = new LocalDurableTestRunner<DurableWorkflowResult>({ handlerFunction: handler as any });

    // Pre-register callback operation references
    const emailCallback = runner.getOperation(`idle:${OnboardingState.EMAIL_VERIFICATION}:0`);
    const profileCallback = runner.getOperation(`idle:${OnboardingState.PROFILE_SETUP}:1`);

    const executionPromise = runner.run({
      payload: { urn: user.id, initialEvent: OnboardingEvent.REGISTERED },
    });

    // Wait for EMAIL_VERIFICATION idle callback, then submit
    await emailCallback.waitForData(WaitingOperationStatus.SUBMITTED);
    await emailCallback.sendCallbackSuccess(
      JSON.stringify({ event: OnboardingEvent.EMAIL_VERIFIED, payload: {} }),
    );

    // Wait for PROFILE_SETUP idle callback, then submit
    await profileCallback.waitForData(WaitingOperationStatus.SUBMITTED);
    await profileCallback.sendCallbackSuccess(
      JSON.stringify({
        event: OnboardingEvent.PROFILE_SETUP,
        payload: { profileData: { firstName: 'Test', lastName: 'User' } },
      }),
    );

    const execution = await executionPromise;

    expect(execution.getStatus()).toBe('SUCCEEDED');
    expect(execution.getResult()).toEqual({
      urn: user.id,
      status: 'completed',
      state: OnboardingState.COMPLETED,
    });

    const updatedUser = await entityService.load(user.id);
    expect(entityService.status(updatedUser!)).toBe(OnboardingState.COMPLETED);
  });

  test('should handle abandonment at any idle state', async () => {
    const user = await entityService.create();
    await entityService.update(user, OnboardingState.REGISTRATION);

    const runner = new LocalDurableTestRunner<DurableWorkflowResult>({ handlerFunction: handler as any });

    const emailCallback = runner.getOperation(`idle:${OnboardingState.EMAIL_VERIFICATION}:0`);

    const executionPromise = runner.run({
      payload: { urn: user.id, initialEvent: OnboardingEvent.REGISTERED },
    });

    await emailCallback.waitForData(WaitingOperationStatus.SUBMITTED);
    await emailCallback.sendCallbackSuccess(
      JSON.stringify({ event: OnboardingEvent.ABANDONED, payload: {} }),
    );

    const execution = await executionPromise;

    expect(execution.getStatus()).toBe('SUCCEEDED');
    expect(execution.getResult()).toEqual({
      urn: user.id,
      status: 'completed',
      state: OnboardingState.ABANDONED,
    });
  });

  test('should checkpoint transit operations', async () => {
    const user = await entityService.create();
    await entityService.update(user, OnboardingState.REGISTRATION);

    const runner = new LocalDurableTestRunner<DurableWorkflowResult>({ handlerFunction: handler as any });

    const emailCallback = runner.getOperation(`idle:${OnboardingState.EMAIL_VERIFICATION}:0`);
    const profileCallback = runner.getOperation(`idle:${OnboardingState.PROFILE_SETUP}:1`);

    const executionPromise = runner.run({
      payload: { urn: user.id, initialEvent: OnboardingEvent.REGISTERED },
    });

    await emailCallback.waitForData(WaitingOperationStatus.SUBMITTED);
    await emailCallback.sendCallbackSuccess(
      JSON.stringify({ event: OnboardingEvent.EMAIL_VERIFIED, payload: {} }),
    );

    await profileCallback.waitForData(WaitingOperationStatus.SUBMITTED);
    await profileCallback.sendCallbackSuccess(
      JSON.stringify({
        event: OnboardingEvent.PROFILE_SETUP,
        payload: { profileData: { firstName: 'Test', lastName: 'User' } },
      }),
    );

    const execution = await executionPromise;

    // Verify transit steps were checkpointed
    const firstTransit = runner.getOperation(`transit:${OnboardingEvent.REGISTERED}:0:0`);
    const transitData = await firstTransit.waitForData(WaitingOperationStatus.COMPLETED);
    expect(transitData.getStepDetails()?.result).toBeDefined();

    // Should have multiple operations: transit steps + idle callbacks
    expect(execution.getOperations().length).toBeGreaterThanOrEqual(4);
  });
});
