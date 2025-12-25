# Usage Examples

This folder contains example entry points demonstrating how to use the serverless-workflow library in different contexts.

## Files

### `main.ts`
Example of using the workflow engine in a standard NestJS HTTP application.

```bash
bun run examples/usage/main.ts
```

### `lambda.ts`
Example of using the workflow engine in an AWS Lambda function with SQS event handler.

This demonstrates:
- Creating a NestJS application context in Lambda
- Using the `LambdaEventHandler` adapter
- Processing SQS events with the workflow engine

## Related Examples

- **[Order Processing](../order/)** - Complete order workflow implementation
- **[DynamoDB Integration](../dynamodb/)** - DynamoDB table setup for entities

