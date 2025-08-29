export interface KafkaEvent<Event> {
  topic: string;
  event: Event;
}
