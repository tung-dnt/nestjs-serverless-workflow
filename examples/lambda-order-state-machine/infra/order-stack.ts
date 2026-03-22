import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

interface OrderStackProps extends cdk.StackProps {
  stage: string;
}

class OrderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OrderStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // DynamoDB Table
    const table = new dynamodb.Table(this, 'OrderTable', {
      tableName: `order-state-machine-orders-${stage}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'OrderWorkflowLogs', {
      logGroupName: `/aws/lambda/order-state-machine-${stage}-order-workflow`,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda Function with Durable Execution
    const fn = new lambda.Function(this, 'OrderWorkflowFunction', {
      functionName: `order-state-machine-${stage}-order-workflow`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'lambda.handler',
      code: lambda.Code.fromAsset('dist'),
      memorySize: 512,
      timeout: cdk.Duration.minutes(15),
      logGroup,
      environment: {
        DYNAMODB_TABLE: table.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      durableConfig: {
        executionTimeout: cdk.Duration.hours(1),
        retentionPeriod: cdk.Duration.days(30),
      },
    });

    // Grant DynamoDB access
    table.grantReadWriteData(fn);

    // Grant durable execution checkpoint permissions
    fn.role!.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSLambdaBasicDurableExecutionRolePolicy',
      ),
    );

    // Version + Alias (required for durable Lambda invocation)
    const version = fn.currentVersion;
    const alias = new lambda.Alias(this, 'LiveAlias', {
      aliasName: 'live',
      version,
    });

    // Outputs
    new cdk.CfnOutput(this, 'FunctionAliasArn', {
      value: alias.functionArn,
      description: 'Use this ARN to invoke the durable function',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: table.tableName,
    });
  }
}

// App entry point
const app = new cdk.App();
const stage = app.node.tryGetContext('stage') ?? 'dev';

new OrderStack(app, `order-state-machine-${stage}`, {
  stage,
  env: {
    region: process.env.AWS_REGION ?? 'us-east-1',
  },
});

app.synth();
