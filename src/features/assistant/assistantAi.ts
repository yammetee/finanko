import {
  ASSISTANT_ACTIONS,
  getAssistantResponseFallback as buildAssistantFallbackResponse,
  type AssistantActionId,
  type AssistantSummary,
} from "./assistantSummary";
import { getSupabaseClient } from "../../shared/api/supabase";

interface AssistantAiInput {
  actionId: AssistantActionId;
  summary: AssistantSummary;
  selectedCategoryId?: string;
  locale: "en" | "ru";
}

export async function getAssistantResponse(input: AssistantAiInput) {
  const action = ASSISTANT_ACTIONS.find((item) => item.id === input.actionId);
  if (!action) return null;

  try {
    const supabase = await getSupabaseClient();
    if (!supabase) return null;
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return null;
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ kind: "assistant", payload: {
        action: {
          id: action.id,
          backendDescription: action.backendDescription,
        },
        summary: input.summary,
        selectedCategoryId: input.selectedCategoryId,
        locale: input.locale,
      } }),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { analysis?: import("./assistantSummary").AssistantResponse }).analysis ?? null;
  } catch {
    return null;
  }
}

export function getAssistantFallbackResponse(
  actionId: AssistantActionId,
  summary: AssistantSummary,
  locale: "en" | "ru" = "en",
  selectedCategoryId?: string,
) {
  return buildAssistantFallbackResponse(actionId, summary, locale, selectedCategoryId);
}
