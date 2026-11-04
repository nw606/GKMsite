(function () {
  'use strict';
  var ENDPOINT = 'https://dash.goodkarmamagic.com/collect.php';

  function rid() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    var s = '';
    for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return s;
  }
  function getCookie(n) {
    var m = document.cookie.match('(?:^|; )' + n + '=([^;]*)');
    return m ? m[1] : '';
  }
  function setCookie(n, v, days) {
    var e = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = n + '=' + v + '; expires=' + e + '; path=/; SameSite=Lax';
  }

  // Visitor: 12-month first-party cookie.
  var hadCookie = 1, vid = getCookie('gkm_vid');
  if (!vid) { vid = rid(); setCookie('gkm_vid', vid, 365); hadCookie = 0; }

  // Session: 30-minute sliding window, per tab.
  var sess = null;
  try { sess = JSON.parse(sessionStorage.getItem('gkm_sess') || 'null'); } catch (e) {}
  var now = Date.now();
  if (!sess || typeof sess.id !== 'string' || now - (sess.t || 0) > 30 * 60 * 1000) {
    sess = { id: rid(), t: now };
  }
  sess.t = now;
  try { sessionStorage.setItem('gkm_sess', JSON.stringify(sess)); } catch (e) {}

  function qp(k) {
    var m = location.search.match(new RegExp('[?&]' + k + '=([^&]*)'));
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  var payload = {
    v: vid,
    s: sess.id,
    p: location.pathname,
    t: (document.title || '').slice(0, 300),
    r: document.referrer,
    us: qp('utm_source'),
    um: qp('utm_medium'),
    uc: qp('utm_campaign'),
    sc: (screen && screen.width ? screen.width + 'x' + screen.height : null),
    l: navigator.language || null,
    ck: hadCookie
  };

  // Prefer sendBeacon (survives page unload); fall back to a 1x1 pixel GET.
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, JSON.stringify(payload))) return;
  } catch (e) {}

  var img = new Image();
  img.src = ENDPOINT + '?px=1&v=' + payload.v + '&s=' + payload.s +
    '&p=' + encodeURIComponent(payload.p) +
    '&t=' + encodeURIComponent(payload.t.slice(0, 150)) +
    '&r=' + encodeURIComponent(payload.r || '') +
    '&us=' + encodeURIComponent(payload.us || '') +
    '&um=' + encodeURIComponent(payload.um || '') +
    '&uc=' + encodeURIComponent(payload.uc || '') +
    '&sc=' + (payload.sc || '') +
    '&l=' + encodeURIComponent(payload.l || '');
})();
