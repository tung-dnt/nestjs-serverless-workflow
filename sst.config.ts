/// <reference path="./.sst/platform/config.d.ts" />

const REGION = 'us-east-1';

export default $config({
  app(input) {
    return {
      name: 'nestjs-serverless-workflow',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: ['production'].includes(input?.stage),
      home: 'aws',
      providers: {
        aws: {
          version: '6.66.2',
          region: REGION,
        },
      },
    };
  },
  async run() {
    const functionTimeout = '15 minutes' as const;
    const orderQueue = new sst.aws.Queue('orderQueue', {
      fifo: {
        contentBasedDeduplication: true,
      },
      visibilityTimeout: functionTimeout,
    });
    const orderWorkflow = new sst.aws.Function('orderworkflow', {
      runtime: 'nodejs20.x',
      // layers: [vars.oracle_client_layer],
      environment: {
        BROKER_URL: orderQueue.url,
      },
      nodejs: {
        sourcemap: true,
        install: ['class-validator', 'class-transformer', '@nestjs/websockets', '@nestjs/microservices'],
      },
      versioning: true,
      logging: {
        retention: '3 months',
      },
      handler: 'src/main.handler',
      memory: '512 MB',
      timeout: functionTimeout,
      // concurrency: {
      //   reserved: 50,
      // },
      permissions: [{ effect: 'allow', actions: ['sqs:*'], resources: [orderQueue.arn] }],
    });
    orderQueue.subscribe(orderWorkflow.arn);
  },
});
