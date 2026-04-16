import en from "./locales/en.mjs";
import ar from "./locales/ar.mjs";

const LOCALES = { en, ar };

function getV2LocaleConfig(locale = "en") {
  return LOCALES[locale] || LOCALES.en;
}

export { getV2LocaleConfig };
