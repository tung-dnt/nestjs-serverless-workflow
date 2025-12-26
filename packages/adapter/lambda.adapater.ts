import { type IWorkflowEvent } from '@/event-bus';
import { OrchestratorService } from '@/core';
import { type INestApplicationContext } from '@nestjs/common';
import { type SQSHandler } from 'aws-lambda';

// NOTDE:
// - ReportBatchItemFailures must be enabled on SQS event source mapping
// - Lambda must have sufficient timeout to process messages
// - maxReceiveCount should be set as high as possible in main queue
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
