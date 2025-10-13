export interface IWorkflowHandler {
  event: string;
  handler: (payload: any) => Promise<any>;
}
