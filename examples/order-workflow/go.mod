module github.com/tung-dnt/nestjs-serverless-workflow/examples/order-workflow

go 1.21

replace github.com/tung-dnt/nestjs-serverless-workflow => ../..

require (
	github.com/aws/aws-lambda-go v1.52.0
	github.com/aws/aws-sdk-go-v2 v1.41.1
	github.com/aws/aws-sdk-go-v2/config v1.32.7
	github.com/aws/aws-sdk-go-v2/service/dynamodb v1.55.0
	github.com/aws/aws-sdk-go-v2/service/sqs v1.42.21
	github.com/tung-dnt/nestjs-serverless-workflow v0.0.0
)
