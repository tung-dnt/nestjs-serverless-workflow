export enum OrderEvent {
  CREATED = 'order.created',
  PROCESSING = 'order.processing',
  SHIPPED = 'order.shipped',
  CANCELLED = 'order.cancelled',
  FAILED = 'order.failed',
}

export const ORDER_WORKFLOW_ENTITY = 'entity.order';
export const ORDER_WORKFLOW_BROKER = 'broker.order';
