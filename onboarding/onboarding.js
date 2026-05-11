import { getSettings, updateSettings } from '../utils/storage.js';
import { applyI18nAttributes, getTranslator } from '../utils/i18n.js';

// ── State ──────────────────────────────────────────────────────────────
let selectedPref = null;
let currentSlide = 0;
let i18n = null;

const flow = ['slide-1', 'slide-2'];

// ── DOM refs ───────────────────────────────────────────────────────────
const slidesEl  = document.getElementById('slides');
const dotsEl    = document.getElementById('dots');
const btnNext   = document.getElementById('btn-next');
const btnBack   = document.getElementById('btn-back');
const pinArrow  = document.getElementById('pin-arrow');
const themeBtn  = document.getElementById('theme-btn');
const moonIcon  = document.getElementById('theme-icon-moon');
const sunIcon   = document.getElementById('theme-icon-sun');
const customSub = document.getElementById('custom-sub');

// ── Theme ──────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  moonIcon.classList.toggle('hidden', theme === 'dark');
  sunIcon.classList.toggle('hidden', theme !== 'dark');
  themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  try { localStorage.setItem('emc-theme', theme); } catch (_) {}
}

function initTheme() {
  let saved;
  try { saved = localStorage.getItem('emc-theme'); } catch (_) {}
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ?? (prefersDark ? 'dark' : 'light'));
}

themeBtn.addEventListener('click', () => {
  applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
});

// ── Dots ───────────────────────────────────────────────────────────────
function renderDots() {
  dotsEl.innerHTML = '';
  flow.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'dot' + (i === currentSlide ? ' active' : '');
    dotsEl.appendChild(dot);
  });
}

// ── Navigation ─────────────────────────────────────────────────────────
function goTo(index) {
  currentSlide = index;
  slidesEl.style.transform = `translateX(-${index * 100}%)`;

  const isFirst = currentSlide === 0;
  const isLast  = currentSlide === flow.length - 1;

  btnBack.classList.toggle('hidden', isFirst);
  btnNext.textContent = isLast ? i18n.t('onboardingDone') : i18n.t('onboardingNext');
  btnNext.disabled = isFirst && !selectedPref;

  pinArrow.classList.toggle('visible', isLast);
  renderDots();
}

btnNext.addEventListener('click', () => {
  if (currentSlide < flow.length - 1) {
    goTo(currentSlide + 1);
  } else {
    finish();
  }
});

btnBack.addEventListener('click', () => {
  if (currentSlide > 0) goTo(currentSlide - 1);
});

// ── Preference selection ───────────────────────────────────────────────
function selectPref(value) {
  selectedPref = value;

  customSub.classList.toggle('visible', value === 'custom');

  if (value !== 'custom') {
    document.getElementById('t-ccpa').checked = (value !== 'accept_all');
  }

  btnNext.disabled = false;
  renderDots();
}

// ── Finish ─────────────────────────────────────────────────────────────
async function finish() {
  if (!selectedPref) return;

  const isCustom = selectedPref === 'custom';

  const categoryPreferences = {
    functional:    isCustom ? document.getElementById('t-functional').checked   : true,
    analytics:     isCustom ? document.getElementById('t-analytics').checked    : false,
    advertising:   isCustom ? document.getElementById('t-advertising').checked  : false,
    uncategorized: isCustom ? document.getElementById('t-uncategorized').value   : 'reject',
    ccpaDoNotSell: document.getElementById('t-ccpa').checked,
  };

  await updateSettings({
    globalPreference:   selectedPref,
    onboardingComplete: true,
    showBadgeCount:     document.getElementById('t-badge').checked,
    uiLanguage:         document.getElementById('t-language').value,
    categoryPreferences,
  });

  window.close();
}

async function applyLocale(preferredLanguage = 'auto') {
  i18n = await getTranslator(preferredLanguage);
  document.documentElement.lang = i18n.locale;
  applyI18nAttributes(document, i18n.t);
  document.title = i18n.t('onboardingPageTitle');
  goTo(currentSlide);
}

// ── Init ───────────────────────────────────────────────────────────────
async function init() {
  initTheme();

  const settings = await getSettings();
  const languageSelect = document.getElementById('t-language');

  await applyLocale(settings.uiLanguage ?? 'auto');

  if (settings.uiLanguage) {
    languageSelect.value = settings.uiLanguage;
  }

  languageSelect.addEventListener('change', async () => {
    await applyLocale(languageSelect.value);
  });

  document.querySelectorAll('input[name="pref"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) selectPref(radio.value);
    });
  });

  if (settings.globalPreference) {
    const radio = document.querySelector(`input[name="pref"][value="${settings.globalPreference}"]`);
    if (radio) {
      radio.checked = true;
      selectPref(settings.globalPreference);
    }
  }

  goTo(0);
}

init();
