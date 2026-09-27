/*!
 * Voice Search — OpenAI Realtime (WebRTC) + your MySQL search, for jQuery sites.
 *
 * Usage:
 *   VoiceSearch.init({
 *     sessionUrl: '/voice-search/api/session.php',
 *     searchUrl : '/voice-search/api/search.php',
 *     triggers  : '#heroVoice, #soVoiceBtn'
 *   });
 *
 * Events fired on document:
 *   voicesearch:results  (e, results, args)   — every time a search returns
 *   voicesearch:navigate (e, vehicle)         — just before opening a page (call e.preventDefault() to handle it yourself)
 */
(function ($, window, document) {
  'use strict';
  if (!$) { console.error('[VoiceSearch] jQuery is required'); return; }

  var DEFAULTS = {
    sessionUrl: 'api/session.php',
    searchUrl: 'api/search.php',
    realtimeUrl: 'https://api.openai.com/v1/realtime/calls',
    triggers: '[data-voice-search]',
    takeOverTriggers: true,        // strip old click handlers (e.g. Web Speech) from trigger buttons
    idleTimeoutMs: 30000,          // auto-stop after 30s of silence
    maxSessionMs: 180000,          // hard cap per session (cost control)
    getContext: function () {      // sent to session.php so the assistant knows city / category
      var city = '';
      try { city = localStorage.getItem('user_city') || ''; } catch (e) {}
      if (!city) { var m = document.cookie.match(/(?:^|; )user_city=([^;]*)/); city = m ? decodeURIComponent(m[1]) : ''; }
      var tab = String($('.cat-tab.active').data('cat') || '');
      var cat = /bike|scooter/.test(tab) || /bike/.test(location.pathname) ? 'bikes' : (tab === 'cars' || !tab ? 'cars' : '');
      return { city: city, category: cat, page: (location.pathname.split('/').pop() || 'home').replace(/\.\w+$/, '') };
    },
    beforeOpen: null,              // called just before the panel opens
    suggestions: ['SUVs under 15 lakh', 'Best mileage scooter', 'Classic 350 price', 'Automatic cars under 10 lakh'],
    fallbackLang: 'en-IN'
  };

  var ICON = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M3 13l2-6h14l2 6v4H3z"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/></svg>',
    bike: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M15 6h3l-3.5 11M5.5 17 9 9h6M9 9 7.5 6H6"/></svg>'
  };

  var HINT = {
    idle: 'Tap the mic and ask for any car or bike',
    connecting: 'Connecting…',
    listening: 'Listening — try “SUVs under 15 lakh” or “Classic 350 price”',
    searching: 'Searching…',
    speaking: 'Speaking… just talk to interrupt',
    error: 'Something went wrong. Tap the mic to try again.'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var VS = {
    opts: null, $root: null, state: 'idle',
    pc: null, dc: null, stream: null, audioEl: null,
    audioCtx: null, raf: 0, idleTimer: 0, maxTimer: 0,
    lastResults: [], handledCalls: {}, botBubble: null, userBubble: null,

    init: function (options) {
      if (this.opts) return this;
      this.opts = $.extend({}, DEFAULTS, options || {});
      this._build();
      this._bindTriggers();
      return this;
    },

    /* ── UI ─────────────────────────────────────────────── */
    _build: function () {
      var o = this.opts, self = this;
      this.$root = $(
        '<div class="vs-root" data-state="idle" aria-live="polite">' +
          '<div class="vs-backdrop"></div>' +
          '<div class="vs-panel" role="dialog" aria-modal="true" aria-label="Voice search">' +
            '<div class="vs-hd"><span class="vs-hd-title">Voice search</span><span class="vs-status">Ready</span>' +
              '<button type="button" class="vs-close" aria-label="Close voice search">' + ICON.x + '</button></div>' +
            '<div class="vs-stage"><button type="button" class="vs-orb" aria-label="Start or stop listening">' + ICON.mic + '</button>' +
              '<div class="vs-hint"></div></div>' +
            '<div class="vs-log"></div>' +
            '<div class="vs-chips">' + $.map(o.suggestions, function (s) { return '<span class="vs-chip">' + esc(s) + '</span>'; }).join('') + '</div>' +
            '<div class="vs-results" role="list"></div>' +
            '<div class="vs-ft"><span>Speak in English or Hindi</span><button type="button" class="vs-stop">End voice search</button></div>' +
          '</div>' +
        '</div>'
      ).appendTo(document.body);

      this.$root.on('click', '.vs-backdrop, .vs-close, .vs-stop', function () { self.close(); });
      this.$root.on('click', '.vs-orb', function () { self.pc ? self.stop() : self.start(); });
      this.$root.on('click', '.vs-row', function () { self.stop(); });
      $(document).on('keydown.vs', function (e) { if (e.key === 'Escape' && self.$root.hasClass('open')) self.close(); });
      this._setState('idle');
    },

    _bindTriggers: function () {
      var self = this;
      $(this.opts.triggers).each(function () {
        var el = this;
        if (self.opts.takeOverTriggers && el.parentNode) {    // drop previously attached listeners
          var clone = el.cloneNode(true); el.parentNode.replaceChild(clone, el); el = clone;
        }
        $(el).on('click', function (e) { e.preventDefault(); e.stopPropagation(); self.toggle(); });
      });
    },

    _setState: function (s, hint) {
      this.state = s;
      this.$root.attr('data-state', s);
      this.$root.find('.vs-status').text({ idle: 'Ready', connecting: 'Connecting', listening: 'Listening', searching: 'Searching', speaking: 'Speaking', error: 'Error' }[s] || s);
      this.$root.find('.vs-hint').text(hint || HINT[s] || '');
      this.$root.find('.vs-orb').html(this.pc ? ICON.stop : ICON.mic);
      $(this.opts.triggers).toggleClass('vs-trigger-live', !!this.pc);
    },

    _say: function (who, text, bubble) {
      var $log = this.$root.find('.vs-log');
      if (!bubble) bubble = $('<div class="vs-msg ' + who + '"></div>').appendTo($log);
      bubble.text(text);
      $log.scrollTop($log[0].scrollHeight);
      this.$root.find('.vs-chips').hide();
      return bubble;
    },

    _renderResults: function (results) {
      var $r = this.$root.find('.vs-results').addClass('has');
      if (!results.length) { $r.html('<div class="vs-empty">No matching vehicles found. Try a wider budget or another brand.</div>'); return; }
      $r.html('<div class="vs-label">' + results.length + ' match' + (results.length > 1 ? 'es' : '') + '</div>' +
        $.map(results, function (v) {
          var meta = [v.body, v.fuel, v.mileage ? v.mileage + (v.fuel === 'Electric' ? ' km' : ' kmpl') : '', v.rating ? '★ ' + v.rating : ''].filter(Boolean).join(' · ');
          var thumb = v.image_url ? '<img src="' + esc(v.image_url) + '" alt="" loading="lazy">' : (v.type === 'bike' ? ICON.bike : ICON.car);
          return '<a class="vs-row" role="listitem" href="' + esc(v.url) + '">' +
            '<span class="vs-thumb">' + thumb + '</span>' +
            '<span class="vs-info"><span class="vs-name">' + esc(v.name) + '</span><span class="vs-meta">' + esc(meta) + '</span></span>' +
            '<span class="vs-price">' + esc(v.price_label) + '</span></a>';
        }).join(''));
    },

    open: function () {
      if (!this.$root.hasClass('open') && typeof this.opts.beforeOpen === 'function') this.opts.beforeOpen();
      this.$root.addClass('open');
    },
    close: function () { this.stop(); this.$root.removeClass('open'); },
    toggle: function () { if (this.pc) { this.close(); } else { this.open(); this.start(); } },

    /* ── Realtime session ───────────────────────────────── */
    start: function () {
      var self = this, o = this.opts;
      if (this.pc) return;
      this.open();

      if (!window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return this._fallbackSpeech();
      }
      if (!window.isSecureContext) { return this._setState('error', 'Voice needs HTTPS. Please open the site over https://'); }

      this.handledCalls = {};
      this.botBubble = this.userBubble = null;
      this.pc = new RTCPeerConnection();   // set before async work so double-clicks are ignored
      this._setState('connecting');

      var pc = this.pc, token;

      // Promise.resolve() makes this work the same on jQuery 1.x, 2.x and 3.x
      Promise.resolve($.ajax({ url: o.sessionUrl, method: 'POST', contentType: 'application/json', dataType: 'json', data: JSON.stringify(o.getContext()) }))
        .then(function (res) {
          if (!res || !res.value) throw new Error('No session token');
          token = res.value;
          return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        })
        .then(function (stream) {
          if (self.pc !== pc) { stream.getTracks().forEach(function (t) { t.stop(); }); return; } // stopped meanwhile
          self.stream = stream;
          self._meter(stream);

          self.audioEl = self.audioEl || $('<audio autoplay playsinline></audio>').appendTo(self.$root)[0];
          pc.ontrack = function (e) { self.audioEl.srcObject = e.streams[0]; };
          pc.addTrack(stream.getAudioTracks()[0], stream);
          pc.onconnectionstatechange = function () {
            if (['failed', 'disconnected'].indexOf(pc.connectionState) > -1 && self.pc === pc) self._fail('Connection lost. Tap the mic to reconnect.');
          };

          self.dc = pc.createDataChannel('oai-events');
          self.dc.onmessage = function (e) { try { self._onEvent(JSON.parse(e.data)); } catch (err) { console.warn('[VoiceSearch]', err); } };
          self.dc.onopen = function () { self._setState('listening'); self._bump(); };

          return pc.createOffer().then(function (offer) { return pc.setLocalDescription(offer); });
        })
        .then(function () {
          if (self.pc !== pc) return;
          return fetch(o.realtimeUrl, {
            method: 'POST', body: pc.localDescription.sdp,
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/sdp' }
          }).then(function (r) {
            if (!r.ok) throw new Error('Realtime connect failed (' + r.status + ')');
            return r.text();
          }).then(function (sdp) { return pc.setRemoteDescription({ type: 'answer', sdp: sdp }); });
        })
        .then(function () {
          self.maxTimer = setTimeout(function () { self.stop('Session time limit reached. Tap the mic to continue.'); }, o.maxSessionMs);
        })
        .catch(function (err) {
          console.error('[VoiceSearch]', err);
          var msg = HINT.error;
          if (err && err.name === 'NotAllowedError') msg = 'Microphone access is blocked. Allow the mic in your browser settings and try again.';
          else if (err && err.status === 429) msg = 'Too many voice searches from this network. Please try again in a while.';
          else if (err && err.status === 403) msg = 'Voice search is not enabled for this domain.';
          else if (err && err.responseJSON && err.responseJSON.error === 'server_not_configured') msg = 'Voice search is not set up yet (OpenAI API key missing on the server).';
          else if (err && err.status === 0 || (err && err.status === 404)) msg = 'Voice search server is not reachable. Open the site through PHP (not file://).';
          self._fail(msg);
        });
    },

    stop: function (hint) {
      clearTimeout(this.idleTimer); clearTimeout(this.maxTimer); cancelAnimationFrame(this.raf);
      try { this.dc && this.dc.close(); } catch (e) {}
      try { this.pc && this.pc.close(); } catch (e) {}
      if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
      if (this.audioCtx) { try { this.audioCtx.close(); } catch (e) {} }
      if (this.audioEl) this.audioEl.srcObject = null;
      if (this.recog) { try { this.recog.abort(); } catch (e) {} this.recog = null; }
      this.pc = this.dc = this.stream = this.audioCtx = null;
      this.$root.find('.vs-orb').css('--lvl', 0);
      if (this.state !== 'error' || hint) this._setState('idle', hint);
      else this._setState('error', this.$root.find('.vs-hint').text());
    },

    _fail: function (msg) { this.stop(); this._setState('error', msg); },

    _send: function (evt) { if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify(evt)); },

    _bump: function () {   // reset idle auto-stop
      var self = this;
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(function () { self.stop('Stopped after a short silence. Tap the mic to ask again.'); }, this.opts.idleTimeoutMs);
    },

    _meter: function (stream) {   // mic level → orb glow
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var self = this, ctx = this.audioCtx = new AC(), an = ctx.createAnalyser(), buf = new Uint8Array(256), $orb = this.$root.find('.vs-orb');
      an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
      (function loop() {
        an.getByteTimeDomainData(buf);
        var sum = 0; for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
        $orb.css('--lvl', Math.min(1, Math.sqrt(sum / buf.length) * 4).toFixed(2));
        self.raf = requestAnimationFrame(loop);
      })();
    },

    /* ── Server events ──────────────────────────────────── */
    _onEvent: function (ev) {
      var self = this;
      switch (ev.type) {
        case 'input_audio_buffer.speech_started':
          this._bump(); this.botBubble = null;
          this.userBubble = this._say('user pending', '…');
          this._setState('listening');
          break;

        case 'conversation.item.input_audio_transcription.delta':
          if (this.userBubble) this.userBubble.text((this.userBubble.text() === '…' ? '' : this.userBubble.text()) + (ev.delta || ''));
          break;

        case 'conversation.item.input_audio_transcription.completed':
          var t = String(ev.transcript || '').trim();
          if (this.userBubble) { t ? this.userBubble.text(t).removeClass('pending') : this.userBubble.remove(); }
          else if (t) this._say('user', t);
          this.userBubble = null;
          break;

        case 'response.output_audio_transcript.delta':
          this._bump();
          if (this.state !== 'speaking') this._setState('speaking');
          if (!this.botBubble) this.botBubble = this._say('bot', '');
          this.botBubble.text(this.botBubble.text() + (ev.delta || ''));
          break;

        case 'response.output_audio_transcript.done':
          this.botBubble = null;
          break;

        case 'output_audio_buffer.stopped':
        case 'response.output_audio.done':
          if (this.pc && this.state === 'speaking') this._setState('listening');
          break;

        case 'response.done':
          this._bump();
          var out = (ev.response && ev.response.output) || [];
          $.each(out, function (_, item) {
            if (item.type === 'function_call' && !self.handledCalls[item.call_id]) {
              self.handledCalls[item.call_id] = 1;
              self._runTool(item);
            }
          });
          if (!out.some(function (i) { return i.type === 'function_call'; }) && this.state === 'searching') this._setState('listening');
          break;

        case 'error':
          console.warn('[VoiceSearch] realtime error', ev.error);
          break;
      }
    },

    _runTool: function (call) {
      var self = this, args = {};
      try { args = JSON.parse(call.arguments || '{}'); } catch (e) {}

      if (call.name === 'search_vehicles') {
        this._setState('searching');
        var params = {};
        $.each(args, function (k, v) { if (v !== null && v !== '' && v !== undefined) params[k] = v; });

        $.ajax({ url: this.opts.searchUrl, data: params, dataType: 'json', timeout: 8000 })
          .done(function (res) {
            var results = (res && res.results) || [];
            self.lastResults = results;
            self._renderResults(results);
            $(document).trigger('voicesearch:results', [results, args]);
            // Send a compact version back — fewer tokens = faster + cheaper reply
            self._toolResult(call.call_id, {
              count: results.length,
              results: $.map(results, function (v) {
                return { id: v.id, name: v.name, price: v.price_label, body: v.body, fuel: v.fuel, mileage: v.mileage, rating: v.rating, highlights: v.highlights };
              })
            });
          })
          .fail(function () { self._toolResult(call.call_id, { error: 'Search is temporarily unavailable.' }); });
        return;
      }

      if (call.name === 'open_vehicle_page') {
        var v = $.grep(this.lastResults, function (r) { return r.id === args.id; })[0];
        if (!v) { this._toolResult(call.call_id, { ok: false, error: 'Unknown id; search first.' }); return; }
        this._toolResult(call.call_id, { ok: true, opening: v.name });
        var e = $.Event('voicesearch:navigate');
        $(document).trigger(e, [v]);
        if (!e.isDefaultPrevented()) setTimeout(function () { self.stop(); window.location.href = v.url; }, 2200); // let the reply play
        return;
      }

      this._toolResult(call.call_id, { error: 'Unknown tool' });
    },

    _toolResult: function (callId, output) {
      this._send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) } });
      this._send({ type: 'response.create' });
    },

    /* ── Fallback: browser speech-to-text → search (no spoken reply) ── */
    _fallbackSpeech: function () {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition, self = this;
      if (!SR) return this._setState('error', 'Voice search is not supported in this browser.');
      var r = this.recog = new SR();
      r.lang = this.opts.fallbackLang; r.interimResults = false; r.maxAlternatives = 1;
      this._setState('listening', 'Listening…');
      r.onresult = function (e) {
        var q = e.results[0][0].transcript;
        self._say('user', q);
        self._setState('searching');
        $.getJSON(self.opts.searchUrl, { query: q }).done(function (res) {
          self.lastResults = res.results || [];
          self._renderResults(self.lastResults);
          $(document).trigger('voicesearch:results', [self.lastResults, { query: q }]);
          self._setState('idle', 'Tap the mic to search again');
        }).fail(function () { self._setState('error'); });
      };
      r.onerror = function () { self._setState('error', 'Could not hear you. Tap the mic to try again.'); };
      r.onend = function () { self.recog = null; if (self.state === 'listening') self._setState('idle'); };
      r.start();
    }
  };

  window.VoiceSearch = VS;
})(window.jQuery, window, document);
