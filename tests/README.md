# Tests

This directory contains all tests for the serverless-workflow library.

## Structure

```
tests/
├── workflow/           # Tests for workflow module
│   ├── workflow.module.spec.ts
│   └── orchestrator.service.spec.ts
├── event-bus/         # Tests for event bus and brokers
│   └── sqs.emitter.spec.ts
├── exception/         # Tests for custom exceptions
│   └── unretriable.exception.spec.ts
├── adapter/           # Tests for adapters (Lambda, etc.)
│   └── lambda.adapter.spec.ts
└── integration/       # Integration tests
    └── workflow-integration.spec.ts
```

## Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch

# Run tests with coverage
bun test:cov

# Run specific test file
bun test tests/workflow/workflow.module.spec.ts
```

## Writing Tests

All tests should follow these guidelines:

1. **Unit Tests**: Test individual components in isolation with mocked dependencies
2. **Integration Tests**: Test multiple components working together
3. **Use descriptive test names**: Follow the pattern "should [expected behavior] when [condition]"
4. **Clean up**: Always clean up resources in `afterEach` or `afterAll` hooks
5. **Mock external dependencies**: Use mocks for AWS services, databases, etc.

## Test Coverage

Aim for:
- **Unit tests**: >80% code coverage
- **Integration tests**: Cover critical user workflows
- **Edge cases**: Test error conditions and boundary cases

