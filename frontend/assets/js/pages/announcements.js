/**
 * announcements.js — Announcements list (GET /api/announcements).
 * - Anyone signed in can play an announcement right from the list.
 * - The API has no duration field, so each card reads the length from the
 *   audio file's metadata.
 * - The API returns drafts too; normal users only see published ones.
 */
$(function () {
  // ROLE GUARD (page): any signed-in user.
  if (!Auth.requireAuth()) return;
  Layout.init('announcements');

  const isAdmin = Auth.isAdmin();
  const $list = $('#list');
  const $count = $('#results-count');
  const player = new Audio();
  const durations = {};
  let items = [];
  let playingId = null;
  let query = '';
  let status = 'all';

  const ICON_PLAY = '<svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 ml-0.5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  // play() returns a Promise in modern browsers; errors are handled by the 'error' event
  function safePlay(media) { const p = media.play(); if (p && p.catch) p.catch(function () {}); }

  load();

  async function load() {
    UI.skeletonRows($list, 4);
    $count.text('Loading announcements…');
    try {
      const res = await Api.announcements.list();
      items = res.data || [];
      render();
      loadDurations();
    } catch (err) {
      $count.text('');
      UI.errorState($list, err.message, load);
    }
  }

  function visible() {
    const q = query.trim().toLowerCase();
    return items.filter(function (a) {
      // ROLE GUARD (data): drafts are hidden from normal users.
      if (!isAdmin && a.published === false) return false;
      if (isAdmin && status === 'published' && a.published === false) return false;
      if (isAdmin && status === 'draft' && a.published !== false) return false;
      return !q || (a.title || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function durationText(id) {
    if (durations[id] === undefined) return 'Length loading…';
    if (durations[id] === null) return 'Length unknown';
    return 'Length ' + UI.formatDuration(durations[id]);
  }

  function row(a) {
    const id = UI.esc(a.id);
    const title = UI.esc(a.title);
    const playing = playingId === a.id && !player.paused;
    const draft = a.published === false;

    let admin = '';
    if (isAdmin) {
      // ROLE GUARD (render): publish switch, Edit and Delete exist only for admins.
      admin =
        '<div class="flex items-center gap-2">' +
          UI.switchHtml(null, !draft, 'Published: ' + a.title, 'data-publish="' + id + '"') +
          '<span class="text-sm" aria-hidden="true">' + (draft ? 'Draft' : 'Published') + '</span>' +
        '</div>' +
        '<a href="announcement-form.html?id=' + encodeURIComponent(a.id) + '" class="btn btn-secondary">Edit<span class="sr-only"> ' + title + '</span></a>' +
        '<button type="button" class="btn btn-danger" data-delete="' + id + '" aria-label="Delete ' + title + '">Delete</button>';
    }

    return '' +
      '<li class="card p-4 sm:p-5 relative overflow-hidden">' +
        '<div class="flex flex-wrap sm:flex-nowrap items-center gap-4">' +
          '<button type="button" data-play="' + id + '" aria-pressed="' + playing + '" aria-label="' + (playing ? 'Pause ' : 'Play ') + title + '" ' +
            'class="h-12 w-12 shrink-0 rounded-full bg-civic text-white grid place-items-center hover:bg-civic-dark">' + (playing ? ICON_PAUSE : ICON_PLAY) + '</button>' +
          '<div class="flex-1 min-w-0">' +
            (draft ? '<span class="badge bg-signal/30 text-ink mb-1">Draft</span>' : '') +
            '<h2 class="font-bold text-lg leading-snug"><a class="hover:underline" href="announcement.html?id=' + encodeURIComponent(a.id) + '">' + title + '</a></h2>' +
            '<p class="text-sm text-muted mt-0.5 flex flex-wrap gap-x-4">' +
              '<span data-duration="' + id + '">' + durationText(a.id) + '</span>' +
              '<span>Posted <time datetime="' + UI.esc(a.created_at) + '">' + UI.esc(UI.formatDate(a.created_at, false)) + '</time></span>' +
            '</p>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">' +
            '<a href="announcement.html?id=' + encodeURIComponent(a.id) + '" class="btn btn-secondary">Open<span class="sr-only"> ' + title + '</span></a>' +
            admin +
          '</div>' +
        '</div>' +
        '<div class="absolute left-0 bottom-0 h-1 bg-signal" data-progress="' + id + '" style="width:0%" aria-hidden="true"></div>' +
      '</li>';
  }

  function render() {
    const list = visible();
    $list.attr('aria-busy', 'false');
    if (!items.length) {
      $count.text('');
      UI.emptyState($list, {
        title: 'No announcements yet',
        text: isAdmin ? 'Record a short audio message and upload it to share it with everyone.' : 'When the city posts an announcement, you\'ll get a notification.',
        actionHtml: isAdmin ? '<a href="announcement-form.html" class="btn btn-primary">New announcement</a>' : ''
      });
      return;
    }
    if (!list.length) {
      $count.text('No announcements match your search.');
      UI.emptyState($list, { title: 'No matches', text: 'Try a different word, or clear the search.' });
      return;
    }
    $count.text(list.length + ' announcement' + (list.length === 1 ? '' : 's'));
    $list.html('<ul class="space-y-3">' + list.map(row).join('') + '</ul>');
  }

  // Read each file's length from its metadata (only the header is downloaded)
  function loadDurations() {
    items.forEach(function (a) {
      if (durations[a.id] !== undefined || !a.audio_url) return;
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.addEventListener('loadedmetadata', function () {
        durations[a.id] = isFinite(probe.duration) ? probe.duration : null;
        $('[data-duration="' + a.id + '"]').text(durationText(a.id));
      });
      probe.addEventListener('error', function () {
        durations[a.id] = null;
        $('[data-duration="' + a.id + '"]').text(durationText(a.id));
      });
      probe.src = a.audio_url;
    });
  }

  // ---------- Inline player (one at a time) ----------
  function updatePlayButtons() {
    $list.find('[data-play]').each(function () {
      const id = String($(this).data('play'));
      const a = items.find(function (x) { return x.id === id; }) || {};
      const playing = id === playingId && !player.paused;
      $(this).attr('aria-pressed', String(playing))
        .attr('aria-label', (playing ? 'Pause ' : 'Play ') + a.title)
        .html(playing ? ICON_PAUSE : ICON_PLAY);
    });
  }

  $list.on('click', '[data-play]', function () {
    const id = String($(this).data('play'));
    const a = items.find(function (x) { return x.id === id; });
    if (!a) return;
    if (playingId === id) {
      player.paused ? safePlay(player) : player.pause();
    } else {
      $('[data-progress]').css('width', '0%');
      playingId = id;
      player.src = a.audio_url;
      safePlay(player);
    }
  });

  player.addEventListener('play', updatePlayButtons);
  player.addEventListener('pause', updatePlayButtons);
  player.addEventListener('ended', function () { $('[data-progress="' + playingId + '"]').css('width', '0%'); updatePlayButtons(); });
  player.addEventListener('timeupdate', function () {
    if (!player.duration) return;
    $('[data-progress="' + playingId + '"]').css('width', (player.currentTime / player.duration * 100) + '%');
  });
  player.addEventListener('error', function () {
    UI.toast('This audio couldn\'t be played. Open the announcement to download it instead.', 'error');
    playingId = null;
    updatePlayButtons();
  });

  // ---------- Search / status ----------
  $('#search').on('input', UI.debounce(function () { query = $(this).val(); render(); }, 200));
  $('#status').on('change', function () { status = $(this).val(); render(); });

  // ---------- Admin: publish toggle (optimistic) ----------
  $list.on('click', '[data-publish]', async function () {
    const $sw = $(this);
    const id = String($sw.data('publish'));
    const a = items.find(function (x) { return x.id === id; });
    const next = a.published === false; // flip
    a.published = next;
    UI.setSwitch($sw, next);
    $sw.next().text(next ? 'Published' : 'Draft');
    $sw.prop('disabled', true);
    try {
      await (next ? Api.announcements.publish(id) : Api.announcements.unpublish(id));
      UI.toast(next ? 'Published "' + a.title + '". Everyone has been notified.' : 'Moved "' + a.title + '" to drafts.', 'success');
      render();
      $list.find('[data-publish="' + id + '"]').trigger('focus');
      if (next) Layout.refreshNotifications();
    } catch (err) {
      a.published = !next; // revert
      render();
      UI.toast(err.message, 'error');
    }
  });

  // ---------- Admin: delete ----------
  $list.on('click', '[data-delete]', async function () {
    const $btn = $(this);
    const id = String($btn.data('delete'));
    const a = items.find(function (x) { return x.id === id; });
    const ok = await UI.confirm({ title: 'Delete this announcement?', message: '"' + a.title + '" will be removed for everyone.', confirmLabel: 'Delete announcement', danger: true });
    if (!ok) return;
    UI.setBusy($btn, true, 'Deleting…');
    try {
      await Api.announcements.remove(id);
      if (playingId === id) { player.pause(); playingId = null; }
      items = items.filter(function (x) { return x.id !== id; });
      render();
      UI.toast('Deleted "' + a.title + '".', 'success');
      $count.trigger('focus');
    } catch (err) {
      UI.setBusy($btn, false);
      UI.toast(err.message, 'error');
    }
  });
});
