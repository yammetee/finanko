import useMessage from "antd/es/message/useMessage";
import { useEffect, useRef } from "react";
import { AppThemeProvider } from "../../app/providers/AppThemeProvider";
import type { FeedbackNotice } from "./feedbackContext";

interface FeedbackHostProps {
  notices: FeedbackNotice[];
  onShown: (lastId: number) => void;
  onIdle: () => void;
}

export function FeedbackHost({ notices, onShown, onIdle }: FeedbackHostProps) {
  return <AppThemeProvider><FeedbackHostContent notices={notices} onShown={onShown} onIdle={onIdle} /></AppThemeProvider>;
}

function FeedbackHostContent({ notices, onShown, onIdle }: FeedbackHostProps) {
  const [message, messageHolder] = useMessage();
  const shown = useRef(new Set<number>());

  useEffect(() => {
    let lastId = 0;
    for (const notice of notices) {
      lastId = Math.max(lastId, notice.id);
      if (shown.current.has(notice.id)) continue;
      shown.current.add(notice.id);
      const close = message[notice.type](notice.content);
      void Promise.resolve(close).then(() => {
        shown.current.delete(notice.id);
        if (shown.current.size === 0) onIdle();
      });
    }
    if (lastId > 0) onShown(lastId);
  }, [message, notices, onIdle, onShown]);

  return messageHolder;
}
