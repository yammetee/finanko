import Button from "antd/es/button";
import Modal from "antd/es/modal";
import Tag from "antd/es/tag";
import Typography from "antd/es/typography";
import { Pencil, Trash2 } from "lucide-react";
import { getCategoryName } from "../../shared/i18n/displayText";
import { useI18n, type MessageKey } from "../../shared/i18n/i18nContext";
import { formatMoney } from "../../shared/lib/format";
import type { Category, Transaction, TransactionItem } from "../../shared/types/finance";

const { Text, Title } = Typography;

const sourceKeys: Record<Transaction["source"], MessageKey> = {
  manual: "source.manual",
  text_ai: "source.text_ai",
  receipt_ai: "source.receipt_ai",
  recurring: "source.recurring",
  system: "source.system",
};

interface ExpenseDetailProps {
  open: boolean;
  transaction: Transaction | null;
  items: TransactionItem[];
  categories: Category[];
  onClose: () => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

export function ExpenseDetail({
  open,
  transaction,
  items,
  categories,
  onClose,
  onEdit,
  onDelete,
}: ExpenseDetailProps) {
  const { locale, t } = useI18n();
  if (!transaction) return null;

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const category = categoryById.get(transaction.categoryId);
  const date = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(transaction.occurredAt));

  return (
    <Modal
      centered
      className="expense-detail"
      open={open}
      onCancel={onClose}
      title={t("expense.detailTitle")}
      width={520}
      footer={(
        <div className="expense-detail-actions">
          <Button
            icon={<Pencil size={17} />}
            onClick={() => onEdit(transaction)}
          >
            {t("actions.edit")}
          </Button>
          <Button
            danger
            icon={<Trash2 size={17} />}
            onClick={() => onDelete(transaction)}
          >
            {t("actions.delete")}
          </Button>
        </div>
      )}
    >
      <div className="expense-detail-content">
        <div>
          <Text className="expense-detail-label">{t("expense.amount")}</Text>
          <Title className="expense-detail-amount" level={2}>
            {formatMoney(transaction.amount, transaction.currency)}
          </Title>
          <div className="expense-detail-tags">
            {category ? (
              <Tag className="expense-detail-category" bordered={false}>
                <span style={{ background: category.color }} />
                {getCategoryName(category, t)}
              </Tag>
            ) : null}
            <Tag bordered={false}>{t(sourceKeys[transaction.source])}</Tag>
          </div>
        </div>

        <dl className="expense-detail-list">
          <div>
            <dt>{t("form.description")}</dt>
            <dd>{transaction.description || t("expense.untitled")}</dd>
          </div>
          <div>
            <dt>{t("form.date")}</dt>
            <dd>{date}</dd>
          </div>
          <div>
            <dt>{t("form.currency")}</dt>
            <dd>{transaction.currency}</dd>
          </div>
        </dl>

        {items.length > 0 ? (
          <section className="expense-detail-items">
            <Text className="expense-section-title">{t("section.receiptItems")}</Text>
            <div>
              {items.map((item) => {
                const itemCategory = categoryById.get(item.categoryId);
                return (
                  <div className="expense-detail-item" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      {itemCategory ? <span>{getCategoryName(itemCategory, t)}</span> : null}
                    </div>
                    <span>{formatMoney(item.amount, transaction.currency)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
