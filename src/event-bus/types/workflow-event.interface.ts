export interface WorkflowEvent<T = any> {
  topic: string;
  urn: string | number;
  payload?: T | object | string;
}
