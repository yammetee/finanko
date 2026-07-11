import type { AssistantSummary, AssistantResponse } from "./assistantSummary";
import { getSupabaseClient } from "../../shared/api/supabase";

interface AssistantAiInput {
  summary: AssistantSummary;
  locale: "en" | "ru";
}

export async function getAssistantResponse(input: AssistantAiInput) {
  const supabase = await getSupabaseClient();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (!session) throw new Error("Unauthorized");
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ kind: "assistant", payload: input }),
  });
  if (!response.ok) throw new Error(`Assistant request failed (${response.status})`);
  const analysis = ((await response.json()) as { analysis?: AssistantResponse }).analysis;
  if (!analysis) throw new Error("Assistant returned no analysis");
  return analysis;
}
