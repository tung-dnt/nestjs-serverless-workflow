import { Inject, Logger } from '@nestjs/common';
import type { IBrokerPublisher } from '@/event-bus';
import { Entity, OnDefault, OnEvent, Payload, Workflow } from '@/core';

import type { Document } from './document.entity';
import { DocumentEntityService, DocumentState } from './document.entity';

export enum ApprovalEvent {
  SUBMITTED = 'document.submitted',
  REVIEWED = 'document.reviewed',
  APPROVED = 'document.approved',
  REJECTED = 'document.rejected',
  REVISION_REQUESTED = 'document.revision.requested',
  REVISED = 'document.revised',
}

export const APPROVAL_ENTITY_TOKEN = 'entity.document';
export const APPROVAL_BROKER_TOKEN = 'broker.document';

@Workflow<Document, ApprovalEvent, DocumentState>({
  name: 'DocumentApprovalWorkflow',
  states: {
    finals: [DocumentState.APPROVED, DocumentState.REJECTED],
    idles: [DocumentState.DRAFT, DocumentState.PENDING_REVIEW, DocumentState.REVISION_REQUESTED],
    failed: DocumentState.FAILED,
  },
  transitions: [
    {
      event: ApprovalEvent.SUBMITTED,
      from: [DocumentState.DRAFT],
      to: DocumentState.PENDING_REVIEW,
    },
    {
      event: ApprovalEvent.APPROVED,
      from: [DocumentState.PENDING_REVIEW],
      to: DocumentState.APPROVED,
      conditions: [
        (entity: Document, payload?: { approverId: string }) => {
          // For contracts, need all approvers
          if (entity.documentType === 'contract') {
            return entity.approvals.length === entity.approvers.length;
          }
          // For other types, single approval is enough
          return entity.approvals.length >= 1;
        },
      ],
    },
    {
      event: ApprovalEvent.REJECTED,
      from: [DocumentState.PENDING_REVIEW],
      to: DocumentState.REJECTED,
    },
    {
      event: ApprovalEvent.REVISION_REQUESTED,
      from: [DocumentState.PENDING_REVIEW],
      to: DocumentState.REVISION_REQUESTED,
    },
    {
      event: ApprovalEvent.REVISED,
      from: [DocumentState.REVISION_REQUESTED],
      to: DocumentState.DRAFT,
    },
  ],
  entityService: APPROVAL_ENTITY_TOKEN,
  brokerPublisher: APPROVAL_BROKER_TOKEN,
})
export class DocumentApprovalWorkflow {
  private readonly logger = new Logger(DocumentApprovalWorkflow.name);

  constructor(
    @Inject(APPROVAL_BROKER_TOKEN)
    private readonly brokerPublisher: IBrokerPublisher,
  ) {}

  @OnEvent(ApprovalEvent.SUBMITTED)
  async handleSubmitted(@Entity() document: Document) {
    this.logger.log(`Document ${document.id} submitted for review`);
    await this.brokerPublisher.emit({
      topic: 'document.review.requested',
      urn: document.id,
      attempt: 0,
      payload: { documentId: document.id, approvers: document.approvers },
    });
    return { submittedAt: new Date().toISOString() };
  }

  @OnEvent(ApprovalEvent.APPROVED)
  async handleApproved(@Entity() document: Document, @Payload() payload: any) {
    this.logger.log(`Document ${document.id} approved by ${payload?.approverId}`);
    const updatedApprovals = [
      ...document.approvals,
      { approverId: payload.approverId, approved: true, timestamp: new Date().toISOString() },
    ];
    return { approvals: updatedApprovals };
  }

  @OnEvent(ApprovalEvent.REJECTED)
  async handleRejected(@Entity() document: Document, @Payload() payload: any) {
    this.logger.log(`Document ${document.id} rejected by ${payload?.approverId}`);
    await this.brokerPublisher.emit({
      topic: 'document.rejected',
      urn: document.id,
      attempt: 0,
      payload: { documentId: document.id, reason: payload?.reason },
    });
    return { rejectedAt: new Date().toISOString() };
  }

  @OnEvent(ApprovalEvent.REVISION_REQUESTED)
  async handleRevisionRequested(@Entity() document: Document, @Payload() payload: any) {
    this.logger.log(`Document ${document.id} revision requested`);
    return { revisionRequestedAt: new Date().toISOString(), revisionNotes: payload?.notes };
  }

  @OnEvent(ApprovalEvent.REVISED)
  async handleRevised(@Entity() document: Document) {
    this.logger.log(`Document ${document.id} revised`);
    // Reset approvals for new revision
    return {
      revisionCount: document.revisionCount + 1,
      approvals: [],
    };
  }

  @OnDefault
  async fallback(entity: Document, event: string, payload?: any) {
    this.logger.warn(`Fallback called for document ${entity.id} on event ${event}`);
    return entity;
  }
}
