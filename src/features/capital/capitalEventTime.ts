import type { CapitalEvent } from "./capitalTypes";

type OrderedEvent = Pick<CapitalEvent, "id" | "occurredAt">;

const eventDay = (value: string) => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (!match) throw new Error("capital_event_date_invalid");
  return match[1];
};

const timestampTime = (value: string, fallback: Date) => {
  if (value.length <= 10) return fallback.toISOString().slice(11);
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("capital_event_date_invalid");
  return timestamp.toISOString().slice(11);
};

export function compareCapitalEvents(left: OrderedEvent, right: OrderedEvent) {
  const leftTime = Date.parse(left.occurredAt);
  const rightTime = Date.parse(right.occurredAt);
  const timestampOrder = Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? leftTime - rightTime
    : left.occurredAt.localeCompare(right.occurredAt);
  return timestampOrder || left.id.localeCompare(right.id);
}

export function capitalEventTimestamp(
  selectedDate: string,
  options: { events?: OrderedEvent[]; existingEvent?: OrderedEvent; now?: Date } = {},
) {
  const day = eventDay(selectedDate);
  if (options.existingEvent && eventDay(options.existingEvent.occurredAt) === day) {
    return options.existingEvent.occurredAt;
  }

  const now = options.now ?? new Date();
  let timestamp = `${day}T${timestampTime(selectedDate, now)}`;
  const orderedEvents = (options.events ?? [])
    .filter((event) => event.id !== options.existingEvent?.id && eventDay(event.occurredAt) === day)
    .sort(compareCapitalEvents);
  const latest = orderedEvents[orderedEvents.length - 1];

  if (latest && compareCapitalEvents({ id: "", occurredAt: timestamp }, latest) <= 0) {
    timestamp = new Date(Date.parse(latest.occurredAt) + 1).toISOString();
    if (eventDay(timestamp) !== day) throw new Error("capital_event_timestamp_exhausted");
  }

  return timestamp;
}
