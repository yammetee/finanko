import useMessage from "antd/es/message/useMessage";
import { useEffect, useRef } from "react";
import { AppThemeProvider } from "../../app/providers/AppThemeProvider";
import type { FeedbackNotice } from "./feedbackContext";

interface FeedbackHostProps {
  notices: FeedbackNotice[];
  onShown: (lastId: number) => void;
}

export function FeedbackHost({ notices, onShown }: FeedbackHostProps) {
  return <AppThemeProvider><FeedbackHostContent notices={notices} onShown={onShown} /></AppThemeProvider>;
}

function FeedbackHostContent({ notices, onShown }: FeedbackHostProps) {
  const [message, messageHolder] = useMessage();
  const shown = useRef(new Set<number>());

  useEffect(() => {
    let lastId = 0;
    for (const notice of notices) {
      lastId = Math.max(lastId, notice.id);
      if (shown.current.has(notice.id)) continue;
      shown.current.add(notice.id);
      message[notice.type](notice.content);
    }
    if (lastId > 0) onShown(lastId);
  }, [message, notices, onShown]);

  return messageHolder;
}
