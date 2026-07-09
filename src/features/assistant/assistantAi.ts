import {
  ASSISTANT_ACTIONS,
  getAssistantResponseMock,
  type AssistantActionId,
  type AssistantSummary,
} from "./assistantSummary";

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
    const response = await fetch("/api/ai/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: {
          id: action.id,
          backendDescription: action.backendDescription,
        },
        summary: input.summary,
        selectedCategoryId: input.selectedCategoryId,
        locale: input.locale,
      }),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { text?: string };
    return payload.text?.trim() || null;
  } catch {
    return null;
  }
}

export function getAssistantFallbackResponse(
  actionId: AssistantActionId,
  summary: AssistantSummary,
  selectedCategoryId: string | undefined,
  t: Parameters<typeof getAssistantResponseMock>[3],
) {
  return getAssistantResponseMock(actionId, summary, selectedCategoryId, t);
}
