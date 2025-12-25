# Quick Start Guide

## 🚀 Package is Ready!

Your NestJS serverless workflow has been successfully restructured as a publishable npm package with tree-shakable exports.

## Package Name
`serverless-workflow`

## Subpath Exports

The package provides four modular exports:

```typescript
import { WorkflowModule } from 'serverless-workflow/workflow';
import { IBrokerPublisher, SqsEmitter } from 'serverless-workflow/event-bus';
import { LambdaEventHandler } from 'serverless-workflow/adapter';
import { UnretriableException } from 'serverless-workflow/exception';
```

## What Changed

### ✅ Completed
- [x] Package configuration updated with exports and peer dependencies
- [x] Created index.ts files for all modules
- [x] Moved application entry points to examples/usage/
- [x] Set up comprehensive test structure
- [x] Updated build configuration for library compilation
- [x] Added TypeScript subpath type resolution
- [x] Created detailed documentation for all modules
- [x] Added LICENSE, CHANGELOG, CONTRIBUTING files
- [x] Created publishing guide and checklist

### 📁 New Structure
```
serverless-workflow/
├── src/                       # Source code (not published)
│   ├── workflow/             # Core workflow engine
│   ├── event-bus/            # Event publishing
│   ├── adapter/              # Runtime adapters
│   └── exception/            # Custom exceptions
├── tests/                     # Test files (not published)
│   ├── workflow/
│   ├── event-bus/
│   ├── adapter/
│   ├── exception/
│   └── integration/
├── examples/                  # Examples (published for reference)
│   ├── order/                # Order processing example
│   ├── dynamodb/             # DynamoDB integration
│   └── usage/                # Entry point examples
├── docs/                      # Documentation (published)
│   ├── getting-started.md
│   ├── workflow.md
│   ├── event-bus.md
│   └── adapters.md
└── dist/                      # Built files (published)
    ├── workflow/
    ├── event-bus/
    ├── adapter/
    └── exception/
```

## Next Steps

### 1. Build the Package

```bash
bun run build
```

This will compile TypeScript to the `dist/` directory with:
- ESM JavaScript files (.js)
- Type declarations (.d.ts)
- Declaration maps (.d.ts.map)

### 2. Test Locally

Test the package in a local project:

```bash
# In serverless-workflow directory
npm link

# In a test project
npm link serverless-workflow
```

Then try importing:

```typescript
import { WorkflowModule } from 'serverless-workflow/workflow';
import { LambdaEventHandler } from 'serverless-workflow/adapter';
```

### 3. Run Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch

# Run with coverage
bun test:cov
```

### 4. Verify Package Contents

Preview what will be published:

```bash
npm pack --dry-run
```

### 5. Publish to npm

When ready to publish:

```bash
# First time (make package public)
npm publish --access public

# Subsequent releases
npm publish
```

See [PUBLISHING.md](./PUBLISHING.md) for detailed instructions.

## Installation (For Users)

Once published, users install with:

```bash
npm install serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs
```

Optional dependencies (only if needed):
```bash
npm install @aws-sdk/client-sqs @types/aws-lambda
```

## Usage Examples

### Basic Workflow

```typescript
import { Module } from '@nestjs/common';
import { WorkflowModule, Workflow, OnEvent } from 'serverless-workflow/workflow';

@Workflow({
  states: {
    finals: ['completed', 'failed'],
    idles: ['pending', 'processing'],
    failed: 'failed',
  },
  transitions: [
    { from: 'pending', to: 'processing', event: 'submit' },
    { from: 'processing', to: 'completed', event: 'complete' },
  ],
})
class MyWorkflow {
  @OnEvent('submit')
  async onSubmit() {
    console.log('Processing...');
  }
}

@Module({
  imports: [
    WorkflowModule.register({
      entities: [],
      workflows: [MyWorkflow],
      brokers: [],
    }),
  ],
})
export class AppModule {}
```

### AWS Lambda Handler

```typescript
import { NestFactory } from '@nestjs/core';
import { LambdaEventHandler } from 'serverless-workflow/adapter';
import { AppModule } from './app.module';

const app = await NestFactory.createApplicationContext(AppModule);
await app.init();

export const handler = LambdaEventHandler(app);
```

### SQS Integration

```typescript
import { SqsEmitter, IWorkflowEvent } from 'serverless-workflow/event-bus';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

class MySqsEmitter extends SqsEmitter {
  async emit<T>(payload: IWorkflowEvent<T>): Promise<void> {
    // Implement SQS publishing
  }
}
```

## Documentation

- [Getting Started](./docs/getting-started.md) - Full installation and setup guide
- [Workflow Module](./docs/workflow.md) - Define workflows and transitions
- [Event Bus](./docs/event-bus.md) - Integrate with message brokers
- [Adapters](./docs/adapters.md) - Deploy to AWS Lambda
- [Contributing](./CONTRIBUTING.md) - Development guidelines
- [Publishing](./PUBLISHING.md) - How to publish updates

## Key Features

🌲 **Tree-Shakable** - Only bundle what you import  
🎯 **Stateless** - State lives in your domain entities  
🔄 **Event-Driven** - React to events from any source  
⚡ **Serverless-Ready** - Optimized for AWS Lambda  
🛡️ **Type-Safe** - Full TypeScript support  
📦 **Modular** - Import only what you need  

## Tree-Shaking Example

```typescript
// Only imports workflow module
import { WorkflowModule } from 'serverless-workflow/workflow';

// Bundle size: ~50KB (workflow code only)
// event-bus, adapter, exception = NOT included ✅
```

## Support

- Issues: [GitHub Issues](https://github.com/@nestjs-serverless-workflow/issues)
- Docs: [./docs](./docs/)
- Examples: [./examples](./examples/)

## Questions?

1. **How do I build?** → `bun run build`
2. **How do I test?** → `bun test`
3. **How do I publish?** → See [PUBLISHING.md](./PUBLISHING.md)
4. **How do I contribute?** → See [CONTRIBUTING.md](./CONTRIBUTING.md)
5. **What changed?** → See [PACKAGE_RESTRUCTURE_SUMMARY.md](./PACKAGE_RESTRUCTURE_SUMMARY.md)

---

**Ready to publish?** Follow the [Publishing Guide](./PUBLISHING.md) for a complete checklist.
