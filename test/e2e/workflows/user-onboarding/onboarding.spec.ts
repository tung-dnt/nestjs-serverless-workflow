import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { WorkflowModule } from '@/core/workflow.module';
import { OrchestratorService } from '@/core/providers/orchestrator.service';
import { assertEntityState, createWorkflowEvent } from '../../fixtures/test-helpers';
import { UserOnboardingWorkflow, OnboardingEvent, ONBOARDING_ENTITY_TOKEN } from './onboarding.workflow';
import { UserEntityService, OnboardingState } from './user.entity';

describe('User Onboarding Workflow E2E', () => {
  let module: TestingModule;
  let orchestrator: OrchestratorService;
  let entityService: UserEntityService;

  beforeEach(async () => {
    entityService = new UserEntityService();

    module = await Test.createTestingModule({
      imports: [
        WorkflowModule.register({
          entities: [{ provide: ONBOARDING_ENTITY_TOKEN, useValue: entityService }],
          workflows: [UserOnboardingWorkflow],
        }),
      ],
    }).compile();

    await module.init();
    orchestrator = module.get(OrchestratorService);
  });

  afterEach(async () => {
    entityService.clear();
    await module.close();
  });

  describe('Happy Path - Complete Onboarding', () => {
    test('should complete full onboarding flow: REGISTRATION → EMAIL_VERIFICATION → PROFILE_SETUP → COMPLETED', async () => {
      // Create user
      const user = await entityService.create();
      await entityService.update(user, OnboardingState.REGISTRATION);

      // Step 1: Registration
      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.REGISTERED, user.id));
      let updatedUser = await entityService.load(user.id);
      expect(updatedUser).toBeDefined();
      assertEntityState(updatedUser!, entityService, OnboardingState.EMAIL_VERIFICATION);

      // Step 2: Email verification
      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.EMAIL_VERIFIED, user.id));
      updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.PROFILE_SETUP);

      // Step 3: Profile setup (individual)
      updatedUser!.userType = 'individual';
      await entityService.update(updatedUser!, OnboardingState.PROFILE_SETUP);
      await orchestrator.transit(
        createWorkflowEvent(OnboardingEvent.PROFILE_SETUP, user.id, {
          profileData: { firstName: 'John', lastName: 'Doe' },
        }),
      );
      updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.COMPLETED);
    });

    test('should complete onboarding for business user', async () => {
      const user = await entityService.create();
      user.userType = 'business';
      await entityService.update(user, OnboardingState.PROFILE_SETUP);

      await orchestrator.transit(
        createWorkflowEvent(OnboardingEvent.PROFILE_SETUP, user.id, {
          profileData: { companyName: 'Acme Corp' },
        }),
      );

      const updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.COMPLETED);
    });
  });

  describe('Conditional Profile Setup', () => {
    test('should require firstName and lastName for individual users', async () => {
      const user = await entityService.create();
      user.userType = 'individual';
      await entityService.update(user, OnboardingState.PROFILE_SETUP);

      // Try with incomplete data
      await orchestrator.transit(
        createWorkflowEvent(OnboardingEvent.PROFILE_SETUP, user.id, {
          profileData: { firstName: 'John' }, // Missing lastName
        }),
      );

      // Should still be in PROFILE_SETUP (condition not met)
      let updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.PROFILE_SETUP);

      // Now with complete data
      await orchestrator.transit(
        createWorkflowEvent(OnboardingEvent.PROFILE_SETUP, user.id, {
          profileData: { firstName: 'John', lastName: 'Doe' },
        }),
      );

      updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.COMPLETED);
    });

    test('should require companyName for business users', async () => {
      const user = await entityService.create();
      user.userType = 'business';
      await entityService.update(user, OnboardingState.PROFILE_SETUP);

      // Try with incomplete data
      await orchestrator.transit(
        createWorkflowEvent(OnboardingEvent.PROFILE_SETUP, user.id, {
          profileData: { firstName: 'John', lastName: 'Doe' }, // Missing companyName
        }),
      );

      // Should still be in PROFILE_SETUP
      let updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.PROFILE_SETUP);

      // Now with companyName
      await orchestrator.transit(
        createWorkflowEvent(OnboardingEvent.PROFILE_SETUP, user.id, {
          profileData: { companyName: 'Acme Corp' },
        }),
      );

      updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.COMPLETED);
    });
  });

  describe('Automatic Transitions', () => {
    test('should automatically transition from EMAIL_VERIFICATION to PROFILE_SETUP', async () => {
      const user = await entityService.create();
      await entityService.update(user, OnboardingState.EMAIL_VERIFICATION);

      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.EMAIL_VERIFIED, user.id));

      const updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.PROFILE_SETUP);
    });
  });

  describe('Abandonment Flow', () => {
    test('should handle abandonment from REGISTRATION', async () => {
      const user = await entityService.create();
      await entityService.update(user, OnboardingState.REGISTRATION);

      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.ABANDONED, user.id));

      const updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.ABANDONED);
    });

    test('should handle abandonment from EMAIL_VERIFICATION', async () => {
      const user = await entityService.create();
      await entityService.update(user, OnboardingState.EMAIL_VERIFICATION);

      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.ABANDONED, user.id));

      const updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.ABANDONED);
    });

    test('should handle abandonment from PROFILE_SETUP', async () => {
      const user = await entityService.create();
      await entityService.update(user, OnboardingState.PROFILE_SETUP);

      await orchestrator.transit(createWorkflowEvent(OnboardingEvent.ABANDONED, user.id));

      const updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.ABANDONED);
    });
  });

  describe('Idle State Behavior', () => {
    test('should wait in PROFILE_SETUP when condition not met', async () => {
      const user = await entityService.create();
      user.userType = 'individual';
      await entityService.update(user, OnboardingState.PROFILE_SETUP);

      // Try with incomplete profile
      await orchestrator.transit(
        createWorkflowEvent(OnboardingEvent.PROFILE_SETUP, user.id, {
          profileData: { firstName: 'John' },
        }),
      );

      // Should still be in PROFILE_SETUP (idle, condition not met)
      const updatedUser = await entityService.load(user.id);
      assertEntityState(updatedUser!, entityService, OnboardingState.PROFILE_SETUP);
    });
  });

  describe('Error Handling', () => {
    test('should throw error for invalid transition', async () => {
      const user = await entityService.create();
      await entityService.update(user, OnboardingState.COMPLETED);

      // Try to transition from final state
      await expect(orchestrator.transit(createWorkflowEvent(OnboardingEvent.REGISTERED, user.id))).rejects.toThrow();
    });

    test('should throw error when entity not found', async () => {
      await expect(
        orchestrator.transit(createWorkflowEvent(OnboardingEvent.REGISTERED, 'non-existent-user')),
      ).rejects.toThrow();
    });
  });
});
