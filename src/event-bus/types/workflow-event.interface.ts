export interface WorkflowEvent<T = any> {
  key: string | number;
  payload?: T | object | string;
}
