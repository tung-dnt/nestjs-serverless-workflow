import { WorkflowEvent } from '@/event-bus/types/workflow-event.interface';
import { INestApplicationContext } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SQSHandler } from 'aws-lambda';

export const LambdaEventHandler =
  (app: INestApplicationContext): SQSHandler =>
  async (event, context) => {
    const safetyWindowMs = context.getRemainingTimeInMillis() - 5000;
    const executionStartTime = Date.now();
    const eventEmitter = app.get(EventEmitter2);
    const batchItemFailures: Array<{ itemIdentifier: string }> = [];

    // Track processing state for each record
    const recordsToProcess = event.Records.map((record) => ({
      record,
      processed: false,
    }));

    // Create a timeout promise
    const timeoutPromise = new Promise<void>((resolve) => {
      const checkTimeInterval = setInterval(() => {
        const elapsedTime = Date.now() - executionStartTime;

        if (elapsedTime >= safetyWindowMs) {
          clearInterval(checkTimeInterval);
          console.log(`Approaching timeout after ${elapsedTime}ms. Initiating graceful shutdown.`);
          resolve();
        }
      }, 100); // Check every 100ms
    });

    // Process records with timeout awareness
    const processingPromise = (async () => {
      for (const item of recordsToProcess) {
        // Check if we're running out of time before processing each record
        if (Date.now() - executionStartTime >= safetyWindowMs) {
          console.log('Safety window reached, stopping further processing');
          break;
        }

        try {
          const payload: WorkflowEvent = JSON.parse(item.record.body);
          await eventEmitter.emitAsync(payload.topic, {
            urn: payload.urn,
            payload: payload.payload,
          });
          item.processed = true;
        } catch (error) {
          console.error(`Error processing message ${item.record.messageId}:`, error);
          batchItemFailures.push({ itemIdentifier: item.record.messageId });
          item.processed = true; // Mark as processed even though it failed
        }
      }
    })();

    // Wait for either all records to be processed or the timeout to occur
    await Promise.race([processingPromise, timeoutPromise]);

    // Add any unprocessed messages to the batch failures
    recordsToProcess.forEach((item) => {
      if (!item.processed) {
        console.log(`Message ${item.record.messageId} was not processed due to timeout`);
        batchItemFailures.push({ itemIdentifier: item.record.messageId });
      }
    });

    console.log(
      `Processed ${recordsToProcess.filter((item) => item.processed).length}/${recordsToProcess.length} messages`,
    );
    console.log(`Returning ${batchItemFailures.length} batch failures`);

    return {
      batchItemFailures,
    };
  };
