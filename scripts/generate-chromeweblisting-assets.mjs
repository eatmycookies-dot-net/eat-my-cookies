import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXT_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(EXT_ROOT, "chromeweblisting");

const BRAND = {
  bg: "#f6f2ea",
  surface: "#fffdf9",
  text: "#231815",
  text2: "#6c5c4f",
  accent: "#c96f24",
  accentWarm: "#e49b41",
  border: "#eadbc7",
};

const POPUP_ROUTE = "/popup/popup.html";
const ONBOARDING_ROUTE = "/onboarding/onboarding.html";
const ICON_PATH = path.join(EXT_ROOT, "icons", "icon-128.png");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const iconDataUrl = toDataUrl(ICON_PATH);
const LOCALES = {
  en: {
    code: "en",
    detectedLanguage: "en-US",
    dirName: null,
    titlePrefix: "Global",
    screenshots: [
      {
        file: "global-screenshot-1-popup-main.png",
        title: "Set your consent policy once.",
        subtitle: "Track handled banners, keep a clear preference, and see what Eat My Cookies is doing at a glance.",
        rawKey: "popupMain",
        align: "right",
      },
      {
        file: "global-screenshot-2-custom-settings.png",
        title: "Customize by category.",
        subtitle: "Control Functional, Analytics, Advertising, uncategorized purposes, language, and the CCPA do-not-sell signal from one settings view.",
        rawKey: "popupSettings",
        align: "left",
      },
      {
        file: "global-screenshot-3-transparent-warning.png",
        title: "Transparent when a site needs help.",
        subtitle: "If a flow cannot be safely completed, the extension shows a real warning instead of pretending your choice was applied.",
        rawKey: "popupWarning",
        align: "right",
      },
      {
        file: "global-screenshot-4-onboarding-preferences.png",
        title: "Choose privacy rules on day one.",
        subtitle: "Onboarding lets users set language, Reject All, Accept All, or Custom choices before browsing.",
        rawKey: "onboardingPreferences",
        align: "left",
      },
      {
        file: "global-screenshot-5-pin-to-toolbar.png",
        title: "Pin it and keep it close.",
        subtitle: "The extension guides users to pin Eat My Cookies so preferences and site controls stay one click away.",
        rawKey: "onboardingPin",
        align: "right",
      },
    ],
    promo: {
      small: {
        file: "small-promo-tile-440x280.png",
        title: "Consent choices. Applied automatically.",
        subtitle: "Reject all, accept all, or customize categories in one privacy-first extension.",
        rawKey: "popupSettings",
      },
      marquee: {
        file: "marquee-promo-tile-1400x560.png",
        title: "Your consent policy for the whole web.",
        subtitle: "Eat My Cookies uses native CMP APIs, honest warnings, and per-site controls to automate banner handling.",
        rawKey: "popupMain",
      },
    },
  },
  fr: {
    code: "fr",
    detectedLanguage: "fr-FR",
    dirName: "fr",
    titlePrefix: "French",
    screenshots: [
      {
        file: "screenshot-1-popup-main-fr.png",
        title: "Définissez votre règle de consentement une fois.",
        subtitle: "Suivez les bannières traitées, gardez une préférence claire et voyez en un coup d'oeil ce que fait Eat My Cookies.",
        rawKey: "popupMain",
        align: "right",
      },
      {
        file: "screenshot-2-custom-settings-fr.png",
        title: "Personnalisez par catégorie.",
        subtitle: "Contrôlez les finalités fonctionnelles, analytiques, publicitaires, non catégorisées, la langue et le signal CCPA depuis un seul écran.",
        rawKey: "popupSettings",
        align: "left",
      },
      {
        file: "screenshot-3-warning-fr.png",
        title: "Transparent quand un site demande plus d'aide.",
        subtitle: "Si un parcours ne peut pas être traité en toute sécurité, l'extension affiche un vrai avertissement au lieu de prétendre que votre choix a été appliqué.",
        rawKey: "popupWarning",
        align: "right",
      },
      {
        file: "screenshot-4-onboarding-preferences-fr.png",
        title: "Choisissez vos règles de confidentialité dès le départ.",
        subtitle: "L'onboarding permet de définir la langue, Tout refuser, Tout accepter ou des choix personnalisés avant de naviguer.",
        rawKey: "onboardingPreferences",
        align: "left",
      },
      {
        file: "screenshot-5-pin-to-toolbar-fr.png",
        title: "Épinglez-la et gardez-la à portée de clic.",
        subtitle: "L'extension guide l'utilisateur pour épingler Eat My Cookies afin que les préférences et contrôles par site restent à un clic.",
        rawKey: "onboardingPin",
        align: "right",
      },
    ],
  },
  de: {
    code: "de",
    detectedLanguage: "de-DE",
    dirName: "de",
    titlePrefix: "German",
    screenshots: [
      {
        file: "screenshot-1-popup-main-de.png",
        title: "Lege deine Einwilligungsregel einmal fest.",
        subtitle: "Behalte bearbeitete Banner im Blick, halte eine klare Einstellung fest und sieh sofort, was Eat My Cookies gerade macht.",
        rawKey: "popupMain",
        align: "right",
      },
      {
        file: "screenshot-2-custom-settings-de.png",
        title: "Nach Kategorie anpassen.",
        subtitle: "Steuere funktionale, analytische, werbliche und nicht kategorisierte Zwecke, die Sprache und das CCPA-Signal in einer einzigen Ansicht.",
        rawKey: "popupSettings",
        align: "left",
      },
      {
        file: "screenshot-3-warning-de.png",
        title: "Transparent, wenn eine Website zusätzliche Hilfe braucht.",
        subtitle: "Wenn ein Ablauf nicht sicher abgeschlossen werden kann, zeigt die Erweiterung eine echte Warnung statt nur vorzugeben, dass deine Wahl angewendet wurde.",
        rawKey: "popupWarning",
        align: "right",
      },
      {
        file: "screenshot-4-onboarding-preferences-de.png",
        title: "Lege Datenschutzregeln von Anfang an fest.",
        subtitle: "Im Onboarding können Nutzer Sprache, Alle ablehnen, Alle akzeptieren oder benutzerdefinierte Optionen festlegen, bevor sie lossurfen.",
        rawKey: "onboardingPreferences",
        align: "left",
      },
      {
        file: "screenshot-5-pin-to-toolbar-de.png",
        title: "Anheften und griffbereit halten.",
        subtitle: "Die Erweiterung zeigt, wie man Eat My Cookies an die Symbolleiste anheftet, damit Präferenzen und Website-Steuerungen nur einen Klick entfernt bleiben.",
        rawKey: "onboardingPin",
        align: "right",
      },
    ],
  },
  it: {
    code: "it",
    detectedLanguage: "it-IT",
    dirName: "it",
    titlePrefix: "Italian",
    screenshots: [
      {
        file: "screenshot-1-popup-main-it.png",
        title: "Imposta una sola volta la tua regola di consenso.",
        subtitle: "Tieni traccia dei banner gestiti, mantieni una preferenza chiara e vedi subito cosa sta facendo Eat My Cookies.",
        rawKey: "popupMain",
        align: "right",
      },
      {
        file: "screenshot-2-custom-settings-it.png",
        title: "Personalizza per categoria.",
        subtitle: "Controlla finalità funzionali, analitiche, pubblicitarie e non categorizzate, lingua e segnale CCPA da un'unica schermata.",
        rawKey: "popupSettings",
        align: "left",
      },
      {
        file: "screenshot-3-warning-it.png",
        title: "Trasparente quando un sito richiede più attenzione.",
        subtitle: "Se un flusso non può essere completato in sicurezza, l'estensione mostra un avviso reale invece di fingere che la scelta sia stata applicata.",
        rawKey: "popupWarning",
        align: "right",
      },
      {
        file: "screenshot-4-onboarding-preferences-it.png",
        title: "Scegli le regole privacy fin dal primo giorno.",
        subtitle: "L'onboarding permette di impostare lingua, Rifiuta tutto, Accetta tutto o scelte personalizzate prima di iniziare a navigare.",
        rawKey: "onboardingPreferences",
        align: "left",
      },
      {
        file: "screenshot-5-pin-to-toolbar-it.png",
        title: "Fissala e tienila sempre a portata di clic.",
        subtitle: "L'estensione guida l'utente a fissare Eat My Cookies alla barra per avere preferenze e controlli per sito sempre a un clic.",
        rawKey: "onboardingPin",
        align: "right",
      },
    ],
  },
  es: {
    code: "es",
    detectedLanguage: "es-ES",
    dirName: "es",
    titlePrefix: "Spanish",
    screenshots: [
      {
        file: "screenshot-1-popup-main-es.png",
        title: "Define tu política de consentimiento una sola vez.",
        subtitle: "Sigue los banners gestionados, mantén una preferencia clara y ve de un vistazo lo que está haciendo Eat My Cookies.",
        rawKey: "popupMain",
        align: "right",
      },
      {
        file: "screenshot-2-custom-settings-es.png",
        title: "Personaliza por categoría.",
        subtitle: "Controla finalidades funcionales, analíticas, publicitarias y no categorizadas, el idioma y la señal CCPA desde una sola pantalla.",
        rawKey: "popupSettings",
        align: "left",
      },
      {
        file: "screenshot-3-warning-es.png",
        title: "Transparente cuando un sitio necesita más ayuda.",
        subtitle: "Si un flujo no puede completarse de forma segura, la extensión muestra una advertencia real en lugar de fingir que tu elección se aplicó.",
        rawKey: "popupWarning",
        align: "right",
      },
      {
        file: "screenshot-4-onboarding-preferences-es.png",
        title: "Elige tus reglas de privacidad desde el primer día.",
        subtitle: "La introducción permite configurar el idioma, Rechazar todo, Aceptar todo o elecciones personalizadas antes de navegar.",
        rawKey: "onboardingPreferences",
        align: "left",
      },
      {
        file: "screenshot-5-pin-to-toolbar-es.png",
        title: "Fíjala y mantenla siempre cerca.",
        subtitle: "La extensión guía al usuario para fijar Eat My Cookies en la barra y dejar preferencias y controles por sitio a un solo clic.",
        rawKey: "onboardingPin",
        align: "right",
      },
    ],
  },
  "pt-BR": {
    code: "pt-BR",
    detectedLanguage: "pt-BR",
    dirName: "pt-BR",
    titlePrefix: "Portuguese (Brazil)",
    screenshots: [
      {
        file: "screenshot-1-popup-main-pt-BR.png",
        title: "Defina sua política de consentimento uma vez só.",
        subtitle: "Acompanhe os banners tratados, mantenha uma preferência clara e veja rapidamente o que o Eat My Cookies está fazendo.",
        rawKey: "popupMain",
        align: "right",
      },
      {
        file: "screenshot-2-custom-settings-pt-BR.png",
        title: "Personalize por categoria.",
        subtitle: "Controle finalidades funcionais, analíticas, publicitárias e não categorizadas, o idioma e o sinal da CCPA em uma única tela.",
        rawKey: "popupSettings",
        align: "left",
      },
      {
        file: "screenshot-3-warning-pt-BR.png",
        title: "Transparente quando um site precisa de ajuda extra.",
        subtitle: "Se um fluxo não puder ser concluído com segurança, a extensão mostra um aviso real em vez de fingir que sua escolha foi aplicada.",
        rawKey: "popupWarning",
        align: "right",
      },
      {
        file: "screenshot-4-onboarding-preferences-pt-BR.png",
        title: "Escolha suas regras de privacidade desde o primeiro dia.",
        subtitle: "A introdução permite definir idioma, Rejeitar tudo, Aceitar tudo ou escolhas personalizadas antes de começar a navegar.",
        rawKey: "onboardingPreferences",
        align: "left",
      },
      {
        file: "screenshot-5-pin-to-toolbar-pt-BR.png",
        title: "Fixe e mantenha sempre por perto.",
        subtitle: "A extensão orienta o usuário a fixar o Eat My Cookies na barra para deixar preferências e controles por site a um clique.",
        rawKey: "onboardingPin",
        align: "right",
      },
    ],
  },
  "pt-PT": {
    code: "pt-PT",
    detectedLanguage: "pt-PT",
    dirName: "pt-PT",
    titlePrefix: "Portuguese (Portugal)",
    screenshots: [
      {
        file: "screenshot-1-popup-main-pt-PT.png",
        title: "Defina a sua política de consentimento uma vez só.",
        subtitle: "Acompanhe os banners tratados, mantenha uma preferência clara e veja rapidamente o que o Eat My Cookies está a fazer.",
        rawKey: "popupMain",
        align: "right",
      },
      {
        file: "screenshot-2-custom-settings-pt-PT.png",
        title: "Personalize por categoria.",
        subtitle: "Controle finalidades funcionais, analíticas, publicitárias e não categorizadas, a língua e o sinal CCPA numa única vista.",
        rawKey: "popupSettings",
        align: "left",
      },
      {
        file: "screenshot-3-warning-pt-PT.png",
        title: "Transparente quando um site precisa de ajuda extra.",
        subtitle: "Se um fluxo não puder ser concluído em segurança, a extensão mostra um aviso real em vez de fingir que a sua escolha foi aplicada.",
        rawKey: "popupWarning",
        align: "right",
      },
      {
        file: "screenshot-4-onboarding-preferences-pt-PT.png",
        title: "Escolha as suas regras de privacidade desde o primeiro dia.",
        subtitle: "O onboarding permite definir a língua, Rejeitar tudo, Aceitar tudo ou escolhas personalizadas antes de começar a navegar.",
        rawKey: "onboardingPreferences",
        align: "left",
      },
      {
        file: "screenshot-5-pin-to-toolbar-pt-PT.png",
        title: "Fixe-a e mantenha-a sempre por perto.",
        subtitle: "A extensão orienta o utilizador a fixar o Eat My Cookies na barra para manter preferências e controlos por site a um clique.",
        rawKey: "onboardingPin",
        align: "right",
      },
    ],
  },
};

function isoMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function outputDirForLocale(localeConfig) {
  return localeConfig.dirName ? path.join(OUT_DIR, "localized", localeConfig.dirName) : OUT_DIR;
}

function rawDirForLocale(localeConfig) {
  return path.join(outputDirForLocale(localeConfig), "raw");
}

function expectedDocumentLanguageTag(localeConfig) {
  return localeConfig.code.toLowerCase();
}

function toDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";
  const base64 = fs.readFileSync(filePath).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

function startStaticServer(rootDir) {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const normalized = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    let filePath = path.join(rootDir, normalized);

    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
    } catch (_) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "content-type": MIME_TYPES[ext] ?? "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done())),
      });
    });
  });
}

function popupState(overrides = {}) {
  const base = {
    syncState: {
      globalPreference: "reject_all",
      categoryPreferences: {
        functional: true,
        analytics: false,
        advertising: false,
        ccpaDoNotSell: true,
        uncategorized: "reject",
      },
      uiLanguage: "en",
      showBadgeCount: true,
      onboardingComplete: true,
      milestonesShown: ["first-bite", "cookie-crusher", "bakers-dozen"],
      installDate: "2026-05-01T00:00:00.000Z",
    },
    localState: {
      stats: {
        totalActionsCount: 1284,
        sitesHandled: 314,
        handledSites: ["latimes.com", "bbc.com", "ft.com"],
        lastActionDate: isoMinutesAgo(3),
        lastActionSite: "www.latimes.com",
        recentActivity: [
          { site: "www.latimes.com", preference: "reject_all", method: "cmp_api:OneTrust", timestamp: isoMinutesAgo(3) },
          { site: "www.bbc.com", preference: "reject_all", method: "cmp_api:Sourcepoint", timestamp: isoMinutesAgo(18) },
          { site: "www.ft.com", preference: "custom", method: "cmp_api:Sourcepoint", timestamp: isoMinutesAgo(41) },
          { site: "www.disney.com", preference: "ccpa_handled", method: "cmp_api:OneTrust:usnat", timestamp: isoMinutesAgo(67) },
        ],
      },
      siteOverrides: {},
      unsupportedSites: {},
      pendingMilestones: [],
    },
    currentTabUrl: "https://www.latimes.com/",
    popupView: "main",
    theme: "light",
  };
  return {
    ...base,
    ...overrides,
    syncState: {
      ...base.syncState,
      ...(overrides.syncState ?? {}),
      categoryPreferences: {
        ...base.syncState.categoryPreferences,
        ...(overrides.syncState?.categoryPreferences ?? {}),
      },
    },
    localState: {
      ...base.localState,
      ...(overrides.localState ?? {}),
      stats: {
        ...base.localState.stats,
        ...(overrides.localState?.stats ?? {}),
      },
      siteOverrides: {
        ...base.localState.siteOverrides,
        ...(overrides.localState?.siteOverrides ?? {}),
      },
      unsupportedSites: {
        ...base.localState.unsupportedSites,
        ...(overrides.localState?.unsupportedSites ?? {}),
      },
    },
  };
}

function onboardingState(overrides = {}) {
  const base = {
    settings: {
      globalPreference: null,
      categoryPreferences: {
        functional: true,
        analytics: false,
        advertising: false,
        ccpaDoNotSell: true,
        uncategorized: "reject",
      },
      uiLanguage: "auto",
      showBadgeCount: true,
      onboardingComplete: false,
    },
    theme: "light",
  };
  return {
    ...base,
    ...overrides,
    settings: {
      ...base.settings,
      ...(overrides.settings ?? {}),
      categoryPreferences: {
        ...base.settings.categoryPreferences,
        ...(overrides.settings?.categoryPreferences ?? {}),
      },
    },
  };
}

async function createBrowser() {
  return chromium.launch({ headless: true });
}

async function newPopupPage(browser, server, state) {
  const page = await browser.newPage({
    viewport: { width: 460, height: 820 },
    deviceScaleFactor: 2,
  });

  const snapshot = clone(state);
  await page.addInitScript((input) => {
    const listeners = [];
    const syncState = input.syncState;
    const localState = input.localState;
    const currentTabUrl = input.currentTabUrl;
    const detectedLanguage = input.detectedLanguage ?? "en-US";

    const cloneValue = (value) => JSON.parse(JSON.stringify(value));
    const mergeDefaults = (defaults, state) => Object.assign({}, cloneValue(defaults), cloneValue(state));

    const emitChange = (areaName, changes) => {
      for (const listener of listeners) listener(changes, areaName);
    };

    try {
      localStorage.setItem("emc-theme", input.theme ?? "light");
      if (input.popupView === "settings") {
        sessionStorage.setItem("emc-popup-view", "settings");
      } else {
        sessionStorage.removeItem("emc-popup-view");
      }
    } catch (_) {}

    window.chrome = {
      i18n: {
        getUILanguage: () => syncState.uiLanguage === "auto" ? detectedLanguage : syncState.uiLanguage,
      },
      runtime: {
        getURL: (assetPath) => {
          const root = window.location.href.replace(/popup\/popup\.html.*$/, "");
          return `${root}${assetPath}`;
        },
        getManifest: () => ({ version: "1.0.0" }),
        sendMessage: async (message) => {
          if (message.type === "CLEAR_RECENT_ACTIVITY") {
            localState.stats.recentActivity = [];
            emitChange("local", { stats: { newValue: cloneValue(localState.stats) } });
            return { ok: true };
          }
          return { ok: true };
        },
      },
      tabs: {
        query: async () => [{ id: 1, url: currentTabUrl }],
        reload: async () => {},
        create: async () => {},
      },
      storage: {
        onChanged: {
          addListener(listener) {
            listeners.push(listener);
          },
        },
        sync: {
          async get(defaults = {}) {
            return mergeDefaults(defaults, syncState);
          },
          async set(updates) {
            Object.assign(syncState, cloneValue(updates));
            const changes = {};
            for (const [key, value] of Object.entries(updates)) {
              changes[key] = { newValue: cloneValue(value) };
            }
            emitChange("sync", changes);
          },
        },
        local: {
          async get(defaults = {}) {
            return mergeDefaults(defaults, localState);
          },
          async set(updates) {
            Object.assign(localState, cloneValue(updates));
            const changes = {};
            for (const [key, value] of Object.entries(updates)) {
              changes[key] = { newValue: cloneValue(value) };
            }
            emitChange("local", changes);
          },
        },
      },
    };
  }, snapshot);

  await page.goto(`${server.origin}${POPUP_ROUTE}?siteUrl=${encodeURIComponent(snapshot.currentTabUrl)}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.getElementById("total-count")?.textContent?.trim() !== "—");
  if (snapshot.popupView === "settings") {
    await page.waitForFunction(() => !document.getElementById("settings-view").classList.contains("hidden"));
  }
  return page;
}

async function newOnboardingPage(browser, server, state) {
  const page = await browser.newPage({
    viewport: { width: 1080, height: 940 },
    deviceScaleFactor: 2,
  });

  const snapshot = clone(state);
  await page.addInitScript((input) => {
    try {
      localStorage.setItem("emc-theme", input.theme ?? "light");
    } catch (_) {}

    const syncState = input.settings;
    const detectedLanguage = input.detectedLanguage ?? "en-US";
    const cloneValue = (value) => JSON.parse(JSON.stringify(value));

    window.chrome = {
      i18n: {
        getUILanguage: () => syncState.uiLanguage === "auto" ? detectedLanguage : syncState.uiLanguage,
      },
      runtime: {
        getURL: (assetPath) => {
          const root = window.location.href.replace(/onboarding\/onboarding\.html.*$/, "");
          return `${root}${assetPath}`;
        },
      },
      storage: {
        sync: {
          async get(defaults = {}) {
            return Object.assign({}, cloneValue(defaults), cloneValue(syncState));
          },
          async set(updates) {
            Object.assign(syncState, cloneValue(updates));
          },
        },
      },
    };
  }, snapshot);

  await page.goto(`${server.origin}${ONBOARDING_ROUTE}`, { waitUntil: "load" });
  await page.waitForSelector("#slide-1");
  await page.waitForFunction(
    (expectedLang) => document.documentElement.lang === expectedLang,
    expectedDocumentLanguageTag(snapshot.localeConfig),
  );
  return page;
}

async function saveLocatorShot(locator, targetPath) {
  await locator.screenshot({ path: targetPath });
}

async function selectOnboardingPreference(page, value) {
  await page.evaluate((prefValue) => {
    const input = document.querySelector(`input[name="pref"][value="${prefValue}"]`);
    if (!input) throw new Error(`Missing onboarding preference: ${prefValue}`);
    input.checked = true;
    const customSub = document.getElementById("custom-sub");
    const nextButton = document.getElementById("btn-next");
    if (customSub) {
      customSub.classList.toggle("visible", prefValue === "custom");
    }
    if (nextButton) {
      nextButton.disabled = false;
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

function compositionHtml({ title, subtitle, imagePath, align = "right" }) {
  const imageUrl = toDataUrl(imagePath);
  const contentDirection = align === "left" ? "row-reverse" : "row";
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background:
            radial-gradient(circle at 20% 15%, rgba(228, 155, 65, 0.18), transparent 34%),
            radial-gradient(circle at 82% 84%, rgba(201, 111, 36, 0.12), transparent 28%),
            ${BRAND.bg};
          color: ${BRAND.text};
        }
        .frame {
          width: 1280px;
          height: 800px;
          padding: 58px 70px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 38px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
          font-weight: 800;
          font-size: 28px;
        }
        .brand img {
          width: 40px;
          height: 40px;
        }
        .hero {
          display: flex;
          flex-direction: ${contentDirection};
          align-items: center;
          gap: 42px;
          min-height: 540px;
        }
        .copy {
          flex: 1 1 42%;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .eyebrow {
          font-size: 15px;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          font-weight: 800;
          color: ${BRAND.accentWarm};
        }
        h1 {
          margin: 0;
          font-size: 62px;
          line-height: 0.98;
          letter-spacing: -0.03em;
        }
        p {
          margin: 0;
          font-size: 28px;
          line-height: 1.28;
          color: ${BRAND.text2};
          max-width: 520px;
        }
        .shot-wrap {
          flex: 1 1 58%;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100%;
        }
        .shot-frame {
          width: 100%;
          max-width: 720px;
          background: ${BRAND.surface};
          border: 1px solid ${BRAND.border};
          border-radius: 28px;
          box-shadow: 0 28px 80px rgba(74, 46, 16, 0.16);
          overflow: hidden;
          padding: 18px;
        }
        .shot-frame img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 18px;
        }
      </style>
    </head>
    <body>
      <div class="frame">
        <div class="brand">
          <img src="${iconDataUrl}" alt="" />
          <span>Eat My Cookies</span>
        </div>
        <div class="hero">
          <div class="copy">
            <div class="eyebrow">Chrome extension</div>
            <h1>${title}</h1>
            <p>${subtitle}</p>
          </div>
          <div class="shot-wrap">
            <div class="shot-frame">
              <img src="${imageUrl}" alt="" />
            </div>
          </div>
        </div>
      </div>
    </body>
  </html>`;
}

function promoTileHtml({ title, subtitle, imagePath, width, height }) {
  const imageUrl = toDataUrl(imagePath);
  const isWide = width >= 1000;
  const titleSize = isWide ? 40 : 24;
  const bodySize = isWide ? 18 : 12;
  const iconSize = width >= 1000 ? 42 : 28;
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          width: ${width}px;
          height: ${height}px;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background:
            radial-gradient(circle at 15% 20%, rgba(228, 155, 65, 0.2), transparent 32%),
            linear-gradient(135deg, #fffdf9 0%, #f6f2ea 100%);
          color: ${BRAND.text};
        }
        .frame {
          width: 100%;
          height: 100%;
          padding: ${isWide ? 22 : 14}px;
          display: grid;
          grid-template-columns: ${isWide ? "1.05fr 0.95fr" : "0.95fr 1.05fr"};
          gap: ${isWide ? 22 : 12}px;
          align-items: ${isWide ? "center" : "start"};
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: ${width >= 1000 ? 22 : 14}px;
          font-weight: 800;
          margin-bottom: ${width >= 1000 ? 10 : 6}px;
        }
        .brand img {
          width: ${iconSize}px;
          height: ${iconSize}px;
        }
        h1 {
          margin: 0 0 6px 0;
          font-size: ${titleSize}px;
          line-height: ${isWide ? "1.02" : "0.96"};
          letter-spacing: -0.03em;
          max-width: ${isWide ? "520px" : "170px"};
        }
        p {
          margin: 0;
          color: ${BRAND.text2};
          font-size: ${bodySize}px;
          line-height: ${isWide ? "1.24" : "1.16"};
          max-width: ${isWide ? "500px" : "156px"};
        }
        .shot {
          background: white;
          border-radius: ${width >= 1000 ? 24 : 16}px;
          border: 1px solid ${BRAND.border};
          box-shadow: 0 20px 50px rgba(74, 46, 16, 0.14);
          padding: ${width >= 1000 ? 12 : 6}px;
          transform: none;
          max-width: ${isWide ? "500px" : "212px"};
          justify-self: end;
        }
        .shot img {
          width: 100%;
          display: block;
          border-radius: ${width >= 1000 ? 16 : 10}px;
        }
      </style>
    </head>
    <body>
      <div class="frame">
        <div>
          <div class="brand">
            <img src="${iconDataUrl}" alt="" />
            <span>Eat My Cookies</span>
          </div>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
        <div class="shot">
          <img src="${imageUrl}" alt="" />
        </div>
      </div>
    </body>
  </html>`;
}

async function renderHtmlShot(browser, html, size, targetPath) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: targetPath });
  await page.close();
}

async function generateRawShots(browser, server, localeConfig) {
  const files = {};
  const rawDir = rawDirForLocale(localeConfig);
  fs.mkdirSync(rawDir, { recursive: true });

  {
    const page = await newPopupPage(browser, server, popupState({
      detectedLanguage: localeConfig.detectedLanguage,
      syncState: {
        uiLanguage: "auto",
      },
    }));
    const target = path.join(rawDir, "popup-main.png");
    await saveLocatorShot(page.locator("#main-view"), target);
    files.popupMain = target;
    await page.close();
  }

  {
    const page = await newPopupPage(browser, server, popupState({
      detectedLanguage: localeConfig.detectedLanguage,
      popupView: "settings",
      syncState: {
        globalPreference: "custom",
        categoryPreferences: {
          functional: true,
          analytics: true,
          advertising: false,
          ccpaDoNotSell: true,
          uncategorized: "accept",
        },
        uiLanguage: "auto",
        showBadgeCount: true,
        onboardingComplete: true,
        milestonesShown: ["first-bite", "cookie-crusher", "bakers-dozen"],
        installDate: "2026-05-01T00:00:00.000Z",
      },
    }));
    const target = path.join(rawDir, "popup-settings-custom.png");
    await saveLocatorShot(page.locator("#settings-view"), target);
    files.popupSettings = target;
    await page.close();
  }

  {
    const page = await newPopupPage(browser, server, popupState({
      detectedLanguage: localeConfig.detectedLanguage,
      syncState: {
        uiLanguage: "auto",
      },
      localState: {
        stats: {
          totalActionsCount: 1284,
          sitesHandled: 314,
          handledSites: ["example.com"],
          lastActionDate: isoMinutesAgo(3),
          lastActionSite: "www.example.com",
          recentActivity: [
            { site: "www.example.com", preference: "reject_all", method: "cmp_api:OneTrust", timestamp: isoMinutesAgo(3) },
          ],
        },
        siteOverrides: {},
        unsupportedSites: {
          "www.example.com": {
            allowAcceptOverride: true,
          },
        },
        pendingMilestones: [],
      },
      currentTabUrl: "https://www.example.com/",
    }));
    const target = path.join(rawDir, "popup-warning.png");
    await saveLocatorShot(page.locator("#main-view"), target);
    files.popupWarning = target;
    await page.close();
  }

  {
    const page = await newOnboardingPage(browser, server, onboardingState({
      detectedLanguage: localeConfig.detectedLanguage,
      localeConfig,
      settings: {
        uiLanguage: "auto",
      },
    }));
    await selectOnboardingPreference(page, "custom");
    await page.waitForTimeout(120);
    const target = path.join(rawDir, "onboarding-preferences.png");
    await saveLocatorShot(page.locator(".card"), target);
    files.onboardingPreferences = target;
    await page.close();
  }

  {
    const page = await newOnboardingPage(browser, server, onboardingState({
      detectedLanguage: localeConfig.detectedLanguage,
      localeConfig,
      settings: {
        uiLanguage: "auto",
      },
    }));
    await selectOnboardingPreference(page, "reject_all");
    await page.click("#btn-next");
    await page.waitForTimeout(180);
    const target = path.join(rawDir, "onboarding-pin.png");
    await saveLocatorShot(page.locator(".card"), target);
    files.onboardingPin = target;
    await page.close();
  }

  return files;
}

async function generateStoreAssets(browser, raws, localeConfig) {
  const targetDir = outputDirForLocale(localeConfig);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const shot of localeConfig.screenshots) {
    const target = path.join(targetDir, shot.file);
    await renderHtmlShot(
      browser,
      compositionHtml({
        title: shot.title,
        subtitle: shot.subtitle,
        imagePath: raws[shot.rawKey],
        align: shot.align,
      }),
      { width: 1280, height: 800 },
      target,
    );
  }

  if (localeConfig.promo) {
    await renderHtmlShot(
      browser,
      promoTileHtml({
        title: localeConfig.promo.small.title,
        subtitle: localeConfig.promo.small.subtitle,
        imagePath: raws[localeConfig.promo.small.rawKey],
        width: 440,
        height: 280,
      }),
      { width: 440, height: 280 },
      path.join(targetDir, localeConfig.promo.small.file),
    );

    await renderHtmlShot(
      browser,
      promoTileHtml({
        title: localeConfig.promo.marquee.title,
        subtitle: localeConfig.promo.marquee.subtitle,
        imagePath: raws[localeConfig.promo.marquee.rawKey],
        width: 1400,
        height: 560,
      }),
      { width: 1400, height: 560 },
      path.join(targetDir, localeConfig.promo.marquee.file),
    );
  }
}

function writeManifest() {
  const localizedSections = Object.values(LOCALES)
    .filter((locale) => locale.dirName)
    .map((locale) => {
      const screenshotLines = locale.screenshots.map((shot) => `  - localized/${locale.dirName}/${shot.file}`).join("\n");
      return `- ${locale.titlePrefix} screenshots:\n${screenshotLines}`;
    })
    .join("\n");

  const text = `# Chrome Web Store Listing Assets

Generated on ${new Date().toISOString()}

## Recommended field mapping

- Localized promo video: leave blank unless you have a locale-specific YouTube video
- Localized screenshots: optional; if you add an English localization in the listing, you can reuse the global screenshots below
- Global promo video: leave blank unless you have a YouTube demo
- Global screenshots:
  - global-screenshot-1-popup-main.png
  - global-screenshot-2-custom-settings.png
  - global-screenshot-3-transparent-warning.png
  - global-screenshot-4-onboarding-preferences.png
  - global-screenshot-5-pin-to-toolbar.png
- Localized screenshots:
${localizedSections}
- Small promo tile:
  - small-promo-tile-440x280.png
- Marquee promo tile:
  - marquee-promo-tile-1400x560.png

## Capture notes

- Assets were generated from local extension UI states using Playwright.
- Screenshot topics:
  1. Main popup with stats and preference
  2. Settings view with Custom categories and CCPA toggle
  3. Transparent warning / unsupported-site handling
  4. Onboarding preference setup
  5. Pin-to-toolbar guidance
`;
  fs.writeFileSync(path.join(OUT_DIR, "GENERATED.md"), text);
}

async function main() {
  const server = await startStaticServer(EXT_ROOT);
  const browser = await createBrowser();
  try {
    for (const localeConfig of Object.values(LOCALES)) {
      const raws = await generateRawShots(browser, server, localeConfig);
      await generateStoreAssets(browser, raws, localeConfig);
    }
    writeManifest();
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(`Generated Chrome Web Store listing assets in ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
