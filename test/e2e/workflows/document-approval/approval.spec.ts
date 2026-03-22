import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { WorkflowModule } from '@/core/workflow.module';
import { OrchestratorService } from '@/core/providers/orchestrator.service';
import { assertEntityState, createWorkflowEvent } from '../../fixtures/test-helpers';
import { DocumentApprovalWorkflow, ApprovalEvent, APPROVAL_ENTITY_TOKEN } from './approval.workflow';
import { DocumentEntityService, DocumentState } from './document.entity';

describe('Document Approval Workflow E2E', () => {
  let module: TestingModule;
  let orchestrator: OrchestratorService;
  let entityService: DocumentEntityService;

  beforeEach(async () => {
    entityService = new DocumentEntityService();

    module = await Test.createTestingModule({
      imports: [
        WorkflowModule.register({
          entities: [{ provide: APPROVAL_ENTITY_TOKEN, useValue: entityService }],
          workflows: [DocumentApprovalWorkflow],
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

  describe('Happy Path - Approval Flow', () => {
    test('should approve document: DRAFT → PENDING_REVIEW → APPROVED', async () => {
      const document = await entityService.create();
      document.title = 'Test Document';
      document.content = 'Content';
      document.documentType = 'policy';
      document.approvers = ['approver1'];
      await entityService.update(document, DocumentState.DRAFT);

      // Submit for review
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.SUBMITTED, document.id));
      let updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.PENDING_REVIEW);

      // Approve (single approval for policy)
      updatedDocument!.approvals = [{ approverId: 'approver1', approved: true, timestamp: new Date().toISOString() }];
      await entityService.update(updatedDocument!, DocumentState.PENDING_REVIEW);
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.APPROVED, document.id, { approverId: 'approver1' }));

      updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.APPROVED);
    });
  });

  describe('Rejection Flow', () => {
    test('should reject document: DRAFT → PENDING_REVIEW → REJECTED', async () => {
      const document = await entityService.create();
      document.title = 'Test Document';
      document.documentType = 'policy';
      await entityService.update(document, DocumentState.DRAFT);

      // Submit for review
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.SUBMITTED, document.id));
      let updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.PENDING_REVIEW);

      // Reject
      await orchestrator.transit(
        createWorkflowEvent(ApprovalEvent.REJECTED, document.id, {
          approverId: 'approver1',
          reason: 'Insufficient details',
        }),
      );

      updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.REJECTED);
    });
  });

  describe('Revision Cycle', () => {
    test('should handle revision cycle: PENDING_REVIEW → REVISION_REQUESTED → DRAFT → PENDING_REVIEW', async () => {
      const document = await entityService.create();
      document.title = 'Test Document';
      document.documentType = 'policy';
      document.approvers = ['approver1'];
      await entityService.update(document, DocumentState.DRAFT);

      // Submit for review
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.SUBMITTED, document.id));
      let updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.PENDING_REVIEW);

      // Request revision
      await orchestrator.transit(
        createWorkflowEvent(ApprovalEvent.REVISION_REQUESTED, document.id, {
          notes: 'Please add more details',
        }),
      );
      updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.REVISION_REQUESTED);

      // Revise (loop back to DRAFT)
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.REVISED, document.id));
      updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.DRAFT);
      expect(updatedDocument!.revisionCount).toBeGreaterThan(0);

      // Submit again
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.SUBMITTED, document.id));
      updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.PENDING_REVIEW);
    });
  });

  describe('Multi-Approver Scenarios', () => {
    test('should require all approvers for contract documents', async () => {
      const document = await entityService.create();
      document.title = 'Contract';
      document.documentType = 'contract';
      document.approvers = ['approver1', 'approver2'];
      await entityService.update(document, DocumentState.DRAFT);

      // Submit for review
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.SUBMITTED, document.id));
      let updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.PENDING_REVIEW);

      // First approval (should not complete)
      updatedDocument!.approvals = [{ approverId: 'approver1', approved: true, timestamp: new Date().toISOString() }];
      await entityService.update(updatedDocument!, DocumentState.PENDING_REVIEW);
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.APPROVED, document.id, { approverId: 'approver1' }));

      // Should still be in PENDING_REVIEW (condition not met - need all approvers)
      updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.PENDING_REVIEW);

      // Second approval (should complete)
      updatedDocument!.approvals = [
        { approverId: 'approver1', approved: true, timestamp: new Date().toISOString() },
        { approverId: 'approver2', approved: true, timestamp: new Date().toISOString() },
      ];
      await entityService.update(updatedDocument!, DocumentState.PENDING_REVIEW);
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.APPROVED, document.id, { approverId: 'approver2' }));

      updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.APPROVED);
    });

    test('should require only one approver for non-contract documents', async () => {
      const document = await entityService.create();
      document.title = 'Policy';
      document.documentType = 'policy';
      document.approvers = ['approver1', 'approver2'];
      await entityService.update(document, DocumentState.DRAFT);

      // Submit for review
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.SUBMITTED, document.id));
      let updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.PENDING_REVIEW);

      // Single approval should be enough for policy
      updatedDocument!.approvals = [{ approverId: 'approver1', approved: true, timestamp: new Date().toISOString() }];
      await entityService.update(updatedDocument!, DocumentState.PENDING_REVIEW);
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.APPROVED, document.id, { approverId: 'approver1' }));

      updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.APPROVED);
    });
  });

  describe('Conditional Transitions', () => {
    test('should wait in PENDING_REVIEW until approval condition is met', async () => {
      const document = await entityService.create();
      document.documentType = 'contract';
      document.approvers = ['approver1', 'approver2'];
      await entityService.update(document, DocumentState.PENDING_REVIEW);

      // Try to approve with only one approver (condition not met)
      document.approvals = [{ approverId: 'approver1', approved: true, timestamp: new Date().toISOString() }];
      await entityService.update(document, DocumentState.PENDING_REVIEW);
      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.APPROVED, document.id, { approverId: 'approver1' }));

      // Should still be in PENDING_REVIEW
      const updatedDocument = await entityService.load(document.id);
      assertEntityState(updatedDocument!, entityService, DocumentState.PENDING_REVIEW);
    });
  });

  describe('State Persistence', () => {
    test('should maintain document state across revisions', async () => {
      const document = await entityService.create();
      document.title = 'Test Document';
      document.revisionCount = 0;
      await entityService.update(document, DocumentState.REVISION_REQUESTED);

      await orchestrator.transit(createWorkflowEvent(ApprovalEvent.REVISED, document.id));

      const updatedDocument = await entityService.load(document.id);
      expect(updatedDocument!.revisionCount).toBe(1);
      expect(updatedDocument!.approvals).toHaveLength(0); // Approvals reset on revision
    });
  });
});
