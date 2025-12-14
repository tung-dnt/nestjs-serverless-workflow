import { Entity, item, number, string, Table, type TransformedValue } from 'dynamodb-toolbox';
import { DocumentClient } from './client';

export enum OrderState {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export const OrderTable = new Table({
  documentClient: DocumentClient,
  name: 'order',
  partitionKey: {
    name: 'id',
    type: 'string',
  },
});

export const OrderSchema = item({
  id: string().key(),
  item: string(),
  quantity: number().default(0),
  price: number().default(0),
  status: string().enum(...Object.values(OrderState)),
});

export const OrderEntity = new Entity({
  name: 'order_master',
  table: OrderTable,
  schema: OrderSchema,
  timestamps: false,
  entityAttribute: false,
});

export type Order = TransformedValue<typeof OrderSchema>;
