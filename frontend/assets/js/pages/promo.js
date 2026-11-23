/**
 * promo.js — Promo detail (GET /api/promos/:id)
 *
 * Captions: the backend stores captions as plain text (caption_text), not as a
 * caption file. Once the video's length is known, this page turns the text into
 * a WebVTT file in the browser (timed by sentence length), and attaches it as
 * <track kind="captions" srclang="en" label="English" default>.
 * If caption_text is already WebVTT, it is used as is.
 * Captions are on by default and the full text is also shown as a transcript.
 */
$(function () {
  // ROLE GUARD (page): any signed-in user.
  if (!Auth.requireAuth()) return;
  Layout.init('promos');

  const id = UI.param('id');
  const isAdmin = Auth.isAdmin();
  const $root = $('#root');
  let promo = null;
  let video = null;
  let track = null;

  if (!id) { notFound(); return; }
  load();

  async function load() {
    try {
      const res = await Api.promos.get(id);
      promo = res.data;
    } catch (err) {
      if (err.status === 404) notFound(); else UI.errorState($root, err.message, load);
      return;
    }
    // ROLE GUARD (data): drafts are only visible to admins.
    if (!isAdmin && promo.published === false) { notFound(); return; }
    document.title = promo.title + ' | CivicEvents';
    render();
    setupVideo();
  }

  function notFound() {
    $root.attr('aria-busy', 'false').html(
      '<div class="card p-10 text-center"><h1 class="text-2xl font-extrabold">Promo not found</h1>' +
      '<p class="text-muted mt-2">It may have been removed, or the link is incorrect.</p>' +
      '<a href="promos.html" class="btn btn-primary mt-6">All promos</a></div>'
    );
  }

  // ---------- WebVTT from plain text ----------
  function vttTime(sec) {
    const ms = Math.round(sec * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
    const p = function (n, w) { return String(n).padStart(w || 2, '0'); };
    return p(h) + ':' + p(m) + ':' + p(s) + '.' + p(r, 3);
  }

  function buildVtt(text, duration) {
    const raw = (text || '').trim();
    if (/^WEBVTT/.test(raw)) return raw;

    // Split into sentences, then into chunks of about 2 lines (≤ 84 chars)
    const sentences = raw.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || [raw];
    const chunks = [];
    sentences.forEach(function (s) {
      const words = s.trim().split(' ');
      let line = '';
      words.forEach(function (w) {
        if ((line + ' ' + w).trim().length > 84) { chunks.push(line.trim()); line = w; }
        else line += ' ' + w;
      });
      if (line.trim()) chunks.push(line.trim());
    });

    const total = isFinite(duration) && duration > 0 ? duration : chunks.length * 4;
    const totalChars = chunks.reduce(function (n, c) { return n + c.length; }, 0) || 1;
    const clean = function (c) { return c.replace(/-->/g, '→').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

    let t = 0;
    const cues = chunks.map(function (c, i) {
      const len = total * (c.length / totalChars);
      const cue = (i + 1) + '\n' + vttTime(t) + ' --> ' + vttTime(t + len) + '\n' + clean(c);
      t += len;
      return cue;
    });
    return 'WEBVTT\n\n' + cues.join('\n\n') + '\n';
  }

  // Plain transcript text (strips timings if the captions were WebVTT)
  function transcriptText() {
    const raw = (promo.caption_text || '').trim();
    if (!/^WEBVTT/.test(raw)) return raw;
    return raw.split('\n').filter(function (l) {
      return l && !/^WEBVTT/.test(l) && l.indexOf('-->') === -1 && !/^\d+$/.test(l.trim());
    }).join(' ');
  }

  // ---------- Page ----------
  function render() {
    const url = UI.esc(promo.video_url);
    const draft = promo.published === false;
    const hasCaptions = !!(promo.caption_text || '').trim();

    $root.attr('aria-busy', 'false').html(
      '<article aria-labelledby="promo-title">' +
        (draft ? '<span class="badge bg-signal/30 text-ink mb-2">Draft</span>' : '') +
        '<h1 id="promo-title" class="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">' + UI.esc(promo.title) + '</h1>' +
        '<p class="text-muted mt-2">Posted <time datetime="' + UI.esc(promo.created_at) + '">' + UI.esc(UI.formatDate(promo.created_at, false)) + '</time></p>' +

        '<div class="mt-6 rounded-lg overflow-hidden bg-ink border-t-4 border-signal">' +
          // Native controls give play/pause, volume, fullscreen and the captions menu
          '<video id="video" class="w-full aspect-video bg-ink" controls playsinline preload="metadata" aria-describedby="promo-desc">' +
            '<source src="' + url + '">' +
            '<p class="p-4 text-white">Your browser can\'t play this video. <a class="underline" href="' + url + '" download>Download the video</a> and read the transcript below.</p>' +
          '</video>' +
        '</div>' +

        '<div class="mt-3 flex flex-wrap items-center gap-3">' +
          (hasCaptions
            ? '<button id="cc-btn" type="button" class="btn btn-secondary" aria-pressed="true">Captions on</button>'
            : '<span class="text-sm text-muted">No captions were provided for this promo.</span>') +
          '<a href="#transcript-heading" class="text-sm font-semibold text-civic underline">Read the transcript</a>' +
          '<a href="' + url + '" download class="text-sm font-semibold text-civic underline sm:ml-auto">Download video</a>' +
        '</div>' +
        '<p id="video-error" role="alert" class="hidden mt-3 rounded-md bg-red-50 border border-danger/30 text-danger px-4 py-3 text-sm"></p>' +

        '<section class="mt-8" aria-labelledby="about-heading">' +
          '<h2 id="about-heading" class="text-xl font-bold">About this promo</h2>' +
          '<p id="promo-desc" class="mt-2 leading-relaxed max-w-prose whitespace-pre-line">' + (promo.description ? UI.esc(promo.description) : 'No description.') + '</p>' +
        '</section>' +

        '<section class="mt-8" aria-labelledby="transcript-heading">' +
          '<h2 id="transcript-heading" tabindex="-1" class="text-xl font-bold">Transcript</h2>' +
          '<p class="mt-2 leading-relaxed max-w-prose whitespace-pre-line">' + (hasCaptions ? UI.esc(transcriptText()) : '<span class="text-muted">No transcript available.</span>') + '</p>' +
        '</section>' +

        // ROLE GUARD (render): admin controls only exist for admins.
        (isAdmin
          ? '<section class="card p-5 mt-8" aria-labelledby="manage-heading">' +
              '<h2 id="manage-heading" class="font-bold">Manage promo</h2>' +
              '<div class="mt-4 flex flex-wrap items-center gap-4">' +
                '<div class="flex items-center gap-2">' + UI.switchHtml('pub-switch', !draft, null, 'aria-labelledby="pub-label"') + '<span id="pub-label" class="text-sm font-semibold">Published</span></div>' +
                '<a href="promo-form.html?id=' + encodeURIComponent(promo.id) + '" class="btn btn-secondary">Edit</a>' +
                '<button id="delete-btn" type="button" class="btn btn-danger">Delete</button>' +
              '</div>' +
            '</section>'
          : '') +
      '</article>'
    );
  }

  // ---------- Video + captions ----------
  function setupVideo() {
    video = document.getElementById('video');
    const hasCaptions = !!(promo.caption_text || '').trim();

    function attachCaptions() {
      if (!hasCaptions || track) return;
      const vtt = buildVtt(promo.caption_text, video.duration);
      const src = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      track = document.createElement('track');
      track.kind = 'captions';
      track.srclang = 'en';
      track.label = 'English';
      track.default = true;
      track.src = src;
      video.appendChild(track);
      if (video.textTracks[0]) video.textTracks[0].mode = 'showing'; // on by default
    }

    if (video.readyState >= 1) attachCaptions();
    video.addEventListener('loadedmetadata', attachCaptions);

    // Keep our button in sync if captions are changed from the native menu
    video.textTracks.addEventListener('change', function () {
      const on = video.textTracks[0] && video.textTracks[0].mode === 'showing';
      $('#cc-btn').attr('aria-pressed', String(on)).text(on ? 'Captions on' : 'Captions off');
    });

    video.addEventListener('error', showVideoError);
    $(video).find('source').on('error', showVideoError);

    $('#cc-btn').on('click', function () {
      const t = video.textTracks[0];
      if (!t) return;
      const on = t.mode !== 'showing';
      t.mode = on ? 'showing' : 'hidden';
      $(this).attr('aria-pressed', String(on)).text(on ? 'Captions on' : 'Captions off');
    });
  }

  function showVideoError() {
    $('#video-error').html('This video couldn\'t be played in your browser (MP4 works best). <a class="underline font-semibold" href="' + UI.esc(promo.video_url) + '" download>Download it</a> or read the transcript below.').removeClass('hidden');
  }

  // ---------- Admin actions ----------
  $root.on('click', '#pub-switch', async function () {
    const $sw = $(this);
    const next = promo.published === false;
    UI.setSwitch($sw, next); // optimistic
    $sw.prop('disabled', true);
    try {
      await (next ? Api.promos.publish(promo.id) : Api.promos.unpublish(promo.id));
      promo.published = next;
      UI.cache.clear('promos');
      UI.toast(next ? 'Published. Everyone has been notified.' : 'Moved to drafts. Only admins can see it now.', 'success');
      if (next) Layout.refreshNotifications();
    } catch (err) {
      UI.setSwitch($sw, !next); // revert
      UI.toast(err.message, 'error');
    }
    $sw.prop('disabled', false);
  });

  $root.on('click', '#delete-btn', async function () {
    const $btn = $(this);
    const ok = await UI.confirm({ title: 'Delete this promo?', message: '"' + promo.title + '" and its video will be removed for everyone.', confirmLabel: 'Delete promo', danger: true });
    if (!ok) return;
    UI.setBusy($btn, true, 'Deleting…');
    try {
      await Api.promos.remove(promo.id);
      UI.cache.clear('promos');
      UI.flash('Deleted "' + promo.title + '".', 'success');
      window.location.href = 'promos.html';
    } catch (err) {
      UI.setBusy($btn, false);
      UI.toast(err.message, 'error');
    }
  });
});
