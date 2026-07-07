import type { ModalStaticFunctions } from "antd/es/modal/confirm";

interface ConfirmDeleteOptions {
  modal: Omit<ModalStaticFunctions, "warn">;
  title: string;
  content: string;
  okText: string;
  onConfirm: () => void | Promise<void>;
}

export function confirmDanger({
  modal,
  title,
  content,
  okText,
  onConfirm,
}: ConfirmDeleteOptions) {
  modal.confirm({
    title,
    content,
    okText,
    okButtonProps: { danger: true },
    onOk: onConfirm,
  });
}
