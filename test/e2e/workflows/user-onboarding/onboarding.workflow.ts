import { Inject, Logger } from '@nestjs/common';
import type { IBrokerPublisher } from '@/event-bus';
import { Entity, OnDefault, OnEvent, Payload, Workflow } from '@/core';

import type { User } from './user.entity';
import { UserEntityService, OnboardingState } from './user.entity';

export enum OnboardingEvent {
  REGISTERED = 'user.registered',
  EMAIL_VERIFIED = 'user.email.verified',
  PROFILE_SETUP = 'user.profile.setup',
  COMPLETED = 'user.onboarding.completed',
  ABANDONED = 'user.onboarding.abandoned',
}

export const ONBOARDING_ENTITY_TOKEN = 'entity.user';
export const ONBOARDING_BROKER_TOKEN = 'broker.user';

@Workflow<User, OnboardingEvent, OnboardingState>({
  name: 'UserOnboardingWorkflow',
  states: {
    finals: [OnboardingState.COMPLETED, OnboardingState.ABANDONED],
    idles: [OnboardingState.REGISTRATION, OnboardingState.EMAIL_VERIFICATION, OnboardingState.PROFILE_SETUP],
    failed: OnboardingState.FAILED,
  },
  transitions: [
    {
      event: OnboardingEvent.REGISTERED,
      from: [OnboardingState.REGISTRATION],
      to: OnboardingState.EMAIL_VERIFICATION,
    },
    {
      event: OnboardingEvent.EMAIL_VERIFIED,
      from: [OnboardingState.EMAIL_VERIFICATION],
      to: OnboardingState.PROFILE_SETUP,
    },
    {
      event: OnboardingEvent.PROFILE_SETUP,
      from: [OnboardingState.PROFILE_SETUP],
      to: OnboardingState.COMPLETED,
      conditions: [
        (entity: User, payload?: { profileData: any }) => {
          if (entity.userType === 'business') {
            return payload?.profileData?.companyName !== undefined;
          }
          return payload?.profileData?.firstName !== undefined && payload?.profileData?.lastName !== undefined;
        },
      ],
    },
    {
      event: OnboardingEvent.ABANDONED,
      from: [OnboardingState.REGISTRATION, OnboardingState.EMAIL_VERIFICATION, OnboardingState.PROFILE_SETUP],
      to: OnboardingState.ABANDONED,
    },
  ],
  entityService: ONBOARDING_ENTITY_TOKEN,
  brokerPublisher: ONBOARDING_BROKER_TOKEN,
})
export class UserOnboardingWorkflow {
  private readonly logger = new Logger(UserOnboardingWorkflow.name);

  constructor(
    @Inject(ONBOARDING_BROKER_TOKEN)
    private readonly brokerPublisher: IBrokerPublisher,
  ) {}

  @OnEvent(OnboardingEvent.REGISTERED)
  async handleRegistration(@Entity() user: User, @Payload() payload: any) {
    this.logger.log(`User ${user.id} registered`);
    // Send verification email
    await this.brokerPublisher.emit({
      topic: 'user.email.verification.sent',
      urn: user.id,
      attempt: 0,
      payload: { email: user.email, userId: user.id },
    });
    return { registeredAt: new Date().toISOString() };
  }

  @OnEvent(OnboardingEvent.EMAIL_VERIFIED)
  async handleEmailVerified(@Entity() user: User) {
    this.logger.log(`User ${user.id} email verified`);
    return { emailVerified: true };
  }

  @OnEvent(OnboardingEvent.PROFILE_SETUP)
  async handleProfileSetup(@Entity() user: User, @Payload() payload: any) {
    this.logger.log(`User ${user.id} profile setup`);
    const updatedUser = { ...user, profileData: payload.profileData, profileComplete: true };
    await this.brokerPublisher.emit({
      topic: 'user.onboarding.completed',
      urn: user.id,
      attempt: 0,
      payload: { userId: user.id, userType: user.userType },
    });
    return { profileData: payload.profileData };
  }

  @OnEvent(OnboardingEvent.COMPLETED)
  async handleCompleted(@Entity() user: User) {
    this.logger.log(`User ${user.id} onboarding completed`);
    return { completedAt: new Date().toISOString() };
  }

  @OnEvent(OnboardingEvent.ABANDONED)
  async handleAbandoned(@Entity() user: User) {
    this.logger.log(`User ${user.id} onboarding abandoned`);
    return { abandonedAt: new Date().toISOString() };
  }

  @OnDefault
  async fallback(entity: User, event: string, payload?: any) {
    this.logger.warn(`Fallback called for user ${entity.id} on event ${event}`);
    return entity;
  }
}
