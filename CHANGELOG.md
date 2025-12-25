# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2024-12-25

### Added
- Initial release of serverless-workflow package
- Tree-shakable subpath exports for workflow, event-bus, adapter, and exception modules
- Workflow module with state machine capabilities
  - `@Workflow` decorator for defining workflow definitions
  - `@OnEvent` decorator for event handlers
  - `@WithRetry` decorator for retry logic
  - `OrchestratorService` for workflow execution
- Event bus module with broker integration
  - `IBrokerPublisher` interface
  - `SqsEmitter` for AWS SQS integration
- Lambda adapter for AWS Lambda runtime
  - Automatic timeout handling
  - Batch item failure support
  - Graceful shutdown
- Exception handling with `UnretriableException`
- Comprehensive documentation
  - Getting started guide
  - Module-specific documentation
  - Examples for order processing and DynamoDB integration
- Complete test structure with unit and integration test examples
- TypeScript declarations with full type safety

### Changed
- Restructured project as publishable npm package
- Moved application entry points (lambda.ts, main.ts) to examples
- Separated tests into dedicated tests/ folder

### Package Structure
```
serverless-workflow/
├── workflow        - Core workflow engine
├── event-bus       - Event publishing and broker integration
├── adapter         - Runtime adapters (Lambda, HTTP)
└── exception       - Custom exception types
```

[0.0.1]: https://github.com/@nestjs-serverless-workflow/releases/tag/v0.0.1

