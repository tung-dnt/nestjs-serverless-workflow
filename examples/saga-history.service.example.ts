import { Injectable, Logger } from '@nestjs/common';
import { ISagaHistoryStore, SagaContext } from '@/workflow';

/**
 * Example SAGA History Store Implementation
 *
 * This demonstrates how to implement ISagaHistoryStore for persisting
 * SAGA context during workflow execution. In production, you would use:
 * - Redis for fast access and automatic TTL
 * - DynamoDB for serverless environments
 * - PostgreSQL/MongoDB for traditional databases
 */

// ==================== In-Memory Implementation (Development/Testing) ====================

@Injectable()
export class InMemorySagaHistoryService<T = any> implements ISagaHistoryStore<T> {
  private readonly logger = new Logger(InMemorySagaHistoryService.name);
  private readonly storage = new Map<string, SagaContext<T>>();

  async saveSagaContext(context: SagaContext<T>): Promise<void> {
    // Deep clone to prevent mutations
    const clonedContext = JSON.parse(JSON.stringify(context));
    this.storage.set(context.sagaId, clonedContext);

    this.logger.debug(`SAGA context saved: ${context.sagaId} (${context.status})`);
  }

  async getSagaContext(sagaId: string): Promise<SagaContext<T> | null> {
    const context = this.storage.get(sagaId);

    if (!context) {
      this.logger.warn(`SAGA context not found: ${sagaId}`);
      return null;
    }

    this.logger.debug(`SAGA context retrieved: ${sagaId}`);
    return context;
  }

  async deleteSagaContext(sagaId: string): Promise<void> {
    const deleted = this.storage.delete(sagaId);

    if (deleted) {
      this.logger.debug(`SAGA context deleted: ${sagaId}`);
    } else {
      this.logger.warn(`SAGA context not found for deletion: ${sagaId}`);
    }
  }

  // Helper method for testing
  clear(): void {
    this.storage.clear();
    this.logger.log('All SAGA contexts cleared');
  }

  // Helper method to get all contexts (for debugging)
  getAll(): SagaContext<T>[] {
    return Array.from(this.storage.values());
  }
}

// ==================== Redis Implementation ====================

/**
 * Redis-based SAGA History Store
 *
 * Features:
 * - Automatic TTL for expired SAGAs
 * - Fast access times
 * - Distributed support
 *
 * Install: npm install ioredis
 */
@Injectable()
export class RedisSagaHistoryService<T = any> implements ISagaHistoryStore<T> {
  private readonly logger = new Logger(RedisSagaHistoryService.name);
  private readonly SAGA_PREFIX = 'saga:';
  private readonly DEFAULT_TTL = 3600; // 1 hour in seconds

  constructor(
    // Inject Redis client
    // private readonly redis: Redis,
  ) {}

  async saveSagaContext(context: SagaContext<T>): Promise<void> {
    const key = this.getSagaKey(context.sagaId);
    const value = JSON.stringify(context);

    // Example using ioredis:
    // await this.redis.set(key, value, 'EX', this.DEFAULT_TTL);

    this.logger.debug(`SAGA context saved to Redis: ${context.sagaId}`);
  }

  async getSagaContext(sagaId: string): Promise<SagaContext<T> | null> {
    const key = this.getSagaKey(sagaId);

    // Example using ioredis:
    // const data = await this.redis.get(key);
    // if (!data) {
    //   this.logger.warn(`SAGA context not found in Redis: ${sagaId}`);
    //   return null;
    // }
    // return JSON.parse(data) as SagaContext<T>;

    return null;
  }

  async deleteSagaContext(sagaId: string): Promise<void> {
    const key = this.getSagaKey(sagaId);

    // Example using ioredis:
    // await this.redis.del(key);

    this.logger.debug(`SAGA context deleted from Redis: ${sagaId}`);
  }

  private getSagaKey(sagaId: string): string {
    return `${this.SAGA_PREFIX}${sagaId}`;
  }

  // Additional Redis-specific methods

  async extendTTL(sagaId: string, seconds: number): Promise<void> {
    const key = this.getSagaKey(sagaId);
    // await this.redis.expire(key, seconds);
  }

  async getAllSagaIds(): Promise<string[]> {
    // const keys = await this.redis.keys(`${this.SAGA_PREFIX}*`);
    // return keys.map(key => key.replace(this.SAGA_PREFIX, ''));
    return [];
  }
}

// ==================== DynamoDB Implementation ====================

/**
 * DynamoDB-based SAGA History Store
 *
 * Perfect for serverless environments (AWS Lambda)
 *
 * Features:
 * - Serverless-friendly
 * - Automatic scaling
 * - TTL support
 *
 * Install: npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
 */
@Injectable()
export class DynamoDBSagaHistoryService<T = any> implements ISagaHistoryStore<T> {
  private readonly logger = new Logger(DynamoDBSagaHistoryService.name);
  private readonly tableName = process.env.SAGA_TABLE_NAME || 'saga-history';

  constructor(
    // Inject DynamoDB client
    // private readonly dynamodb: DynamoDBDocumentClient,
  ) {}

  async saveSagaContext(context: SagaContext<T>): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    // Example using AWS SDK v3:
    // await this.dynamodb.put({
    //   TableName: this.tableName,
    //   Item: {
    //     sagaId: context.sagaId,
    //     context: context,
    //     status: context.status,
    //     workflowName: context.metadata?.workflowName,
    //     createdAt: context.startedAt.toISOString(),
    //     ttl: ttl,
    //   },
    // });

    this.logger.debug(`SAGA context saved to DynamoDB: ${context.sagaId}`);
  }

  async getSagaContext(sagaId: string): Promise<SagaContext<T> | null> {
    // Example using AWS SDK v3:
    // const result = await this.dynamodb.get({
    //   TableName: this.tableName,
    //   Key: { sagaId },
    // });

    // if (!result.Item) {
    //   this.logger.warn(`SAGA context not found in DynamoDB: ${sagaId}`);
    //   return null;
    // }

    // return result.Item.context as SagaContext<T>;

    return null;
  }

  async deleteSagaContext(sagaId: string): Promise<void> {
    // Example using AWS SDK v3:
    // await this.dynamodb.delete({
    //   TableName: this.tableName,
    //   Key: { sagaId },
    // });

    this.logger.debug(`SAGA context deleted from DynamoDB: ${sagaId}`);
  }

  // Additional DynamoDB-specific methods

  async querySagasByStatus(status: string): Promise<SagaContext<T>[]> {
    // Example GSI query:
    // const result = await this.dynamodb.query({
    //   TableName: this.tableName,
    //   IndexName: 'StatusIndex',
    //   KeyConditionExpression: '#status = :status',
    //   ExpressionAttributeNames: { '#status': 'status' },
    //   ExpressionAttributeValues: { ':status': status },
    // });

    // return result.Items?.map(item => item.context as SagaContext<T>) || [];
    return [];
  }

  async querySagasByWorkflow(workflowName: string): Promise<SagaContext<T>[]> {
    // Example GSI query:
    // const result = await this.dynamodb.query({
    //   TableName: this.tableName,
    //   IndexName: 'WorkflowIndex',
    //   KeyConditionExpression: 'workflowName = :workflowName',
    //   ExpressionAttributeValues: { ':workflowName': workflowName },
    // });

    // return result.Items?.map(item => item.context as SagaContext<T>) || [];
    return [];
  }
}

// ==================== PostgreSQL Implementation ====================

/**
 * PostgreSQL-based SAGA History Store
 *
 * For traditional server-based deployments
 *
 * Install: npm install pg typeorm
 */
@Injectable()
export class PostgresSagaHistoryService<T = any> implements ISagaHistoryStore<T> {
  private readonly logger = new Logger(PostgresSagaHistoryService.name);

  constructor(
    // Inject your database repository or connection
    // @InjectRepository(SagaHistoryEntity)
    // private readonly repository: Repository<SagaHistoryEntity>,
  ) {}

  async saveSagaContext(context: SagaContext<T>): Promise<void> {
    // Example using TypeORM:
    // await this.repository.upsert(
    //   {
    //     sagaId: context.sagaId,
    //     context: context,
    //     status: context.status,
    //     workflowName: context.metadata?.workflowName,
    //     startedAt: context.startedAt,
    //     completedAt: context.completedAt,
    //   },
    //   ['sagaId']
    // );

    this.logger.debug(`SAGA context saved to PostgreSQL: ${context.sagaId}`);
  }

  async getSagaContext(sagaId: string): Promise<SagaContext<T> | null> {
    // Example using TypeORM:
    // const entity = await this.repository.findOne({
    //   where: { sagaId },
    // });

    // return entity?.context as SagaContext<T> || null;

    return null;
  }

  async deleteSagaContext(sagaId: string): Promise<void> {
    // Example using TypeORM:
    // await this.repository.delete({ sagaId });

    this.logger.debug(`SAGA context deleted from PostgreSQL: ${sagaId}`);
  }

  // Additional PostgreSQL-specific methods

  async cleanupExpiredSagas(olderThanHours: number = 24): Promise<number> {
    // Example cleanup query:
    // const cutoffDate = new Date();
    // cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    // const result = await this.repository.delete({
    //   startedAt: LessThan(cutoffDate),
    //   status: In(['completed', 'compensated', 'failed']),
    // });

    // return result.affected || 0;
    return 0;
  }
}

// ==================== MongoDB Implementation ====================

/**
 * MongoDB-based SAGA History Store
 *
 * Install: npm install @nestjs/mongoose mongoose
 */
@Injectable()
export class MongoSagaHistoryService<T = any> implements ISagaHistoryStore<T> {
  private readonly logger = new Logger(MongoSagaHistoryService.name);

  constructor(
    // Inject Mongoose model
    // @InjectModel(SagaHistory.name)
    // private readonly model: Model<SagaHistoryDocument>,
  ) {}

  async saveSagaContext(context: SagaContext<T>): Promise<void> {
    // Example using Mongoose:
    // await this.model.findOneAndUpdate(
    //   { sagaId: context.sagaId },
    //   {
    //     sagaId: context.sagaId,
    //     context: context,
    //     status: context.status,
    //     workflowName: context.metadata?.workflowName,
    //     startedAt: context.startedAt,
    //     completedAt: context.completedAt,
    //     expiresAt: new Date(Date.now() + 3600000), // 1 hour
    //   },
    //   { upsert: true, new: true }
    // );

    this.logger.debug(`SAGA context saved to MongoDB: ${context.sagaId}`);
  }

  async getSagaContext(sagaId: string): Promise<SagaContext<T> | null> {
    // Example using Mongoose:
    // const doc = await this.model.findOne({ sagaId }).exec();
    // return doc?.context as SagaContext<T> || null;

    return null;
  }

  async deleteSagaContext(sagaId: string): Promise<void> {
    // Example using Mongoose:
    // await this.model.deleteOne({ sagaId }).exec();

    this.logger.debug(`SAGA context deleted from MongoDB: ${sagaId}`);
  }
}

// ==================== Usage Example ====================

/**
 * Register the history service in your module:
 *
 * @Module({
 *   providers: [
 *     {
 *       provide: 'OrderSagaHistoryService',
 *       useClass: RedisSagaHistoryService,
 *     },
 *   ],
 * })
 * export class OrderModule {}
 */
