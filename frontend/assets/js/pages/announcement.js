/**
 * announcement.js — Announcement detail (GET /api/announcements/:id)
 * Accessible audio player built on an HTML5 <audio> element:
 *  - labelled buttons for play/pause, back/forward 10s, mute
 *  - seek and volume sliders that announce their values
 *  - current time / duration, playback speed, download fallback
 *  - keyboard: Space or K = play/pause, Left/Right = skip 5s
 */
$(function () {
  // ROLE GUARD (page): any signed-in user.
  if (!Auth.requireAuth()) return;
  Layout.init('announcements');

  const id = UI.param('id');
  const isAdmin = Auth.isAdmin();
  const $root = $('#root');
  let item = null;
  let audio = null;

  const ICON_PLAY = '<svg aria-hidden="true" viewBox="0 0 24 24" class="h-7 w-7 ml-1" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg aria-hidden="true" viewBox="0 0 24 24" class="h-7 w-7" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  if (!id) { notFound(); return; }
  load();

  async function load() {
    try {
      const res = await Api.announcements.get(id);
      item = res.data;
    } catch (err) {
      if (err.status === 404) notFound(); else UI.errorState($root, err.message, load);
      return;
    }
    // ROLE GUARD (data): drafts are only visible to admins.
    if (!isAdmin && item.published === false) { notFound(); return; }
    document.title = item.title + ' | CivicEvents';
    render();
    bindPlayer();
  }

  function notFound() {
    $root.attr('aria-busy', 'false').html(
      '<div class="card p-10 text-center"><h1 class="text-2xl font-extrabold">Announcement not found</h1>' +
      '<p class="text-muted mt-2">It may have been removed, or the link is incorrect.</p>' +
      '<a href="announcements.html" class="btn btn-primary mt-6">All announcements</a></div>'
    );
  }

  function render() {
    const url = UI.esc(item.audio_url);
    const draft = item.published === false;
    $root.attr('aria-busy', 'false').html(
      '<article aria-labelledby="ann-title">' +
        (draft ? '<span class="badge bg-signal/30 text-ink mb-2">Draft</span>' : '') +
        '<h1 id="ann-title" class="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">' + UI.esc(item.title) + '</h1>' +
        '<p class="text-muted mt-2">Posted <time datetime="' + UI.esc(item.created_at) + '">' + UI.esc(UI.formatDate(item.created_at)) + '</time></p>' +

        '<section id="player" class="card p-5 sm:p-6 mt-6 border-t-4 border-t-signal" aria-label="Audio player for ' + UI.esc(item.title) + '">' +
          '<audio id="audio" preload="metadata" src="' + url + '">' +
            '<p>Your browser can\'t play this audio. <a href="' + url + '" download>Download the audio file</a> to listen.</p>' +
          '</audio>' +

          '<div class="flex items-center gap-2 sm:gap-4">' +
            '<button id="ap-back" type="button" class="btn btn-secondary px-3" aria-label="Back 10 seconds">−10s</button>' +
            '<button id="ap-play" type="button" class="h-14 w-14 shrink-0 rounded-full bg-civic text-white grid place-items-center hover:bg-civic-dark" aria-label="Play">' + ICON_PLAY + '</button>' +
            '<button id="ap-fwd" type="button" class="btn btn-secondary px-3" aria-label="Forward 10 seconds">+10s</button>' +
            '<div class="flex-1 min-w-0 ml-1">' +
              '<label for="ap-seek" class="sr-only">Playback position</label>' +
              '<input id="ap-seek" type="range" min="0" max="0" step="1" value="0" class="w-full accent-civic" aria-valuetext="0:00 of unknown length">' +
              '<div class="flex justify-between text-sm tabular-nums mt-1" aria-hidden="true"><span id="ap-current">0:00</span><span id="ap-duration">--:--</span></div>' +
            '</div>' +
          '</div>' +

          '<div class="flex flex-wrap items-center gap-x-6 gap-y-3 mt-5 pt-4 border-t border-ink/10 text-sm">' +
            '<div class="flex items-center gap-2">' +
              '<button id="ap-mute" type="button" class="btn btn-secondary px-3 py-1.5" aria-pressed="false">Mute</button>' +
              '<label for="ap-volume" class="sr-only">Volume</label>' +
              '<input id="ap-volume" type="range" min="0" max="1" step="0.05" value="1" class="w-28 accent-civic" aria-valuetext="100%">' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<label for="ap-speed" class="font-semibold">Speed</label>' +
              '<select id="ap-speed" class="input w-auto py-1">' +
                '<option value="0.75">0.75×</option><option value="1" selected>Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option>' +
              '</select>' +
            '</div>' +
            '<a href="' + url + '" download class="sm:ml-auto font-semibold text-civic underline">Download audio</a>' +
          '</div>' +

          '<p id="ap-error" role="alert" class="hidden mt-4 rounded-md bg-red-50 border border-danger/30 text-danger px-4 py-3 text-sm"></p>' +
          '<p id="ap-status" class="sr-only" aria-live="polite"></p>' +
          '<p class="text-xs text-muted mt-4">Keyboard: Space or K plays and pauses. Left and right arrow keys skip 5 seconds.</p>' +
        '</section>' +

        '<section class="mt-8" aria-labelledby="transcript-heading">' +
          '<h2 id="transcript-heading" class="text-xl font-bold">Transcript</h2>' +
          '<p class="mt-2 text-muted max-w-prose">No transcript was provided for this announcement. If you need it in another format, contact <a class="underline" href="mailto:help@civicevents.example">help@civicevents.example</a>.</p>' +
        '</section>' +

        // ROLE GUARD (render): admin controls only exist for admins.
        (isAdmin
          ? '<section class="card p-5 mt-8" aria-labelledby="manage-heading">' +
              '<h2 id="manage-heading" class="font-bold">Manage announcement</h2>' +
              '<div class="mt-4 flex flex-wrap items-center gap-4">' +
                '<div class="flex items-center gap-2">' + UI.switchHtml('pub-switch', !draft, null, 'aria-labelledby="pub-label"') + '<span id="pub-label" class="text-sm font-semibold">Published</span></div>' +
                '<a href="announcement-form.html?id=' + encodeURIComponent(item.id) + '" class="btn btn-secondary">Edit</a>' +
                '<button id="delete-btn" type="button" class="btn btn-danger">Delete</button>' +
              '</div>' +
            '</section>'
          : '') +
      '</article>'
    );
  }

  // ---------- Player ----------
  function bindPlayer() {
    audio = document.getElementById('audio');
    const $play = $('#ap-play'), $seek = $('#ap-seek'), $status = $('#ap-status');

    function sync() {
      const playing = !audio.paused;
      $play.html(playing ? ICON_PAUSE : ICON_PLAY).attr('aria-label', playing ? 'Pause' : 'Play');
    }
    function timeText() {
      const d = isFinite(audio.duration) ? UI.formatDuration(audio.duration) : 'unknown length';
      return UI.formatDuration(audio.currentTime) + ' of ' + d;
    }
    function toggle() {
      if (audio.paused) { const p = audio.play(); if (p && p.catch) p.catch(function () {}); } else audio.pause();
    }
    function skip(sec) {
      const max = isFinite(audio.duration) ? audio.duration : audio.currentTime + sec;
      audio.currentTime = Math.max(0, Math.min(max, audio.currentTime + sec));
    }

    audio.addEventListener('loadedmetadata', function () {
      if (isFinite(audio.duration)) {
        $seek.attr('max', Math.floor(audio.duration));
        $('#ap-duration').text(UI.formatDuration(audio.duration));
      }
      $seek.attr('aria-valuetext', timeText());
    });
    audio.addEventListener('timeupdate', function () {
      $('#ap-current').text(UI.formatDuration(audio.currentTime));
      if (!$seek.is(':focus')) $seek.val(Math.floor(audio.currentTime));
      $seek.attr('aria-valuetext', timeText());
    });
    audio.addEventListener('play', function () { sync(); $status.text('Playing'); });
    audio.addEventListener('pause', function () { sync(); $status.text('Paused at ' + UI.formatDuration(audio.currentTime)); });
    audio.addEventListener('ended', function () { sync(); $status.text('Finished'); });
    audio.addEventListener('error', function () {
      $('#ap-error').html('This audio couldn\'t be played in your browser. <a class="underline font-semibold" href="' + UI.esc(item.audio_url) + '" download>Download the file</a> to listen instead.').removeClass('hidden');
      $('#ap-play, #ap-back, #ap-fwd, #ap-seek').prop('disabled', true);
    });

    $play.on('click', toggle);
    $('#ap-back').on('click', function () { skip(-10); });
    $('#ap-fwd').on('click', function () { skip(10); });
    $seek.on('input', function () { audio.currentTime = Number($(this).val()); });
    $('#ap-volume').on('input', function () {
      audio.volume = Number($(this).val());
      audio.muted = audio.volume === 0;
      $(this).attr('aria-valuetext', Math.round(audio.volume * 100) + '%');
      $('#ap-mute').attr('aria-pressed', String(audio.muted)).text(audio.muted ? 'Unmute' : 'Mute');
    });
    $('#ap-mute').on('click', function () {
      audio.muted = !audio.muted;
      $(this).attr('aria-pressed', String(audio.muted)).text(audio.muted ? 'Unmute' : 'Mute');
    });
    $('#ap-speed').on('change', function () { audio.playbackRate = Number($(this).val()); });

    // Keyboard shortcuts, ignored while typing or using a slider/select
    $(document).on('keydown', function (e) {
      if ($(e.target).is('input, select, textarea, [contenteditable]')) return;
      if ($(e.target).is('button, a') && (e.key === ' ' || e.key === 'Enter')) return; // let buttons work normally
      if (e.key === ' ' || e.key === 'k' || e.key === 'K') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-5); }
      if (e.key === 'ArrowRight') { e.preventDefault(); skip(5); }
    });
  }

  // ---------- Admin actions ----------
  $root.on('click', '#pub-switch', async function () {
    const $sw = $(this);
    const next = item.published === false;
    UI.setSwitch($sw, next); // optimistic
    $sw.prop('disabled', true);
    try {
      const res = await (next ? Api.announcements.publish(item.id) : Api.announcements.unpublish(item.id));
      item = Object.assign(item, res.data || { published: next });
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
    const ok = await UI.confirm({ title: 'Delete this announcement?', message: '"' + item.title + '" will be removed for everyone.', confirmLabel: 'Delete announcement', danger: true });
    if (!ok) return;
    UI.setBusy($btn, true, 'Deleting…');
    try {
      await Api.announcements.remove(item.id);
      UI.flash('Deleted "' + item.title + '".', 'success');
      window.location.href = 'announcements.html';
    } catch (err) {
      UI.setBusy($btn, false);
      UI.toast(err.message, 'error');
    }
  });
});
