# Quick Start Guide

Get the Lambda Order State Machine example up and running in 5 minutes!

## 🚀 Fast Setup

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

### 3. Deploy to AWS (2-3 minutes)

```bash
make deploy-dev
# or
bun run deploy:dev
```

### 4. Test It! (30 seconds)

Send a test message:

```bash
make test-message
# or manually:
aws sqs send-message \
  --queue-url YOUR_QUEUE_URL \
  --message-body '{"urn":"order-1","event":"order.submit","payload":{"items":["laptop"],"totalAmount":999}}' \
  --message-group-id "order-1" \
  --message-deduplication-id "$(uuidgen)"
```

Watch the logs:

```bash
make logs
# or
bun run logs
```

## 🎯 What You Get

After deployment, you'll have:

✅ **Lambda Function** - Processes orders automatically  
✅ **SQS Queue (FIFO)** - Reliable message delivery  
✅ **DynamoDB Table** - Persistent order storage  
✅ **Dead Letter Queue** - Failed message handling  
✅ **CloudWatch Logs** - Full observability  

## 📊 Architecture

```
Order → SQS Queue → Lambda (Workflow) → DynamoDB
                         ↓
                    DLQ (Failed)
```

## 🔄 Order Workflow

```
PENDING → PROCESSING → COMPLETED
   │
   ├──▶ CANCELLED
   └──▶ FAILED
```

## 🧪 Local Development

Run locally without deploying:

```bash
make local
# or
bun run dev
```

Then test via HTTP:

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "items": ["laptop", "mouse"],
    "totalAmount": 1050.00
  }'
```

## 📝 Common Commands

```bash
# Development
make install          # Install dependencies
make build            # Compile TypeScript
make local            # Run locally
make dev              # Run with hot reload

# Deployment
make deploy-dev       # Deploy to dev
make deploy-prod      # Deploy to prod
make logs             # View logs
make info             # Show deployment info

# Testing
make test-message     # Send test SQS message
make invoke           # Invoke Lambda directly
make show-table       # View DynamoDB items
make show-queue       # Show queue stats

# Cleanup
make remove           # Remove deployment
make clean            # Clean build files
```

## 🔍 Monitoring

### View Logs in Real-Time

```bash
make logs
```

### Check DynamoDB

```bash
make show-table
```

### Check SQS Queue

```bash
make show-queue
```

## 💡 Quick Tips

1. **Use Makefile**: All common operations are in the Makefile
2. **Check Logs**: Always check CloudWatch logs if something fails
3. **DLQ Messages**: Check DLQ if messages aren't processing
4. **IAM Permissions**: Ensure your AWS user has proper permissions
5. **Cost**: Dev stage is mostly free tier eligible

## 🐛 Troubleshooting

**Issue**: Deployment fails  
**Fix**: Check AWS credentials with `aws sts get-caller-identity`

**Issue**: Messages not processing  
**Fix**: Check Lambda logs with `make logs`

**Issue**: Can't find queue URL  
**Fix**: Run `make info` to see all endpoints

**Issue**: Permission denied  
**Fix**: Ensure IAM user has Lambda, SQS, DynamoDB permissions

## 📚 Next Steps

- Read [README.md](./README.md) for detailed documentation
- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
- Explore source code in `src/` directory
- Customize workflow in `src/order/order.workflow.ts`

## 🆘 Need Help?

- **Documentation**: [../../docs/](../../docs/)
- **GitHub Issues**: https://github.com/tung-dnt/nestjs-serverless-workflow/issues
- **AWS Docs**: https://aws.amazon.com/lambda/

## 🎉 Success!

You now have a production-ready serverless workflow running on AWS!

Try modifying the workflow states in `src/order/order.workflow.ts` and redeploy to see changes.

**Happy coding! 🚀**

