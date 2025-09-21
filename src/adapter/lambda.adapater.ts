import { WorkflowEvent } from '@/event-bus/types/workflow-event.interface';
import { INestApplicationContext } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SQSHandler } from 'aws-lambda';

export const LambdaEventHandler =
  (app: INestApplicationContext): SQSHandler =>
  async (event, context) => {
    // Calculate safety window (5 seconds before timeout)
    const safetyWindowMs = context.getRemainingTimeInMillis() - 5000;
    const eventEmitter = app.get(EventEmitter2);
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
      const processingPromises = event.Records.map(async (record) => {
        try {
          const payload: WorkflowEvent = JSON.parse(record.body);

          // Race between processing and shutdown
          await Promise.race([
            eventEmitter.emitAsync(payload.topic, {
              urn: payload.urn,
              payload: payload.payload,
            }),
            shutdownPromise.then(() => {
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
