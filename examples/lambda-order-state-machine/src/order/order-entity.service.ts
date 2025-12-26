import { Injectable } from '@nestjs/common';
import { GetItemCommand, PutItemCommand } from 'dynamodb-toolbox';
import type { IWorkflowEntity } from 'nestjs-serverless-workflow/core';
import { uuidv7 } from 'uuidv7';

import { type Order, OrderEntity, OrderState } from '../dynamodb/order.table';

@Injectable()
export class OrderEntityService implements IWorkflowEntity<Order, OrderState> {
  async create(): Promise<Order> {
    const order: Order = {
      id: uuidv7(),
      quantity: 0,
      item: 'ahihihi',
      price: 0,
      status: OrderState.PENDING,
    };
    await OrderEntity.build(PutItemCommand).item(order).send();
    return order;
  }

  async load(urn: string): Promise<Order | null> {
    const { Item } = await OrderEntity.build(GetItemCommand).key({ id: urn }).send();
    if (!Item) throw new Error(`Order ${urn} not found!`);
    return Item;
  }

  async update(order: Order, status: OrderState): Promise<Order> {
    const updated: Order = { ...order, status };
    await OrderEntity.build(PutItemCommand).item(updated).send();
    return updated;
  }

  status(order: Order): OrderState {
    return order.status;
  }

  urn(order: Order): string | number {
    return order.id;
  }
}
