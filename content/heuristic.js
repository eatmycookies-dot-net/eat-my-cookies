// Tier 5 — Heuristic text-match fallback.
// Runs in ISOLATED world. Fires only when all other tiers fail.
// Scans visible buttons for localized "reject" / "deny" text.
// Only fires if confidence > 0.8 to avoid false positives on age gates, newsletters, etc.

const REJECT_PATTERNS = [
  // GDPR — reject / deny
  /reject all/i, /deny all/i, /decline all/i,
  /only necessary/i, /essential only/i, /only essential/i,
  /refuse all/i, /no thanks/i, /continue without agreeing/i,
  /tout refuser/i, /continuer sans accepter/i,     // fr
  /alle ablehnen/i, /nur notwendige/i, /ohne zustimmung fortfahren/i, // de
  /rechazar todo/i, /solo necesarias/i, /continuar sin aceptar/i,     // es
  /rifiuta tutto/i, /solo necessarie/i, /solo essenziali/i, /continua senza accettare/i, // it
  /rejeitar tudo/i, /apenas necessárias/i, /só necessárias/i, /continuar sem aceitar/i, // pt
  // Standalone reject (e.g. ConsentManager's "Reject ×", some simple banners)
  // Only scores 0.8 if inside a known consent container (modal bonus)
  /^reject[^a-z]*$/i, /^decline[^a-z]*$/i, /^deny[^a-z]*$/i,
  /^ablehnen[^a-z]*$/i,  // de
  /^rifiuta[^a-z]*$/i,   // it
  /^refuser[^a-z]*$/i,   // fr
  /^rejeitar[^a-z]*$/i,  // pt
  // USNat / CCPA — opt-out of sale
  /do not sell or share/i,
  /do not sell my personal/i,
  /opt out of (the )?sale/i,
  /opt.out of sharing/i,
  /do not share my personal/i,
];

const ACCEPT_PATTERNS = [
  /accept all/i, /allow all/i, /agree to all/i,
  /accept and close/i,
  /accepter tout/i, /accepter et fermer/i,
  /alle akzeptieren/i, /akzeptieren und schließen/i,
  /aceptar todo/i, /aceptar y cerrar/i,
  /accetta tutto/i, /accetta e chiudi/i,
  /aceitar tudo/i, /aceitar e fechar/i,
];

const MODAL_SELECTORS = [
  '[role="dialog"]', '[aria-modal="true"]',
  '.cookie-banner', '.cookie-notice', '.cookie-consent',
  '#cookie-banner', '#cookie-notice', '#cookie-consent',
  '[class*="cookie"]', '[id*="cookie"]',
  '[class*="consent"]', '[id*="consent"]',
  '[class*="gdpr"]', '[id*="gdpr"]',
  '[class*="cmpbox"]', '#cmpbox', '#cmpwrapper',
  '[class*="didomi"]', '[class*="iubenda"]',
];

function runHeuristic(prefs) {
  if (shouldSkipHeuristic(prefs)) return null;
  const patterns = prefs.globalPreference === 'accept_all' ? ACCEPT_PATTERNS : REJECT_PATTERNS;
  const candidates = collectCandidates(patterns);
  if (!candidates.length) return null;

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (best.score < 0.8) return null;

  dispatchSyntheticClick(best.element);
  return { method: 'heuristic', score: best.score };
}

function collectCandidates(patterns) {
  const candidates = [];
  // Include <a> tags (no href filter) — scored lower than buttons; only pass 0.8 if inside a consent modal
  const buttons = document.querySelectorAll('button, [role="button"], a, input[type="button"]');

  for (const el of buttons) {
    if (!isVisible(el)) continue;
    const text = el.textContent?.trim() ?? '';
    const matched = patterns.some((p) => p.test(text));
    if (!matched) continue;

    const score = scoreCandidate(el);
    candidates.push({ element: el, score, text });
  }

  return candidates;
}

function scoreCandidate(el) {
  let score = 0.5; // base: text matched

  // Inside a known consent modal → strong signal
  if (MODAL_SELECTORS.some((sel) => el.closest(sel))) score += 0.3;

  // Near other consent-related elements
  const parent = el.closest('[class*="cookie"], [class*="consent"], [class*="gdpr"]');
  if (parent) score += 0.1;

  // Not inside a form that looks like a newsletter/signup
  const form = el.closest('form');
  if (form?.querySelector('input[type="email"]')) score -= 0.4;

  return Math.min(score, 1.0);
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function shouldSkipHeuristic(prefs) {
  if (prefs?.globalPreference === 'custom') return true;
  if (document.querySelector("[id^='sp_message_container'], [id^='sp_message_iframe']")) return true;
  return ['www.theguardian.com', 'www.euronews.com', 'www.ft.com', 'www.dw.com', 'www.bbc.com', 'latimes.com', 'www.latimes.com', 'membership.latimes.com'].includes(location.hostname);
}

function dispatchSyntheticClick(el) {
  if (!el) return false;
  try { el.focus?.({ preventScroll: true }); } catch (_) {}
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + Math.max(1, rect.width / 2);
  const clientY = rect.top + Math.max(1, rect.height / 2);
  const options = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    buttons: 1,
    clientX,
    clientY,
  };
  for (const name of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const EventCtor = name.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
    el.dispatchEvent(new EventCtor(name, options));
  }
  if (typeof el.click === 'function') el.click();
  return true;
}
