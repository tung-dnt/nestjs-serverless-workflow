# Event Bus

The event bus module provides integration with message brokers for event-driven workflows.

## Installation

```typescript
import { IBrokerPublisher, SqsEmitter } from 'serverless-workflow/event-bus';
```

## Core Concepts

### Workflow Events

Events are the messages that trigger workflow transitions:

```typescript
export interface IWorkflowEvent<T = any> {
  urn: string;        // Unique identifier for the entity
  event: string;      // Event name (e.g., 'order.submit')
  payload?: T;        // Optional event data
}
```

### Broker Publisher

The `IBrokerPublisher` interface defines how events are published:

```typescript
export interface IBrokerPublisher {
  emit<T>(payload: IWorkflowEvent<T>): Promise<void>;
}
```

## SQS Integration

### Setup

1. Install the AWS SDK:

```bash
npm install @aws-sdk/client-sqs
```

2. Create an SQS emitter:

```typescript
import { SqsEmitter } from 'serverless-workflow/event-bus';
import { Injectable } from '@nestjs/common';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

@Injectable()
export class MySqsEmitter extends SqsEmitter {
  private client: SQSClient;
  private queueUrl: string;

  constructor() {
    super();
    this.client = new SQSClient({ region: 'us-east-1' });
    this.queueUrl = process.env.SQS_QUEUE_URL!;
  }

  async emit<T>(payload: IWorkflowEvent<T>): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
  }
}
```

3. Register the broker:

```typescript
import { WorkflowModule } from 'serverless-workflow/workflow';
import { MySqsEmitter } from './sqs.emitter';

@Module({
  imports: [
    WorkflowModule.register({
      entities: [],
      workflows: [],
      brokers: [MySqsEmitter],
    }),
  ],
})
export class AppModule {}
```

## Creating Custom Brokers

Implement the `IBrokerPublisher` interface to create custom brokers:

### Kafka Example

```typescript
import { IBrokerPublisher, IWorkflowEvent } from 'serverless-workflow/event-bus';
import { Injectable } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaEmitter implements IBrokerPublisher {
  private producer: Producer;
  private topic: string;

  constructor() {
    const kafka = new Kafka({
      clientId: 'my-app',
      brokers: ['localhost:9092'],
    });
    this.producer = kafka.producer();
    this.topic = 'workflow-events';
  }

  async onModuleInit() {
    await this.producer.connect();
  }

  async emit<T>(payload: IWorkflowEvent<T>): Promise<void> {
    await this.producer.send({
      topic: this.topic,
      messages: [
        {
          key: payload.urn,
          value: JSON.stringify(payload),
        },
      ],
    });
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }
}
```

### RabbitMQ Example

```typescript
import { IBrokerPublisher, IWorkflowEvent } from 'serverless-workflow/event-bus';
import { Injectable } from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQEmitter implements IBrokerPublisher {
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private exchange: string;

  constructor() {
    this.exchange = 'workflow-events';
  }

  async onModuleInit() {
    this.connection = await amqp.connect('amqp://localhost');
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(this.exchange, 'topic', {
      durable: true,
    });
  }

  async emit<T>(payload: IWorkflowEvent<T>): Promise<void> {
    this.channel.publish(
      this.exchange,
      payload.event,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true }
    );
  }

  async onModuleDestroy() {
    await this.channel.close();
    await this.connection.close();
  }
}
```

## Event Publishing

### From Within Workflows

```typescript
import { Injectable } from '@nestjs/common';
import { IBrokerPublisher, IWorkflowEvent } from 'serverless-workflow/event-bus';

@Injectable()
export class OrderService {
  constructor(private broker: IBrokerPublisher) {}

  async createOrder(orderId: string, data: any) {
    const event: IWorkflowEvent = {
      urn: orderId,
      event: 'order.created',
      payload: data,
    };

    await this.broker.emit(event);
  }
}
```

### From External Systems

External systems can publish events to trigger workflows:

```typescript
// HTTP endpoint to trigger workflow events
@Controller('events')
export class EventsController {
  constructor(private broker: IBrokerPublisher) {}

  @Post('trigger')
  async trigger(@Body() event: IWorkflowEvent) {
    await this.broker.emit(event);
    return { status: 'event published' };
  }
}
```

## Message Format

### Basic Event

```json
{
  "urn": "order-12345",
  "event": "order.submit",
  "payload": {
    "items": ["item1", "item2"],
    "total": 150.00
  }
}
```

### Event Without Payload

```json
{
  "urn": "order-12345",
  "event": "order.cancel"
}
```

## Error Handling

### Failed Message Handling

For SQS, use batch item failures to retry failed messages:

```typescript
export const handler: SQSHandler = async (event, context) => {
  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      const workflowEvent = JSON.parse(record.body);
      await orchestrator.transit(workflowEvent);
    } catch (error) {
      console.error('Failed to process:', error);
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  return { batchItemFailures };
};
```

### Dead Letter Queues

Configure DLQs for messages that fail repeatedly:

```typescript
// SQS Queue Configuration (serverless.yml or AWS Console)
Resources:
  WorkflowQueue:
    Type: AWS::SQS::Queue
    Properties:
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt WorkflowDLQ.Arn
        maxReceiveCount: 3
```

## Best Practices

1. **Use message deduplication**: Prevent duplicate event processing
2. **Set appropriate timeouts**: Ensure messages aren't processed multiple times
3. **Monitor queue depth**: Set up alarms for queue buildup
4. **Use batch processing**: Process multiple events in a single invocation when possible
5. **Implement idempotency**: Design handlers to be safely retried

## Examples

- [SQS Integration Example](../examples/order/mock-broker.service.ts)
- [Lambda Handler with SQS](../examples/usage/lambda.ts)

## Related Documentation

- [Lambda Adapter](./adapters.md) - Use with AWS Lambda
- [Workflow Module](./workflow.md) - Define workflows

