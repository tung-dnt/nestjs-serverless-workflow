export interface IWorkflowHandler {
  event: string;
  name: string;
  handler: (payload: any) => Promise<any>;
}
