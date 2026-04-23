import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Use dynamic imports or local JSON files for translations
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import fr from '../../locales/fr.json';
import de from '../../locales/de.json';
import ru from '../../locales/ru.json';
import zh from '../../locales/zh.json';
import ja from '../../locales/ja.json';
import pt from '../../locales/pt.json';
import it from '../../locales/it.json';
import ko from '../../locales/ko.json';
import pl from '../../locales/pl.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      de: { translation: de },
      ru: { translation: ru },
      zh: { translation: zh },
      ja: { translation: ja },
      pt: { translation: pt },
      it: { translation: it },
      ko: { translation: ko },
      pl: { translation: pl }
    },
    lng: 'en', // Default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes values
    }
  });

export default i18n;
