// js/forms.js — shared form behaviour for the Sell and Contact pages.
//
// Progressive enhancement: the forms are plain POSTs and work with JS disabled.
// This adds (a) an inline banner for the ?sent=1 / ?error=<code> states the
// Cloudflare Function redirects back with, and (b) pre-submit validation so a
// typo in the email is caught before the round trip.
(function () {
  'use strict';

  var FALLBACK_EMAIL = 'web@goodkarmamagic.com';

  // Codes set by functions/api/contact.js. Anything unlisted falls back to the
  // generic message, so a new server-side code can never render a blank banner.
  var ERRORS = {
    not_configured: {
      text:
        'Our form isn\u2019t connected to email yet \u2014 that\u2019s on us, not you. ' +
        'Please email us directly at ' + FALLBACK_EMAIL + ' and we\u2019ll pick it up right away.',
    },
    invalid_form: {
      text:
        'We couldn\u2019t read that submission. Please try again \u2014 or email ' +
        FALLBACK_EMAIL + ' if it keeps happening.',
    },
    missing_fields: {
      text: 'Please add your name, a valid email, and a short message so we can reply.',
    },
    bad_attachment: {
      text:
        'One of the photos was too large or wasn\u2019t an image. Up to 5 photos, ' +
        '4 MB each \u2014 JPG, PNG, HEIC, WebP or GIF.',
    },
    resend_auth: {
      text:
        'Our email service rejected the message. Please email us directly at ' +
        FALLBACK_EMAIL + ' \u2014 we\u2019re fixing this.',
    },
    resend_domain: {
      text:
        'Our email service isn\u2019t set up to send to us yet. Please email ' +
        FALLBACK_EMAIL + ' directly and we\u2019ll reply the same day.',
    },
    resend_rate: {
      text: 'We\u2019re getting a lot of messages right now. Please try again in a minute.',
    },
    timeout: {
      text:
        'Sending took too long. Please try again \u2014 or email ' + FALLBACK_EMAIL + ' directly.',
    },
    send_failed: {
      text:
        'Something went wrong sending that. Please try again in a minute, or email ' +
        FALLBACK_EMAIL + ' directly.',
    },
  };

  var GENERIC =
    'Something went wrong sending that. Please try again in a minute, or email ' +
    FALLBACK_EMAIL + ' directly.';

  function makeBanner(kind, text) {
    var p = document.createElement('p');
    p.className = 'form-banner form-banner--' + kind;
    p.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    p.textContent = text;
    return p;
  }

  function renderBanner() {
    var b = document.getElementById('form-banner');
    if (!b) return;
    var params = new URLSearchParams(window.location.search);

    if (params.get('sent') === '1') {
      b.appendChild(
        makeBanner(
          'success',
          'Thanks! Your request is in \u2014 we usually reply the same day.'
        )
      );
      return;
    }

    var code = params.get('error');
    if (code === null) return;

    var entry = ERRORS[code];
    var msg = entry ? entry.text : GENERIC;
    var banner = makeBanner('error', msg);
    b.appendChild(banner);

    // Scrolling the banner into view matters when the user has been bounced
    // back from below the fold; the sticky CTA otherwise hides it.
    try {
      b.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) {
      b.scrollIntoView();
    }

    // Keep the failure out of the URL so a refresh doesn't re-show it.
    if (window.history && window.history.replaceState) {
      params.delete('error');
      params.delete('sent');
      var qs = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (qs ? '?' + qs : '') + window.location.hash
      );
    }
  }

  function fieldError(input, message) {
    var existing = input.parentNode.querySelector('.field-error');
    if (existing) existing.remove();
    input.removeAttribute('aria-invalid');

    if (message) {
      var span = document.createElement('span');
      span.className = 'field-error';
      span.setAttribute('role', 'alert');
      span.textContent = message;
      input.parentNode.appendChild(span);
      input.setAttribute('aria-invalid', 'true');
    }
  }

  function validate(form) {
    var firstBad = null;
    var inputs = form.querySelectorAll('input[required], textarea[required]');
    for (var i = 0; i < inputs.length; i++) {
      var input = inputs[i];
      var value = (input.value || '').trim();
      var problem = '';

      if (!value) {
        problem = 'This is required.';
      } else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
        problem = 'That doesn\u2019t look like an email address.';
      }

      fieldError(input, problem);
      if (problem && !firstBad) firstBad = input;
    }

    // The Sell form needs notes (or a message); Contact needs the message.
    if (!firstBad) {
      var notes = form.querySelector('#notes');
      var message = form.querySelector('#message');
      if ((notes && !notes.value.trim() && !(message && message.value.trim())) ||
          (message && !message.value.trim())) {
        var target = message || notes;
        if (target) {
          fieldError(target, 'Please tell us a little about what you\u2019re sending.');
          firstBad = target;
        }
      }
    }

    if (firstBad) firstBad.focus();
    return !firstBad;
  }

  function init() {
    renderBanner();

    var forms = document.querySelectorAll('form.form-card');
    for (var i = 0; i < forms.length; i++) {
      (function (form) {
        var button = form.querySelector('button[type="submit"]');

        form.addEventListener('submit', function (e) {
          if (!validate(form)) {
            e.preventDefault();
            return;
          }
          // Prevent double-submits: a second POST just makes a second email.
          if (button) {
            button.disabled = true;
            button.dataset.label = button.textContent;
            button.textContent = 'Sending\u2026';
            // Re-enable if the browser restores the page from the back/forward cache.
            window.setTimeout(function () {
              button.disabled = false;
              if (button.dataset.label) button.textContent = button.dataset.label;
            }, 15000);
          }
        });

        // Clear a field's error as soon as the user starts fixing it.
        form.addEventListener('input', function (e) {
          if (e.target.getAttribute('aria-invalid') === 'true') {
            fieldError(e.target, '');
          }
        });
      })(forms[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
