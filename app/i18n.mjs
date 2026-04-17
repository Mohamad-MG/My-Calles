import en from "./locales/en.mjs";
import ar from "./locales/ar.mjs";

const LOCALES = { en, ar };

function getLocaleConfig(locale = "en") {
  return LOCALES[locale] || LOCALES.en;
}

export { getLocaleConfig };
