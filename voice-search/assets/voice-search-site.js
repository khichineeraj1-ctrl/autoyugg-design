/*!
 * Voice Search — site integration loader.
 * Add ONE line before </body> on any page:
 *   <script src="voice-search/assets/voice-search-site.js" defer></script>
 *
 * It loads the CSS, jQuery (only if the page doesn't have it) and the widget,
 * adds mic buttons to the header, the search overlay and the hero search box,
 * then starts voice search.
 */
(function () {
  'use strict';
  if (window.__vsSiteLoaded) return;
  window.__vsSiteLoaded = true;

  var me   = document.currentScript || document.querySelector('script[src*="voice-search-site.js"]');
  var BASE = me.src.replace(/assets\/voice-search-site\.js.*$/, '');   // .../voice-search/
  var JQ   = 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js';

  var MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

  function css(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  }
  function js(src, cb) {
    var s = document.createElement('script'); s.src = src; s.onload = cb;
    s.onerror = function () { console.error('[VoiceSearch] failed to load ' + src); };
    document.head.appendChild(s);
  }
  function btn(cls, label) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.setAttribute('data-voice-search', '');
    b.setAttribute('aria-label', label); b.title = label; b.innerHTML = MIC;
    return b;
  }

  /* Mic buttons for pages that don't have them yet */
  function injectButtons() {
    // 1. Header — next to the search icon (every page with the standard header)
    var open = document.getElementById('searchOpen');
    if (open && !document.querySelector('.vs-hd-mic')) open.parentNode.insertBefore(btn('vs-hd-mic', 'Voice search'), open);

    // 2. Search overlay input
    var soInput = document.getElementById('soInput');
    if (soInput && !document.getElementById('soVoiceBtn')) {
      var wrap = soInput.parentNode; wrap.classList.add('vs-so-has-mic');
      wrap.appendChild(btn('vs-so-mic', 'Voice search'));
    }

    // 3. Mobile floating mic (the header icons sit off-screen on small phones)
    if (!document.querySelector('.vs-fab')) document.body.appendChild(btn('vs-fab', 'Voice search'));

    // 4. Hero search box (bike homepage etc.)
    var hero = document.getElementById('heroSearch');
    if (hero && !document.getElementById('heroVoice')) {
      hero.parentNode.insertBefore(btn('vs-hero-mic', 'Search by voice'), hero.nextSibling);
    }
  }

  function start() {
    var $ = window.jQuery;
    injectButtons();

    VoiceSearch.init({
      sessionUrl: BASE + 'api/session.php',
      searchUrl : BASE + 'api/search.php',
      triggers  : '[data-voice-search], #heroVoice, #soVoiceBtn',
      suggestions: /bike/.test(location.pathname)
        ? ['Bikes under 2 lakh', 'Best mileage scooter', 'Classic 350 price', 'Electric scooters']
        : ['SUVs under 15 lakh', 'Automatic cars under 10 lakh', 'Tata Curvv price', '7 seater family car'],
      // Close the site's own search overlay / dropdown so the voice panel sits on top
      beforeOpen: function () {
        var so = document.getElementById('searchOverlay'), soClose = document.getElementById('soClose');
        if (so && so.classList.contains('open') && soClose) soClose.click();
        $('#heroDropdown').removeClass('open');
      }
    });

    // Mirror what the user asked into the visible search boxes
    $(document).on('voicesearch:results', function (e, results, args) {
      var q = args && (args.query || [args.brand, args.body, args.fuel].filter(Boolean).join(' '));
      if (!q) return;
      $('#heroSearch').val(q);
      $('#soInput').val(q);
    });

  }

  function boot() {
    css(BASE + 'assets/voice-search.css');
    var go = function () { js(BASE + 'assets/voice-search.js', start); };
    window.jQuery ? go() : js(JQ, go);
  }

  // Wait for the page's own scripts to finish so the old mic handlers can be replaced cleanly
  if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
})();
