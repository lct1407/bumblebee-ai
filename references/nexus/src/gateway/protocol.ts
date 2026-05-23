import { z } from "zod";

export const RequestFrame = z.object({
  type: z.literal("req"),
  id: z.string(),
  method: z.string(),
  params: z.unknown().optional(),
});
export type RequestFrame = z.infer<typeof RequestFrame>;

export const ResponseFrame = z.object({
  type: z.literal("res"),
  id: z.string(),
  ok: z.boolean(),
  payload: z.unknown().optional(),
  error: z
    .object({ code: z.string(), message: z.string() })
    .optional(),
});
export type ResponseFrame = z.infer<typeof ResponseFrame>;

export const EventFrame = z.object({
  type: z.literal("event"),
  event: z.string(),
  payload: z.unknown().optional(),
  seq: z.number().optional(),
});
export type EventFrame = z.infer<typeof EventFrame>;

export function makeResponse(id: string, payload: unknown): ResponseFrame {
  return { type: "res", id, ok: true, payload };
}

export function makeErrorResponse(
  id: string,
  code: string,
  message: string,
): ResponseFrame {
  return { type: "res", id, ok: false, error: { code, message } };
}

export function makeEvent(event: string, payload?: unknown): EventFrame {
  return { type: "event", event, payload };
}
