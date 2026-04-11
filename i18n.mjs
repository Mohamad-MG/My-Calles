import { STORAGE_KEY } from "./logic.mjs";
import enLocale from "./locales/en.mjs";
import arLocale from "./locales/ar.mjs";

const LOCALES = {
  en: enLocale,
  ar: arLocale,
};

const DEFAULT_LOCALE = "en";

function resolveLocale(locale) {
  return LOCALES[locale] ? locale : DEFAULT_LOCALE;
}

function getLocaleConfig(locale = DEFAULT_LOCALE) {
  return LOCALES[resolveLocale(locale)];
}

function getStorageKey(locale = DEFAULT_LOCALE) {
  return `${STORAGE_KEY}.${resolveLocale(locale)}`;
}

function getDisplayLabelMaps(locale = DEFAULT_LOCALE) {
  return getLocaleConfig(locale).display;
}

function getLocaleSeedFactory(locale = DEFAULT_LOCALE) {
  return getLocaleConfig(locale).seed.factory;
}

export {
  DEFAULT_LOCALE,
  getDisplayLabelMaps,
  getLocaleConfig,
  getLocaleSeedFactory,
  getStorageKey,
};
