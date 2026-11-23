/**
 * ui.js — small reusable UI helpers shared by every page:
 * escaping, toasts, flash messages, loading/empty/error states,
 * confirm dialogs, form errors, file checks, password strength, dates.
 */
const UI = (function () {

  // Escape API data before putting it in HTML (prevents XSS).
  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms || 250);
    };
  }

  // ---------- Toasts ----------
  function toast(message, type, timeout) {
    type = type || 'info';
    let $region = $('#toast-region');
    if (!$region.length) {
      $region = $('<div id="toast-region" class="fixed z-[70] bottom-4 left-4 right-4 sm:left-auto flex flex-col gap-2 sm:items-end"></div>').appendTo('body');
    }
    const border = { success: 'border-civic', error: 'border-danger', info: 'border-signal' }[type] || 'border-signal';
    const icon = { success: '✓', error: '!', info: 'i' }[type] || 'i';
    const $t = $(
      '<div role="' + (type === 'error' ? 'alert' : 'status') + '" class="flex items-start gap-3 bg-white text-ink shadow-lg rounded-md border border-ink/10 border-l-4 ' + border + ' px-4 py-3 sm:max-w-sm">' +
        '<span aria-hidden="true" class="font-bold w-4 text-center">' + icon + '</span>' +
        '<p class="text-sm flex-1">' + esc(message) + '</p>' +
        '<button type="button" class="text-muted hover:text-ink leading-none text-lg" aria-label="Dismiss message">&times;</button>' +
      '</div>'
    );
    $t.find('button').on('click', function () { $t.remove(); });
    $region.append($t);
    setTimeout(function () { $t.fadeOut(200, function () { $t.remove(); }); }, timeout || (type === 'error' ? 7000 : 4500));
  }

  // Flash = a toast that survives one redirect (e.g. signup -> login)
  function flash(message, type) {
    sessionStorage.setItem(CONFIG.FLASH_KEY, JSON.stringify({ message: message, type: type || 'success' }));
  }
  function showFlash() {
    const raw = sessionStorage.getItem(CONFIG.FLASH_KEY);
    if (!raw) return;
    sessionStorage.removeItem(CONFIG.FLASH_KEY);
    try { const f = JSON.parse(raw); toast(f.message, f.type); } catch (e) { /* ignore */ }
  }

  // ---------- Loading / empty / error states ----------
  function skeletonCards($el, count) {
    let html = '';
    for (let i = 0; i < (count || 6); i++) {
      html += '<div class="card overflow-hidden" aria-hidden="true">' +
        '<div class="skeleton aspect-[16/9] rounded-none"></div>' +
        '<div class="p-5 pt-8 space-y-3"><div class="skeleton h-5 w-3/4"></div><div class="skeleton h-4 w-1/2"></div>' +
        '<div class="skeleton h-4 w-full"></div><div class="skeleton h-9 w-1/3 mt-4"></div></div></div>';
    }
    $el.attr('aria-busy', 'true').html(html);
  }

  function skeletonRows($el, count) {
    let html = '';
    for (let i = 0; i < (count || 5); i++) {
      html += '<div class="flex gap-3 py-3" aria-hidden="true"><div class="skeleton h-10 w-10 rounded-full"></div>' +
        '<div class="flex-1 space-y-2"><div class="skeleton h-4 w-2/3"></div><div class="skeleton h-3 w-1/2"></div></div></div>';
    }
    $el.attr('aria-busy', 'true').html(html);
  }

  function emptyState($el, opts) {
    $el.attr('aria-busy', 'false').html(
      '<div class="col-span-full card border-dashed p-10 text-center">' +
        '<p class="text-lg font-bold">' + esc(opts.title) + '</p>' +
        (opts.text ? '<p class="text-muted mt-1 max-w-prose mx-auto">' + esc(opts.text) + '</p>' : '') +
        (opts.actionHtml ? '<div class="mt-5">' + opts.actionHtml + '</div>' : '') +
      '</div>'
    );
  }

  // Error with a retry button (network fallback for critical loads)
  function errorState($el, message, onRetry) {
    $el.attr('aria-busy', 'false').html(
      '<div class="col-span-full card border-danger/30 p-8 text-center" role="alert">' +
        '<p class="text-lg font-bold text-danger">Couldn\'t load this content</p>' +
        '<p class="text-muted mt-1">' + esc(message) + '</p>' +
        (onRetry ? '<button type="button" class="btn btn-secondary mt-5" data-retry>Try again</button>' : '') +
      '</div>'
    );
    if (onRetry) $el.find('[data-retry]').on('click', onRetry);
  }

  // Button busy state: disables + swaps label, restores afterwards
  function setBusy($btn, busy, busyText) {
    if (busy) {
      if (!$btn.data('label')) $btn.data('label', $btn.html());
      $btn.prop('disabled', true).attr('aria-busy', 'true')
        .html('<span class="inline-block h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin" aria-hidden="true"></span>' + esc(busyText || 'Working…'));
    } else {
      $btn.prop('disabled', false).removeAttr('aria-busy');
      if ($btn.data('label')) $btn.html($btn.data('label'));
    }
  }

  // ---------- Accessible confirm dialog ----------
  // UI.confirm({ title, message, confirmLabel, danger }) -> Promise<boolean>
  function confirm(opts) {
    return new Promise(function (resolve) {
      const previous = document.activeElement;
      const $modal = $(
        '<div class="fixed inset-0 z-[80] flex items-center justify-center p-4">' +
          '<div class="absolute inset-0 bg-ink/50" data-close></div>' +
          '<div role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby="cd-msg" class="relative card shadow-2xl w-full max-w-md p-6">' +
            '<h2 id="cd-title" class="text-lg font-bold">' + esc(opts.title || 'Are you sure?') + '</h2>' +
            '<p id="cd-msg" class="text-muted mt-2">' + esc(opts.message || '') + '</p>' +
            '<div class="mt-6 flex justify-end gap-2">' +
              '<button type="button" class="btn btn-secondary" data-cancel>Keep it</button>' +
              '<button type="button" class="btn ' + (opts.danger ? 'bg-danger text-white hover:bg-red-800' : 'btn-primary') + '" data-ok>' + esc(opts.confirmLabel || 'Confirm') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      ).appendTo('body');

      function close(result) {
        $modal.remove();
        $(document).off('keydown.confirm');
        if (previous) previous.focus();
        resolve(result);
      }
      $modal.find('[data-cancel], [data-close]').on('click', function () { close(false); });
      $modal.find('[data-ok]').on('click', function () { close(true); });
      $(document).on('keydown.confirm', function (e) {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Tab') { // keep focus inside the two buttons
          const $b = $modal.find('button');
          const first = $b.first()[0], last = $b.last()[0];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });
      $modal.find('[data-cancel]').trigger('focus');
    });
  }

  // ---------- Forms ----------
  // Shows an error under a field. Expects <p id="{fieldId}-error" class="field-error hidden">
  function fieldError(fieldId, message) {
    const $input = $('#' + fieldId);
    const $err = $('#' + fieldId + '-error');
    $input.attr('aria-invalid', 'true').attr('aria-describedby', fieldId + '-error');
    $err.text(message).removeClass('hidden');
  }

  function clearErrors($form) {
    $form.find('[aria-invalid]').removeAttr('aria-invalid');
    $form.find('.field-error').addClass('hidden').text('');
    $form.find('[data-form-alert]').addClass('hidden').text('');
  }

  function formAlert($form, message) {
    $form.find('[data-form-alert]').text(message).removeClass('hidden');
  }

  // Check a file before uploading. kind = 'image' | 'audio' | 'video'
  function checkFile(file, kind) {
    const rule = CONFIG.UPLOADS[kind];
    if (!file) return null;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (rule.exts.indexOf(ext) === -1) {
      const names = rule.exts.map(function (x) { return x.toUpperCase(); });
      return 'This file type isn\'t supported. Use ' + names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] + '.';
    }
    if (file.size > rule.maxMB * 1024 * 1024) {
      return 'This file is ' + (file.size / 1024 / 1024).toFixed(1) + ' MB. The limit is ' + rule.maxMB + ' MB.';
    }
    return null;
  }

  // Same rules as the backend: 8+ chars, upper, lower, number, special
  function passwordChecks(pw) {
    return {
      length: pw.length >= 8,
      lower: /[a-z]/.test(pw),
      upper: /[A-Z]/.test(pw),
      number: /\d/.test(pw),
      special: /[\W_]/.test(pw)
    };
  }

  // Show/hide buttons: <button data-toggle-password="inputId" aria-pressed="false">Show</button>
  function bindPasswordToggles() {
    $(document).on('click', '[data-toggle-password]', function () {
      const $input = $('#' + $(this).data('toggle-password'));
      const show = $input.attr('type') === 'password';
      $input.attr('type', show ? 'text' : 'password');
      $(this).text(show ? 'Hide' : 'Show').attr('aria-pressed', String(show))
        .attr('aria-label', (show ? 'Hide' : 'Show') + ' password');
    });
  }

  // ---------- Simple list cache (sessionStorage) ----------
  // Used for promos: show the cached list instantly, then refresh from the API.
  // Pages call cache.clear(key) after create / update / delete / publish.
  const cache = {
    get: function (key, maxAgeMs) {
      try {
        const raw = sessionStorage.getItem('ce_cache_' + key);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (maxAgeMs && Date.now() - entry.t > maxAgeMs) return null;
        return entry.v;
      } catch (e) { return null; }
    },
    set: function (key, value) {
      try { sessionStorage.setItem('ce_cache_' + key, JSON.stringify({ t: Date.now(), v: value })); } catch (e) { /* full */ }
    },
    clear: function (key) { sessionStorage.removeItem('ce_cache_' + key); }
  };

  // ---------- On/off switch ----------
  // Markup: <button type="button" role="switch" aria-checked="true" class="switch">
  //           <span class="switch-knob"></span></button>
  function switchHtml(id, on, label, extraAttrs) {
    return '<button type="button" role="switch" ' + (id ? 'id="' + id + '" ' : '') + 'aria-checked="' + (on ? 'true' : 'false') + '" ' +
      (label ? 'aria-label="' + esc(label) + '" ' : '') + (extraAttrs || '') +
      ' class="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ' + (on ? 'bg-civic' : 'bg-ink/30') + ' disabled:opacity-60">' +
      '<span aria-hidden="true" class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ' + (on ? 'translate-x-5' : 'translate-x-0') + '"></span>' +
    '</button>';
  }
  function setSwitch($btn, on) {
    $btn.attr('aria-checked', on ? 'true' : 'false')
      .toggleClass('bg-civic', on).toggleClass('bg-ink/30', !on);
    $btn.children('span').first().toggleClass('translate-x-5', on).toggleClass('translate-x-0', !on);
  }

  // ---------- Dates ----------
  function formatDate(iso, withTime) {
    if (!iso) return '';
    const d = new Date(iso);
    const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    if (withTime !== false) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  }

  function formatRange(startIso, endIso) {
    if (!startIso) return 'Date to be announced';
    if (!endIso) return formatDate(startIso);
    const s = new Date(startIso), e = new Date(endIso);
    const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
    if (s.toDateString() === e.toDateString()) {
      return formatDate(startIso) + ' – ' + time.format(e);
    }
    return formatDate(startIso) + ' – ' + formatDate(endIso);
  }

  function timeAgo(iso) {
    const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (sec < 60) return 'just now';
    if (sec < 3600) return rtf.format(-Math.floor(sec / 60), 'minute');
    if (sec < 86400) return rtf.format(-Math.floor(sec / 3600), 'hour');
    if (sec < 604800) return rtf.format(-Math.floor(sec / 86400), 'day');
    return formatDate(iso, false);
  }

  // yyyy-mm-dd in local time (for <input type="date"> comparisons)
  function toDateInput(iso) {
    const d = new Date(iso);
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // yyyy-mm-ddThh:mm in local time (for <input type="datetime-local">)
  function toDateTimeInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return toDateInput(iso) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function formatDuration(seconds) {
    if (!isFinite(seconds)) return '';
    const s = Math.round(seconds);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  return {
    esc, param, debounce, toast, flash, showFlash,
    skeletonCards, skeletonRows, emptyState, errorState, setBusy, confirm,
    fieldError, clearErrors, formAlert, checkFile, passwordChecks, bindPasswordToggles,
    cache, switchHtml, setSwitch,
    formatDate, formatRange, timeAgo, toDateInput, toDateTimeInput, formatDuration
  };
})();
