import { createContext, useContext, type ReactNode } from "react";

export interface FeedbackNotice {
  id: number;
  type: "success" | "error";
  content: ReactNode;
}

export interface FeedbackContextValue {
  message: {
    success: (content: ReactNode) => void;
    error: (content: ReactNode) => void;
  };
}

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback() {
  const feedback = useContext(FeedbackContext);
  if (!feedback) throw new Error("useFeedback must be used inside FeedbackProvider");
  return feedback;
}
