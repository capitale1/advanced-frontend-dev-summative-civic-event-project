/**
 * promos.js — Promos list (GET /api/promos).
 *  - Cached in sessionStorage: the last list shows instantly, then refreshes
 *    from the API. The cache is cleared whenever an admin changes a promo.
 *  - Thumbnails are the video's first frame, loaded only when the card
 *    scrolls into view (lazy loading for heavy media).
 */
$(function () {
  // ROLE GUARD (page): any signed-in user.
  if (!Auth.requireAuth()) return;
  Layout.init('promos');

  const CACHE_KEY = 'promos';
  const CACHE_MAX_AGE = 5 * 60 * 1000;
  const isAdmin = Auth.isAdmin();
  const $list = $('#list');
  const $count = $('#results-count');
  let items = [];
  let query = '';
  let status = 'all';
  let observer = null;

  load();

  async function load() {
    const cached = UI.cache.get(CACHE_KEY, CACHE_MAX_AGE);
    if (cached) { items = cached; render(); }
    else { UI.skeletonCards($list.addClass('grid gap-6 sm:grid-cols-2 lg:grid-cols-3'), 6); $count.text('Loading promos…'); }
    try {
      const res = await Api.promos.list();
      items = res.data || [];
      UI.cache.set(CACHE_KEY, items);
      render();
    } catch (err) {
      if (cached) { UI.toast('Showing saved promos. ' + err.message, 'error'); return; }
      $count.text('');
      UI.errorState($list, err.message, load);
    }
  }

  function visible() {
    const q = query.trim().toLowerCase();
    return items.filter(function (p) {
      // ROLE GUARD (data): drafts are hidden from normal users.
      if (!isAdmin && p.published === false) return false;
      if (isAdmin && status === 'published' && p.published === false) return false;
      if (isAdmin && status === 'draft' && p.published !== false) return false;
      return !q || [p.title, p.description].some(function (v) { return (v || '').toLowerCase().indexOf(q) !== -1; });
    });
  }

  function card(p) {
    const id = UI.esc(p.id);
    const title = UI.esc(p.title);
    const href = 'promo.html?id=' + encodeURIComponent(p.id);
    const draft = p.published === false;

    let admin = '';
    if (isAdmin) {
      // ROLE GUARD (render): publish switch, Edit and Delete exist only for admins.
      admin =
        '<div class="flex items-center gap-2 mr-auto">' +
          UI.switchHtml(null, !draft, 'Published: ' + p.title, 'data-publish="' + id + '"') +
          '<span class="text-sm" aria-hidden="true">' + (draft ? 'Draft' : 'Published') + '</span>' +
        '</div>' +
        '<a href="promo-form.html?id=' + encodeURIComponent(p.id) + '" class="btn btn-secondary">Edit<span class="sr-only"> ' + title + '</span></a>' +
        '<button type="button" class="btn btn-danger" data-delete="' + id + '" aria-label="Delete ' + title + '">Delete</button>';
    }

    return '' +
      '<article class="card overflow-hidden flex flex-col" aria-labelledby="pr-' + id + '">' +
        '<a href="' + href + '" class="relative block aspect-video bg-ink group" tabindex="-1" aria-hidden="true">' +
          // Thumbnail: first frame of the video, src set when visible
          '<video class="h-full w-full object-cover opacity-90" muted playsinline preload="none" data-lazy-src="' + UI.esc(p.video_url) + '#t=0.5"></video>' +
          '<span class="absolute inset-0 grid place-items-center">' +
            '<span class="h-14 w-14 rounded-full bg-signal text-ink grid place-items-center shadow-lg group-hover:scale-105 transition-transform">' +
              '<svg viewBox="0 0 24 24" class="h-6 w-6 ml-1" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '</span>' +
          '</span>' +
          (p.caption_text ? '<span class="absolute left-3 bottom-3 badge bg-white text-ink">CC</span>' : '') +
        '</a>' +
        '<div class="p-5 flex flex-col flex-1">' +
          (draft ? '<span class="badge bg-signal/30 text-ink mb-2 self-start">Draft</span>' : '') +
          '<h2 id="pr-' + id + '" class="text-lg font-bold leading-snug"><a href="' + href + '" class="hover:underline">' + title + '</a></h2>' +
          (p.description ? '<p class="text-sm text-muted mt-2 line-clamp-3">' + UI.esc(p.description) + '</p>' : '') +
          '<p class="text-xs text-muted mt-3">Posted <time datetime="' + UI.esc(p.created_at) + '">' + UI.esc(UI.formatDate(p.created_at, false)) + '</time></p>' +
          '<div class="mt-auto pt-5 flex flex-wrap items-center gap-2">' +
            '<a href="' + href + '" class="btn btn-primary">Play<span class="sr-only"> ' + title + ' with captions</span></a>' +
            admin +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function render() {
    const list = visible();
    $list.attr('aria-busy', 'false').addClass('grid gap-6 sm:grid-cols-2 lg:grid-cols-3');
    if (!items.length) {
      $count.text('');
      UI.emptyState($list, {
        title: 'No promos yet',
        text: isAdmin ? 'Upload a short video with captions to share it with everyone.' : 'New promos will appear here and in your notifications.',
        actionHtml: isAdmin ? '<a href="promo-form.html" class="btn btn-primary">New promo</a>' : ''
      });
      return;
    }
    if (!list.length) {
      $count.text('No promos match your search.');
      UI.emptyState($list, { title: 'No matches', text: 'Try a different word, or clear the search.' });
      return;
    }
    $count.text(list.length + ' promo' + (list.length === 1 ? '' : 's'));
    $list.html(list.map(card).join(''));
    lazyThumbnails();
  }

  function lazyThumbnails() {
    if (observer) observer.disconnect();
    const videos = $list.find('video[data-lazy-src]').toArray();
    const loadOne = function (v) {
      v.preload = 'metadata';
      v.src = v.getAttribute('data-lazy-src');
      v.removeAttribute('data-lazy-src');
    };
    if (!('IntersectionObserver' in window)) { videos.forEach(loadOne); return; }
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { loadOne(entry.target); observer.unobserve(entry.target); }
      });
    }, { rootMargin: '200px' });
    videos.forEach(function (v) { observer.observe(v); });
  }

  $('#search').on('input', UI.debounce(function () { query = $(this).val(); render(); }, 200));
  $('#status').on('change', function () { status = $(this).val(); render(); });

  // ---------- Admin: publish toggle (optimistic, reverts on failure) ----------
  $list.on('click', '[data-publish]', async function () {
    const $sw = $(this);
    const id = String($sw.data('publish'));
    const p = items.find(function (x) { return x.id === id; });
    const next = p.published === false;
    p.published = next;
    UI.setSwitch($sw, next);
    $sw.next().text(next ? 'Published' : 'Draft');
    $sw.prop('disabled', true);
    try {
      await (next ? Api.promos.publish(id) : Api.promos.unpublish(id));
      UI.cache.set(CACHE_KEY, items);
      UI.toast(next ? 'Published "' + p.title + '".' : 'Moved "' + p.title + '" to drafts.', 'success');
      render();
      $list.find('[data-publish="' + id + '"]').trigger('focus');
      if (next) Layout.refreshNotifications();
    } catch (err) {
      p.published = !next;
      render();
      UI.toast(err.message, 'error');
    }
  });

  // ---------- Admin: delete ----------
  $list.on('click', '[data-delete]', async function () {
    const $btn = $(this);
    const id = String($btn.data('delete'));
    const p = items.find(function (x) { return x.id === id; });
    const ok = await UI.confirm({ title: 'Delete this promo?', message: '"' + p.title + '" and its video will be removed for everyone.', confirmLabel: 'Delete promo', danger: true });
    if (!ok) return;
    UI.setBusy($btn, true, 'Deleting…');
    try {
      await Api.promos.remove(id);
      items = items.filter(function (x) { return x.id !== id; });
      UI.cache.set(CACHE_KEY, items);
      render();
      UI.toast('Deleted "' + p.title + '".', 'success');
      $count.trigger('focus');
    } catch (err) {
      UI.setBusy($btn, false);
      UI.toast(err.message, 'error');
    }
  });
});
