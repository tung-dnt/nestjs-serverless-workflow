import { Injectable } from '@nestjs/common';
import type { IWorkflowEntity } from '@/core';

export enum OnboardingState {
  REGISTRATION = 'registration',
  EMAIL_VERIFICATION = 'email_verification',
  PROFILE_SETUP = 'profile_setup',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
  FAILED = 'failed',
}

export interface User {
  id: string;
  status: OnboardingState;
  email: string;
  emailVerified: boolean;
  profileComplete: boolean;
  userType?: 'individual' | 'business';
  profileData?: {
    firstName?: string;
    lastName?: string;
    companyName?: string;
  };
  registeredAt?: string;
  completedAt?: string;
}

/**
 * In-memory entity service for testing
 */
@Injectable()
export class UserEntityService implements IWorkflowEntity<User, OnboardingState> {
  private users = new Map<string, User>();

  async create(): Promise<User> {
    const user: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: OnboardingState.REGISTRATION,
      email: `user${Date.now()}@example.com`,
      emailVerified: false,
      profileComplete: false,
      registeredAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async load(urn: string | number): Promise<User | null> {
    return this.users.get(String(urn)) || null;
  }

  async update(user: User, status: OnboardingState): Promise<User> {
    const updated = { ...user, status };
    this.users.set(user.id, updated);
    return updated;
  }

  status(user: User): OnboardingState {
    return user.status;
  }

  urn(user: User): string | number {
    return user.id;
  }

  // Test helpers
  clear(): void {
    this.users.clear();
  }

  getAll(): User[] {
    return Array.from(this.users.values());
  }
}
