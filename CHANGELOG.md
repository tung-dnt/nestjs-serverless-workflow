## [0.1.0] - 2026-03-22

### Changed
- Version bump to 0.1.0

## [0.0.8] - 2026-03-22

### Added
- **Durable Lambda Adapter** — `DurableLambdaEventHandler` for AWS Lambda Durable Functions (checkpoint/replay execution model)
  - `IDurableContext` interface abstracting the AWS SDK (no compile-time dependency)
  - `WithDurableExecution` type for injecting the SDK wrapper
  - Idle states pause via `ctx.waitForCallback()`, final states end execution
  - Ambiguous auto-transitions handled via `ctx.waitForCallback()` for explicit event resolution
- **`TransitResult` return type** from `OrchestratorService.transit()` — `final`, `idle`, `continued` (with `nextEvent`), `no_transition`
- `IWorkflowEvent` interface moved to `@/core` (previously in `@/event-bus`)
- Comprehensive E2E tests at Lambda handler level using `MockDurableContext`
- `MockDurableContext` test fixture with `waitUntilCallbackRegistered()` for reliable async coordination
- ESLint configuration (migrated from TSLint)

### Changed
- **Orchestrator is now adapter-agnostic** — `transit()` returns data, adapters decide how to handle progression (publish to SQS, Kafka, checkpoint, etc.)
- `brokerPublisher` removed from `OrchestratorService` — no longer resolves or calls broker internally
- `brokerPublisher` field removed from `IWorkflowDefinition` and `IWorkflowDefaultRoute`
- `WorkflowModule.register()` no longer accepts `brokers` parameter
- `findValidTransition()` refactored — single-pass loop with `matchesState()`/`matchesEvent()` helpers, returns `{ transition, hasEventStateMatch }` (eliminates duplicate event+state scan)
- `IWorkflowEvent.topic` field renamed to `IWorkflowEvent.event`
- Formatting migrated from Prettier/TSLint to Biome

### Removed
- **`packages/event-bus/`** — entire package removed (`IBrokerPublisher`, `SqsEmitter`, `IWorkflowEvent`)
- **`packages/adapter/lambda.adapter.ts`** — SQS-based Lambda adapter (replaced by durable adapter)
- Saga service (`packages/core/providers/saga.service.ts` and `packages/core/types/saga.interface.ts`)
- `brokers` provider registration from `WorkflowModule`
- Broker-related test fixtures (`MockBrokerService`) and assertions (`assertBrokerEvent`)
- GitHub publish workflow

## [0.0.7] - 2025-12-26

### Changed
- Version bump to 0.0.7

## [0.0.6] - 2025-12-26

### Changed
- Version bump to 0.0.6

## [0.0.5] - 2025-12-26

### Changed
- Version bump to 0.0.5

## [0.0.4] - 2025-12-26

### Changed
- Version bump to 0.0.4

## [0.0.3] - 2025-12-26

### Changed
- Version bump to 0.0.3

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2025-12-26

### Added
- Docusaurus documentation site with GitHub Pages deployment
  - Complete API reference documentation
  - Interactive documentation with search functionality
  - Examples and guides restructured for better navigation
  - GitHub Pages deployment workflow
- Build and test scripts
  - `test:all` script for running all tests across the project
  - `typecheck:all` script for type checking all TypeScript files
- Project logo and branding assets
- Enhanced CI/CD pipeline workflows
  - Updated workflows to use centralized test and typecheck scripts
  - Improved GitHub Actions configuration

### Changed
- Restructured documentation from markdown files to Docusaurus site
- Updated CI/CD pipelines to use `bun test:all` and `bun typecheck:all` commands
- Improved TypeScript configuration for better module resolution
- Enhanced project structure and organization

### Removed
- Removed `QUICK_START.md` (content migrated to documentation site)
- Removed redundant test README

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
nestjs-serverless-workflow/
├── workflow        - Core workflow engine
├── event-bus       - Event publishing and broker integration
├── adapter         - Runtime adapters (Lambda, HTTP)
└── exception       - Custom exception types
```

[0.0.2]: https://github.com/tung-dnt/nestjs-serverless-workflow/releases/tag/v0.0.2
[0.0.1]: https://github.com/@nestjs-serverless-workflow/releases/tag/v0.0.1
