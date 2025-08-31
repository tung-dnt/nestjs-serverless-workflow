import { Trigger } from "./trigger.decorator";

interface OnEventOptions {
  maxAtempts?: number;
}
export function OnEvent(eventName: string, options?: OnEventOptions) {
  return Trigger;
}
