import type {
  AssistantChatResponse,
  AssistantResponse,
  AssistantSummary,
  ContextInsightResponse,
  WeeklyRecapResponse,
} from "./assistantSummary";
import { getSupabaseClient } from "../../shared/api/supabase";

interface AssistantAiInput {
  summary: AssistantSummary;
  locale: "en" | "ru";
}

export async function getAssistantResponse(input: AssistantAiInput) {
  return requestAssistant<AssistantResponse>(input);
}

async function requestAssistant<T>(payload: Record<string, unknown> | AssistantAiInput) {
  const supabase = await getSupabaseClient();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (!session) throw new Error("Unauthorized");
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ kind: "assistant", payload }),
  });
  if (!response.ok) throw new Error(`Assistant request failed (${response.status})`);
  const analysis = ((await response.json()) as { analysis?: T }).analysis;
  if (!analysis) throw new Error("Assistant returned no analysis");
  return analysis;
}

export function getAssistantChatResponse(input: AssistantAiInput & {
  question: string;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  return requestAssistant<AssistantChatResponse>({ ...input, assistantMode: "chat" });
}

export function getContextInsight(input: AssistantAiInput & { context: "net_worth" | "cash_flow" | "categories" | "accounts" }) {
  return requestAssistant<ContextInsightResponse>({ ...input, assistantMode: "insight" });
}

export function getWeeklyRecap(input: AssistantAiInput) {
  return requestAssistant<WeeklyRecapResponse>({ ...input, assistantMode: "weekly_recap" });
}
