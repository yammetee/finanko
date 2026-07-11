import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import en from "./en.json";
import ru from "./ru.json";
import {
  I18nContext,
  type I18nContextValue,
  type Locale,
  type Messages,
} from "./i18nContext";

const dictionaries: Record<Locale, Messages> = { en, ru };

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>("ru");

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => {
        const template = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
        if (!values) return template;
        return Object.entries(values).reduce(
          (message, [name, replacement]) =>
            message.split(`{${name}}`).join(String(replacement)),
          template,
        );
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
