import DatePicker from "antd/es/date-picker";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

interface ExpenseDateRangeProps {
  value?: [string, string];
  onChange: (value: [string, string]) => void;
}

export function ExpenseDateRange({ value, onChange }: ExpenseDateRangeProps) {
  return (
    <RangePicker
      allowClear={false}
      className="date-range"
      value={value ? [dayjs(value[0]), dayjs(value[1])] : undefined}
      onChange={(range) => {
        if (range?.[0] && range[1]) onChange([range[0].toISOString(), range[1].toISOString()]);
      }}
    />
  );
}
