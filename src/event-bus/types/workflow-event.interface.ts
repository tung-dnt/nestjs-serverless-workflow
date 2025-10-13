export interface WorkflowEvent<T = any> {
  topic: string; // NOTE: Can be used for topic segration
  urn: string | number; // NOTE: can be used as group ID
  payload?: T | object | string;
  attempt: number;
}
