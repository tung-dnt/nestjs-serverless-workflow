# Quick Start Guide

Get the Lambda Order State Machine example up and running in 5 minutes!

## Fast Setup

### 1. Install Dependencies (30 seconds)

```bash
cd examples/lambda-order-state-machine
bun install
```

### 2. Configure AWS (if not already done)

```bash
aws configure
# Enter your AWS credentials
```

### 3. Bootstrap CDK (first time only)

```bash
bunx cdk bootstrap
```

### 4. Deploy to AWS (2-3 minutes)

```bash
bun run deploy:dev
```

### 5. Test It! (30 seconds)

Invoke the Lambda using the alias ARN from the deployment output:

```bash
aws lambda invoke \
  --function-name arn:aws:lambda:us-east-1:YOUR_ACCOUNT:function:order-state-machine-dev-order-workflow:live \
  --payload '{"urn":"order-1","event":"order.submit","payload":{"items":["laptop"],"totalAmount":999}}' \
  /dev/stdout
```

Watch the logs:

```bash
aws logs tail /aws/lambda/order-state-machine-dev-order-workflow --follow
```

## What You Get

After deployment, you'll have:

- **Durable Lambda Function** - Processes orders with fault-tolerant execution
- **DynamoDB Table** - Persistent order storage
- **CloudWatch Logs** - Full observability

## Architecture

```
Event Source → Durable Lambda (Workflow) → DynamoDB
```

## Order Workflow

```
PENDING → PROCESSING → COMPLETED
   │
   ├──▶ CANCELLED
   └──▶ FAILED
```

## Local Development

Run locally without deploying:

```bash
bun run start:dev
```

## Common Commands

```bash
# Development
bun install               # Install dependencies
bun run build             # Compile TypeScript
bun run start             # Run locally
bun run start:dev         # Run with hot reload

# Deployment
bun run deploy:dev        # Deploy to dev
bun run deploy:prod       # Deploy to prod
bun run diff              # Preview changes
bun run synth             # Synthesize CloudFormation

# Cleanup
bun run destroy           # Remove deployment
```

## Monitoring

### View Logs in Real-Time

```bash
aws logs tail /aws/lambda/order-state-machine-dev-order-workflow --follow
```

## Quick Tips

1. **Use CDK Outputs**: The alias ARN in the deployment output is what you use to invoke the function
2. **Check Logs**: Always check CloudWatch logs if something fails
3. **IAM Permissions**: Ensure your AWS user has proper permissions
4. **Cost**: Dev stage is mostly free tier eligible

## Troubleshooting

**Issue**: Deployment fails
**Fix**: Check AWS credentials with `aws sts get-caller-identity`

**Issue**: CDK bootstrap required
**Fix**: Run `bunx cdk bootstrap` once per account/region

**Issue**: Workflow not processing
**Fix**: Check Lambda logs with `aws logs tail`

**Issue**: Permission denied
**Fix**: Ensure IAM user has Lambda, DynamoDB, and CloudFormation permissions

## Next Steps

- Read [README.md](./README.md) for detailed documentation
- Explore source code in `src/` directory
- Customize workflow in `src/order/order.workflow.ts`

## Need Help?

- **Documentation**: [../../docs/](../../docs/)
- **GitHub Issues**: https://github.com/tung-dnt/nestjs-serverless-workflow/issues
- **AWS Docs**: https://aws.amazon.com/lambda/

## Success!

You now have a production-ready serverless workflow running on AWS with durable execution!

Try modifying the workflow states in `src/order/order.workflow.ts` and redeploy to see changes.
