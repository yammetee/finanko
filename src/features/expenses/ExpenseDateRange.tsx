import DatePicker from "antd/es/date-picker";
import dayjs from "dayjs";
import { AppThemeProvider } from "../../app/providers/AppThemeProvider";

const { RangePicker } = DatePicker;

interface ExpenseDateRangeProps {
  label: string;
  value?: [string, string];
  onChange: (value: [string, string]) => void;
}

export function ExpenseDateRange(props: ExpenseDateRangeProps) {
  return <AppThemeProvider><ExpenseDateRangeContent {...props} /></AppThemeProvider>;
}

function ExpenseDateRangeContent({ label, value, onChange }: ExpenseDateRangeProps) {
  return (
    <RangePicker
      allowClear={false}
      aria-label={label}
      className="date-range"
      value={value ? [dayjs(value[0]), dayjs(value[1])] : undefined}
      onChange={(range) => {
        if (range?.[0] && range[1]) onChange([range[0].toISOString(), range[1].toISOString()]);
      }}
    />
  );
}
