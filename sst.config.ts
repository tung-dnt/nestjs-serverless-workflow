/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'nestjs-serverless-workflow',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: ['production'].includes(input?.stage),
      home: 'aws',
    };
  },
  async run() {
    new sst.aws.Function('orderworkflow', {
      runtime: 'nodejs22.x',
      handler: 'src/handler.ts',
      memory: '256 MB',
      timeout: '2 minutes',
    });
  },
});
