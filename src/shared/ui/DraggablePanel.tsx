import { Button, Card } from "antd";
import { X } from "lucide-react";
import { type PropsWithChildren, type ReactNode, useState } from "react";

interface DraggablePanelProps {
  open: boolean;
  title: ReactNode;
  className?: string;
  overlay?: boolean;
  defaultPosition?: { x: number; y: number };
  onClose: () => void;
}

export function DraggablePanel({
  open,
  title,
  className,
  overlay = false,
  defaultPosition = { x: 420, y: 96 },
  onClose,
  children,
}: PropsWithChildren<DraggablePanelProps>) {
  const [position, setPosition] = useState(defaultPosition);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  if (!open) return null;

  return (
    <>
      {overlay ? <div className="draggable-panel-overlay" /> : null}
      <div
        className={className ?? "draggable-panel"}
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        <Card
          title={
            <div
              className="draggable-panel-handle"
              onMouseDown={(event) =>
                setDragStart({
                  x: event.clientX - position.x,
                  y: event.clientY - position.y,
                })
              }
              onMouseMove={(event) => {
                if (!dragStart) return;
                setPosition({
                  x: Math.max(12, event.clientX - dragStart.x),
                  y: Math.max(12, event.clientY - dragStart.y),
                });
              }}
              onMouseUp={() => setDragStart(null)}
              onMouseLeave={() => setDragStart(null)}
            >
              {title}
            </div>
          }
          extra={<Button type="text" icon={<X size={16} />} onClick={onClose} />}
        >
          {children}
        </Card>
      </div>
    </>
  );
}
