import type { IBrokerPublisher, IWorkflowEvent } from '@/event-bus';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Minimal mock broker publisher that logs emitted workflow events.
 */
@Injectable()
export class MockBrokerPublisher implements IBrokerPublisher {
  private readonly logger = new Logger(MockBrokerPublisher.name);

  async emit<T>(payload: IWorkflowEvent<T>): Promise<void> {
    const { topic, urn, payload: payloadData } = payload;
    this.logger.log(`MockBrokerPublisher emit -> topic: ${topic} key: ${urn} payload: ${JSON.stringify(payloadData)}`);
    // In real implementation, push to Kafka/SQS/etc.
  }
  async retry<T>(payload: IWorkflowEvent<T>) {
    const { topic, urn, payload: payloadData } = payload;
    this.logger.log(`MockBrokerPublisher RETRY -> topic: ${topic} key: ${urn} payload: ${JSON.stringify(payloadData)}`);
    // In real implementation, push to Kafka/SQS/etc.
  }
}
