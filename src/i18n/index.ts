import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import de from './locales/de.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import pl from './locales/pl.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import pt from './locales/pt.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import ru from './locales/ru.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    pl: { translation: pl },
    es: { translation: es },
    fr: { translation: fr },
    it: { translation: it },
    pt: { translation: pt },
    ja: { translation: ja },
    ko: { translation: ko },
    ru: { translation: ru },
  },
  // Detect the initial language: user's saved choice first, then the system
  // locale, falling back to English. `useAppInitialization` later applies the
  // persisted setting, but using the right value here avoids a flash of the
  // wrong language (e.g. forcing Chinese on non-Chinese users) on first paint.
  lng: (() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('i18nextLng') : null;
      if (saved) return saved;
      if (typeof navigator !== 'undefined') {
        const lang = navigator.language || (navigator as { userLanguage?: string }).userLanguage;
        if (lang) return lang.replace('_', '-');
      }
    } catch (_e) {
      // localStorage/navigator unavailable — fall through to English
    }
    return 'en';
  })(),
  fallbackLng: 'en',
  // Treat empty string values as missing so that incomplete plural variants
  // (e.g. key_many: "") fall back to key_other / base form instead of
  // rendering as blank text.
  returnEmptyString: false,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
