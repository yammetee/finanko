import { lazy, Suspense, useCallback, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { FeedbackContext, type FeedbackNotice } from "./feedbackContext";

const FeedbackHost = lazy(() => import("./FeedbackHost").then((module) => ({ default: module.FeedbackHost })));

export function FeedbackProvider({ children }: PropsWithChildren) {
  const nextId = useRef(0);
  const [notices, setNotices] = useState<FeedbackNotice[]>([]);
  const [hostVisible, setHostVisible] = useState(false);
  const show = useCallback((type: FeedbackNotice["type"], content: ReactNode) => {
    nextId.current += 1;
    setHostVisible(true);
    setNotices((current) => [...current, { id: nextId.current, type, content }]);
  }, []);
  const message = useMemo(() => ({
    success: (content: ReactNode) => show("success", content),
    error: (content: ReactNode) => show("error", content),
  }), [show]);
  const value = useMemo(() => ({ message }), [message]);
  const handleShown = useCallback((lastId: number) => {
    setNotices((current) => current.filter((notice) => notice.id > lastId));
  }, []);

  return (
    <FeedbackContext.Provider value={value}>
      {hostVisible ? <Suspense fallback={null}><FeedbackHost notices={notices} onShown={handleShown} onIdle={() => setHostVisible(false)} /></Suspense> : null}
      {children}
    </FeedbackContext.Provider>
  );
}
