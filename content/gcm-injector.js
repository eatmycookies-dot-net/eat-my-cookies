// Tier 3 — Google Consent Mode v2 signal injection.
// Runs in MAIN world at document_start — before gtag.js or GA4 loads.
// Sets the default consent state so Google's tools respect user preferences
// even on sites with no visible CMP banner.

(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  // Default to fully denied until prefs arrive
  gtag('consent', 'default', {
    analytics_storage:        'denied',
    ad_storage:               'denied',
    ad_user_data:             'denied',
    ad_personalization:       'denied',
    functionality_storage:    'denied',
    personalization_storage:  'denied',
    security_storage:         'granted', // always allow
    wait_for_update: 500,
  });

  // Update when ISOLATED world sends actual preferences
  document.addEventListener('__emc_prefs__', (e) => {
    const prefs = e.detail;
    gtag('consent', 'update', {
      analytics_storage:        prefs.analytics   ? 'granted' : 'denied',
      ad_storage:               prefs.advertising ? 'granted' : 'denied',
      ad_user_data:             prefs.advertising ? 'granted' : 'denied',
      ad_personalization:       prefs.advertising ? 'granted' : 'denied',
      functionality_storage:    prefs.functional  ? 'granted' : 'denied',
      personalization_storage:  prefs.functional  ? 'granted' : 'denied',
      security_storage:         'granted',
    });
  }, { once: true });
})();
