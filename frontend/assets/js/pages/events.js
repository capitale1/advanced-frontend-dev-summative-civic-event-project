/**
 * events.js — Events list (GET /api/events).
 * The API returns every event with no paging or filters, so search,
 * filters and pagination all happen here in the browser.
 */
$(function () {
  // ROLE GUARD (page): any signed-in user can view events.
  if (!Auth.requireAuth()) return;
  Layout.init('events');

  const PAGE_SIZE = 9;
  const isAdmin = Auth.isAdmin();
  const $grid = $('#events-grid');
  const $count = $('#results-count');
  const $pager = $('#pagination');

  let allEvents = [];
  const myRegs = new Map(); // event_id -> 'registered' | 'cancelled'
  const state = { q: UI.param('q') || '', when: 'upcoming', date: '', location: '', page: 1 };

  // A search from the header looks across all dates
  if (state.q) state.when = 'all';
  $('#f-q').val(state.q);
  $('#f-when').val(state.when);

  load();

  async function load() {
    UI.skeletonCards($grid, 6);
    $pager.empty();
    $count.text('Loading events…');
    try {
      const results = await Promise.all([
        Api.events.list(),
        // Admins don't register, so only normal users need their registrations
        isAdmin ? Promise.resolve({ data: [] }) : Api.registrations.mine()
      ]);
      allEvents = results[0].data || [];
      myRegs.clear();
      (results[1].data || []).forEach(function (r) { myRegs.set(r.event_id, r.status); });
      fillLocations();
      render();
    } catch (err) {
      $count.text('');
      UI.errorState($grid, err.message, load);
    }
  }

  function fillLocations() {
    const places = Array.from(new Set(allEvents.map(function (e) { return (e.location || '').trim(); }).filter(Boolean))).sort();
    const $sel = $('#f-location');
    $sel.find('option:not(:first)').remove();
    places.forEach(function (p) { $sel.append($('<option>').val(p).text(p)); });
    $sel.val(state.location);
  }

  function filtered() {
    const now = Date.now();
    const q = state.q.trim().toLowerCase();
    return allEvents.filter(function (e) {
      // ROLE GUARD (data): normal users only see published events.
      if (!isAdmin && e.published === false) return false;
      const end = new Date(e.ends_at || e.starts_at).getTime();
      if (state.when === 'upcoming' && end < now) return false;
      if (state.when === 'past' && end >= now) return false;
      if (state.date && UI.toDateInput(e.starts_at) !== state.date) return false;
      if (state.location && (e.location || '').trim() !== state.location) return false;
      if (q && ![e.title, e.description, e.location].some(function (v) { return (v || '').toLowerCase().indexOf(q) !== -1; })) return false;
      return true;
    }).sort(function (a, b) {
      const diff = new Date(a.starts_at) - new Date(b.starts_at);
      return state.when === 'past' ? -diff : diff;
    });
  }

  function card(e) {
    const id = UI.esc(e.id);
    const title = UI.esc(e.title);
    const start = new Date(e.starts_at);
    const month = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(start);
    const img = e.metadata && e.metadata.image_url;
    const past = new Date(e.ends_at || e.starts_at).getTime() < Date.now();
    const status = myRegs.get(e.id);

    const badges = [];
    if (e.published === false) badges.push('<span class="badge bg-signal/30 text-ink">Draft</span>');
    if (past) badges.push('<span class="badge bg-ink/10 text-muted">Ended</span>');
    if (status === 'registered') badges.push('<span class="badge bg-civic-light text-civic-dark">You\'re registered</span>');

    let actions = '<a href="event.html?id=' + encodeURIComponent(e.id) + '" class="btn btn-secondary">View<span class="sr-only"> details for ' + title + '</span></a>';
    if (isAdmin) {
      // ROLE GUARD (render): Edit/Delete buttons are only built for admins.
      actions +=
        '<a href="event-form.html?id=' + encodeURIComponent(e.id) + '" class="btn btn-secondary">Edit<span class="sr-only"> ' + title + '</span></a>' +
        '<button type="button" class="btn btn-danger" data-action="delete" data-id="' + id + '" aria-label="Delete ' + title + '">Delete</button>';
    } else if (status === 'registered') {
      actions += '<button type="button" class="btn btn-secondary" data-action="cancel" data-id="' + id + '" aria-label="Cancel registration for ' + title + '">Cancel registration</button>';
    } else if (!past) {
      actions += '<button type="button" class="btn btn-primary" data-action="register" data-id="' + id + '" aria-label="Register for ' + title + '">Register</button>';
    }

    const media = img
      ? '<img src="' + UI.esc(img) + '" alt="Image for ' + title + '" loading="lazy" class="h-full w-full object-cover">'
      : '<div class="h-full w-full grid place-items-center bg-civic-light" aria-hidden="true">' +
          '<svg viewBox="0 0 64 64" class="h-14 w-14 text-civic/40" fill="currentColor"><path d="M31 8h2v48h-2z"/><path d="M14 14h28l6 6-6 6H14z"/><path d="M50 32H22l-6 6 6 6h28z" opacity=".6"/></svg>' +
        '</div>';

    return '' +
      '<article class="card overflow-hidden flex flex-col" aria-labelledby="ev-' + id + '">' +
        '<div class="relative aspect-[16/9]">' +
          media +
          '<div class="date-sign absolute left-4 -bottom-6" aria-hidden="true"><span class="month">' + UI.esc(month) + '</span><span class="day">' + start.getDate() + '</span></div>' +
        '</div>' +
        '<div class="p-5 pt-9 flex flex-col flex-1">' +
          (badges.length ? '<div class="flex flex-wrap gap-1.5 mb-2">' + badges.join('') + '</div>' : '') +
          '<h2 id="ev-' + id + '" class="text-lg font-bold leading-snug">' + title + '</h2>' +
          '<p class="text-sm mt-1"><time datetime="' + UI.esc(e.starts_at) + '">' + UI.esc(UI.formatRange(e.starts_at, e.ends_at)) + '</time></p>' +
          (e.location ? '<p class="text-sm text-muted mt-0.5">' + UI.esc(e.location) + '</p>' : '') +
          (e.description ? '<p class="text-sm text-muted mt-3 line-clamp-3">' + UI.esc(e.description) + '</p>' : '') +
          '<div class="mt-auto pt-5 flex flex-wrap gap-2">' + actions + '</div>' +
        '</div>' +
      '</article>';
  }

  function render() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const startIdx = (state.page - 1) * PAGE_SIZE;
    const slice = list.slice(startIdx, startIdx + PAGE_SIZE);

    $grid.attr('aria-busy', 'false');
    if (!allEvents.length) {
      $count.text('');
      UI.emptyState($grid, {
        title: 'No events yet',
        text: isAdmin ? 'Create the first event so residents have something to register for.' : 'Check back soon. New events will also appear in your notifications.',
        actionHtml: isAdmin ? '<a href="event-form.html" class="btn btn-primary">Create event</a>' : ''
      });
      $pager.empty();
      return;
    }
    if (!list.length) {
      $count.text('No events match these filters.');
      UI.emptyState($grid, {
        title: 'No events match these filters',
        text: 'Try another date or location, or clear the filters to see everything.',
        actionHtml: '<button type="button" class="btn btn-secondary" data-action="reset">Clear filters</button>'
      });
      $pager.empty();
      return;
    }

    $count.text('Showing ' + (startIdx + 1) + '–' + (startIdx + slice.length) + ' of ' + list.length + ' event' + (list.length === 1 ? '' : 's'));
    $grid.html(slice.map(card).join(''));
    renderPager(pages);
  }

  function renderPager(pages) {
    if (pages <= 1) { $pager.empty(); return; }
    let html = '<ul class="flex flex-wrap items-center justify-center gap-1">';
    html += '<li><button type="button" class="btn btn-secondary" data-page="' + (state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + '>Previous</button></li>';
    for (let p = 1; p <= pages; p++) {
      const current = p === state.page;
      html += '<li><button type="button" class="btn ' + (current ? 'btn-primary' : 'btn-secondary') + ' w-10 px-0" data-page="' + p + '"' +
        (current ? ' aria-current="page"' : '') + ' aria-label="Page ' + p + '">' + p + '</button></li>';
    }
    html += '<li><button type="button" class="btn btn-secondary" data-page="' + (state.page + 1) + '"' + (state.page === pages ? ' disabled' : '') + '>Next</button></li>';
    $pager.html(html + '</ul>');
  }

  // ---------- Filters ----------
  function applyFilters() { state.page = 1; render(); }

  $('#filters').on('submit', function (e) { e.preventDefault(); });
  $('#f-q').on('input', UI.debounce(function () { state.q = $(this).val(); applyFilters(); }, 250));
  $('#f-when').on('change', function () { state.when = $(this).val(); applyFilters(); });
  $('#f-date').on('change', function () {
    state.date = $(this).val();
    if (state.date) { state.when = 'all'; $('#f-when').val('all'); }
    applyFilters();
  });
  $('#f-location').on('change', function () { state.location = $(this).val(); applyFilters(); });

  function resetFilters() {
    Object.assign(state, { q: '', when: 'upcoming', date: '', location: '', page: 1 });
    $('#f-q').val(''); $('#f-when').val('upcoming'); $('#f-date').val(''); $('#f-location').val('');
    history.replaceState(null, '', 'events.html');
    render();
  }
  $('#f-reset').on('click', resetFilters);

  $pager.on('click', '[data-page]', function () {
    state.page = Number($(this).data('page'));
    render();
    $count.trigger('focus');
    $count[0].scrollIntoView({ block: 'start' });
  });

  // ---------- Card actions ----------
  $grid.on('click', '[data-action]', function () {
    const $btn = $(this);
    const action = $btn.data('action');
    const id = String($btn.data('id'));
    if (action === 'reset') resetFilters();
    if (action === 'register') register(id, $btn);
    if (action === 'cancel') cancel(id, $btn);
    if (action === 'delete') remove(id, $btn);
  });

  function findEvent(id) { return allEvents.find(function (e) { return e.id === id; }) || {}; }

  function refocus(id) {
    const $next = $grid.find('[data-id="' + id + '"]').first();
    if ($next.length) $next.trigger('focus');
  }

  async function register(id, $btn) {
    const wasCancelled = myRegs.get(id) === 'cancelled';
    UI.setBusy($btn, true, 'Registering…');
    try {
      await Api.registrations.register(id);
      myRegs.set(id, 'registered');
      UI.toast('You\'re registered for "' + findEvent(id).title + '".', 'success');
      render();
      refocus(id);
    } catch (err) {
      UI.setBusy($btn, false);
      if (err.status === 409 && wasCancelled) {
        UI.toast('You cancelled this registration earlier, and the system doesn\'t allow registering again for the same event.', 'error');
      } else if (err.status === 409) {
        myRegs.set(id, 'registered'); render(); refocus(id);
        UI.toast('You\'re already registered for this event.', 'info');
      } else {
        UI.toast(err.message, 'error');
      }
    }
  }

  async function cancel(id, $btn) {
    const ev = findEvent(id);
    const ok = await UI.confirm({
      title: 'Cancel your registration?',
      message: 'You won\'t be able to register for "' + ev.title + '" again after cancelling.',
      confirmLabel: 'Cancel registration',
      danger: true
    });
    if (!ok) return;
    UI.setBusy($btn, true, 'Cancelling…');
    try {
      await Api.registrations.cancel(id);
      myRegs.set(id, 'cancelled');
      UI.toast('Registration for "' + ev.title + '" cancelled.', 'success');
      render();
    } catch (err) {
      UI.setBusy($btn, false);
      UI.toast(err.message, 'error');
    }
  }

  // ROLE GUARD (action): only reachable from admin-only buttons; the backend
  // also rejects non-admins with 403.
  async function remove(id, $btn) {
    const ev = findEvent(id);
    const ok = await UI.confirm({
      title: 'Delete this event?',
      message: '"' + ev.title + '" will be removed for everyone. This can\'t be undone.',
      confirmLabel: 'Delete event',
      danger: true
    });
    if (!ok) return;
    UI.setBusy($btn, true, 'Deleting…');
    try {
      await Api.events.remove(id);
      allEvents = allEvents.filter(function (e) { return e.id !== id; });
      fillLocations();
      render();
      UI.toast('Deleted "' + ev.title + '".', 'success');
      $count.trigger('focus');
    } catch (err) {
      UI.setBusy($btn, false);
      // event_registrations has no ON DELETE CASCADE in the migration, so the
      // database refuses to delete events people have registered for.
      UI.toast(err.status >= 500
        ? 'The server couldn\'t delete this event. This usually means people have registered for it.'
        : err.message, 'error');
    }
  }
});
