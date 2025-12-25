# NestJS Serverless Workflow Documentation

Welcome to the NestJS Serverless Workflow documentation!

This library provides a powerful, tree-shakable workflow and state machine engine for NestJS applications, optimized for serverless environments like AWS Lambda.

## Quick Links

- [Getting Started](./getting-started) - Get up and running in 5 minutes
- [Workflow Module](./workflow) - Learn about workflows, states, and transitions
- [Event Bus](./event-bus) - Integrate with message brokers
- [Adapters](./adapters) - Deploy to AWS Lambda and other runtimes
- [API Reference](./api-reference/workflow-module) - Complete API documentation
- [Examples](./examples/lambda-order-state-machine) - Working examples

## Features

- 🎯 **State Machine Engine**: Define workflows with states, transitions, and events
- 🔄 **Event-Driven Architecture**: Integrate with message brokers (SQS, Kafka, RabbitMQ, etc.)
- ⚡ **Serverless Optimized**: Built for AWS Lambda with automatic timeout handling
- 📦 **Tree-Shakable**: Subpath exports ensure minimal bundle sizes
- 🛡️ **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🔁 **Retry Logic**: Built-in retry mechanisms with exponential backoff
- 🎨 **Decorator-Based API**: Clean, declarative workflow definitions

## Installation

```bash
npm install nestjs-serverless-workflow @nestjs/common @nestjs/core reflect-metadata rxjs
```

## Package Structure

The library is organized into tree-shakable subpath exports:

- `nestjs-serverless-workflow/core` - Core workflow engine
- `nestjs-serverless-workflow/event-bus` - Event publishing and broker integration
- `nestjs-serverless-workflow/adapter` - Runtime adapters (Lambda, HTTP)
- `nestjs-serverless-workflow/exception` - Custom exception types

## Requirements

- Node.js >= 20.0.0 or Bun >= 1.3.4
- NestJS >= 11.0.0
- TypeScript >= 5.0.0

## Getting Help

- 📖 [Documentation](https://tung-dnt.github.io/nestjs-serverless-workflow/)
- 🐛 [Issue Tracker](https://github.com/tung-dnt/nestjs-serverless-workflow/issues)
- 💬 [Discussions](https://github.com/tung-dnt/nestjs-serverless-workflow/discussions)

