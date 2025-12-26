const i18n = {
  currentLang: 'en',
  translations: {},
  supportedLanguages: [
    { code: 'en', name: 'English' },
    { code: 'de', name: 'Deutsch' },
    { code: 'fr', name: 'Français' },
    { code: 'ja', name: '日本語' },
    { code: 'es', name: 'Español' },
    { code: 'zh', name: '中文' },
    { code: 'ru', name: 'Русский' },
    { code: 'hi', name: 'हिन्दी' }
  ],

  async init() {
    const savedLang = localStorage.getItem('preferredLanguage');
    if (savedLang && this.supportedLanguages.some(lang => lang.code === savedLang)) {
      this.currentLang = savedLang;
    }
    await this.loadTranslations(this.currentLang);
    this.updateDOM();
    this.setupLanguageSelector();
  },

  async loadTranslations(lang) {
    try {
      const response = await fetch(`locales/${lang}.json`);
      this.translations = await response.json();
    } catch (error) {
      console.error(`Failed to load translations for ${lang}:`, error);
      if (lang !== 'en') {
        await this.loadTranslations('en');
      }
    }
  },

  async setLanguage(lang) {
    if (!this.supportedLanguages.some(l => l.code === lang)) return;
    
    this.currentLang = lang;
    localStorage.setItem('preferredLanguage', lang);
    await this.loadTranslations(lang);
    this.updateDOM();
  },

  t(key, params = {}) {
    let text = this.translations[key] || key;
    
    Object.keys(params).forEach(param => {
      text = text.replace(`{{${param}}}`, params[param]);
    });
    
    return text;
  },

  updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.t(key);
    });
    
    if (typeof updateRiskLevelDisplay === 'function' && typeof currentPurityScore === 'number') {
      updateRiskLevelDisplay(currentPurityScore);
    }
  },

  setupLanguageSelector() {
    const selector = document.getElementById('languageSelector');
    if (!selector) return;

    this.supportedLanguages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      if (lang.code === this.currentLang) {
        option.selected = true;
      }
      selector.appendChild(option);
    });

    selector.addEventListener('change', (e) => {
      this.setLanguage(e.target.value);
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  i18n.init();
});
