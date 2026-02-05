import { type IWorkflowEvent } from '@/event-bus';
import { OrchestratorService, type IStepExecutionResult } from '@/core';
import { type INestApplicationContext } from '@nestjs/common';
import { type SQSHandler, type Handler } from 'aws-lambda';

// NOTE:
// - ReportBatchItemFailures must be enabled on SQS event source mapping
// - Lambda must have sufficient timeout to process messages
// - maxReceiveCount should be set as high as possible in main queue

/**
 * Creates an SQS Lambda handler that processes workflow events with automatic transitions.
 * This handler uses the full workflow orchestration with the internal state machine loop.
 *
 * Use this when you want the library to manage state transitions internally.
 * For AWS Step Functions integration, use `LambdaStepHandler` instead.
 */
export const LambdaEventHandler =
  (app: INestApplicationContext): SQSHandler =>
  async (event, context) => {
    // Calculate safety window (5 seconds before timeout)
    const safetyWindowMs = context.getRemainingTimeInMillis() - 5000;
    const workflowRouter = app.get(OrchestratorService);
    // For timeout retry only
    const batchItemFailures: Array<{ itemIdentifier: string }> = [];

    // Track processed records
    const processedRecords = new Set<string>();

    // Create a promise that will resolve when we need to shut down
    let shutdownResolver: () => void;
    const shutdownPromise = new Promise<void>((resolve) => {
      shutdownResolver = resolve;
    });

    // Set timeout for graceful shutdown
    const shutdownTimer = setTimeout(() => {
      console.log(`Triggering graceful shutdown after ${safetyWindowMs}ms`);
      shutdownResolver();
    }, safetyWindowMs);

    try {
      const processingPromises = event.Records.map(async (record, i) => {
        try {
          const event: IWorkflowEvent = JSON.parse(record.body);
          console.log('processing record ', i + 1);
          console.log(event);

          // Race between processing and shutdown
          await Promise.race([
            workflowRouter.transit(event),
            shutdownPromise.then(() => {
              console.log('Shutdown promise...');
              // If we're shutting down and this promise hasn't completed,
              // mark it as a failure so SQS can retry it
              if (!processedRecords.has(record.messageId)) {
                batchItemFailures.push({ itemIdentifier: record.messageId });
                console.log(`Marked message ${record.messageId} for retry due to shutdown`);
              }
            }),
          ]);

          // Mark record as successfully processed
          processedRecords.add(record.messageId);
        } catch (error) {
          console.error(`Error processing message ${record.messageId}:`, error);
          batchItemFailures.push({ itemIdentifier: record.messageId });
        }
      });

      // Wait for all processing to finish, or for shutdown
      await Promise.race([Promise.all(processingPromises), shutdownPromise]);
    } finally {
      // Clean up timeout
      clearTimeout(shutdownTimer);
    }

    console.log(`Completed processing. Failed items: ${batchItemFailures.length}`);
    return {
      batchItemFailures,
    };
  };

/**
 * Input type for Step Function Lambda handlers.
 * This can come from Step Functions invoke or direct Lambda invocation.
 */
export interface IStepFunctionInput {
  /** The workflow event name (e.g., 'order.created') */
  topic: string;
  /** Entity identifier (URN) */
  urn: string | number;
  /** Event payload data */
  payload?: any;
  /** Retry attempt number */
  attempt?: number;
}

/**
 * Creates a Lambda handler for a single workflow step.
 * Designed for use with AWS Step Functions where the state machine is managed externally.
 *
 * This handler executes only the specified event handler and returns the result,
 * allowing Step Functions to orchestrate the workflow transitions.
 *
 * @param app - The NestJS application context
 * @returns A Lambda handler that processes a single workflow step
 *
 * @example
 * ```typescript
 * // In your Lambda entry point
 * const app = await NestFactory.createApplicationContext(AppModule);
 * export const handler = LambdaStepHandler(app);
 *
 * // Step Functions state machine definition (AWS CDK or SAM)
 * {
 *   "StartAt": "CreateOrder",
 *   "States": {
 *     "CreateOrder": {
 *       "Type": "Task",
 *       "Resource": "arn:aws:lambda:...:order-handler",
 *       "Parameters": {
 *         "topic": "order.created",
 *         "urn.$": "$.orderId",
 *         "payload.$": "$"
 *       },
 *       "Next": "ProcessOrder"
 *     },
 *     "ProcessOrder": {
 *       "Type": "Task",
 *       "Resource": "arn:aws:lambda:...:order-handler",
 *       "Parameters": {
 *         "topic": "order.processing",
 *         "urn.$": "$.entity.id",
 *         "payload.$": "$.handlerResult"
 *       },
 *       "End": true
 *     }
 *   }
 * }
 * ```
 */
export const LambdaStepHandler = (
  app: INestApplicationContext,
): Handler<IStepFunctionInput, IStepExecutionResult> => {
  return async (event) => {
    const orchestrator = app.get(OrchestratorService);

    const workflowEvent: IWorkflowEvent = {
      topic: event.topic,
      urn: event.urn,
      payload: event.payload,
      attempt: event.attempt ?? 0,
    };

    console.log(`Executing step for event: ${event.topic}, urn: ${event.urn}`);
    const result = await orchestrator.executeStep(workflowEvent);
    console.log(`Step completed. Status: ${result.status}, isFinal: ${result.isFinal}`);

    return result;
  };
};

/**
 * Creates a map of Lambda handlers for each registered workflow event.
 * This allows you to deploy separate Lambda functions for each event type,
 * which can be useful for fine-grained AWS Step Functions orchestration.
 *
 * @param app - The NestJS application context
 * @returns A map of event names to their respective Lambda handlers
 *
 * @example
 * ```typescript
 * const app = await NestFactory.createApplicationContext(AppModule);
 * const handlers = createLambdaStepHandlers(app);
 *
 * // Export individual handlers
 * export const orderCreated = handlers.get('order.created');
 * export const orderProcessing = handlers.get('order.processing');
 * export const orderShipped = handlers.get('order.shipped');
 * ```
 */
export const createLambdaStepHandlers = (
  app: INestApplicationContext,
): Map<string, Handler<Omit<IStepFunctionInput, 'topic'>, IStepExecutionResult>> => {
  const orchestrator = app.get(OrchestratorService);
  const events = orchestrator.getRegisteredEvents();
  const handlers = new Map<string, Handler<Omit<IStepFunctionInput, 'topic'>, IStepExecutionResult>>();

  for (const eventName of events) {
    handlers.set(eventName, async (event) => {
      const workflowEvent: IWorkflowEvent = {
        topic: eventName,
        urn: event.urn,
        payload: event.payload,
        attempt: event.attempt ?? 0,
      };

      console.log(`Executing step for event: ${eventName}, urn: ${event.urn}`);
      const result = await orchestrator.executeStep(workflowEvent);
      console.log(`Step completed. Status: ${result.status}, isFinal: ${result.isFinal}`);

      return result;
    });
  }

  return handlers;
};
