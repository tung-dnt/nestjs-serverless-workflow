import { Injectable } from '@nestjs/common';
import type { IWorkflowEntity } from '@/core';

export enum DocumentState {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REVISION_REQUESTED = 'revision_requested',
  FAILED = 'failed',
}

export interface Document {
  id: string;
  status: DocumentState;
  title: string;
  content: string;
  documentType: 'contract' | 'policy' | 'report';
  approvers: string[];
  approvals: Array<{ approverId: string; approved: boolean; timestamp: string }>;
  revisionCount: number;
  createdAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
}

/**
 * In-memory entity service for testing
 */
@Injectable()
export class DocumentEntityService implements IWorkflowEntity<Document, DocumentState> {
  private documents = new Map<string, Document>();

  async create(): Promise<Document> {
    const document: Document = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: DocumentState.DRAFT,
      title: '',
      content: '',
      documentType: 'contract',
      approvers: [],
      approvals: [],
      revisionCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.documents.set(document.id, document);
    return document;
  }

  async load(urn: string | number): Promise<Document | null> {
    return this.documents.get(String(urn)) || null;
  }

  async update(document: Document, status: DocumentState): Promise<Document> {
    const updated = { ...document, status };
    this.documents.set(document.id, updated);
    return updated;
  }

  status(document: Document): DocumentState {
    return document.status;
  }

  urn(document: Document): string | number {
    return document.id;
  }

  // Test helpers
  clear(): void {
    this.documents.clear();
  }

  getAll(): Document[] {
    return Array.from(this.documents.values());
  }
}
