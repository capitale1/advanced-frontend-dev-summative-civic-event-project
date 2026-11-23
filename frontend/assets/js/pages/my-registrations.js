/**
 * my-registrations.js — GET /api/event-registrations/my-registrations
 * Rows include the event's title, starts_at, ends_at and location.
 * Grouped into Upcoming / Past / Cancelled tabs (keyboard: arrow keys, Home, End).
 */
$(function () {
  // ROLE GUARD (page): any signed-in user. (Admins don't see the nav link.)
  if (!Auth.requireAuth()) return;
  Layout.init('my-registrations');

  const $list = $('#list');
  const $tabs = $('[role="tab"]');
  let regs = [];
  let tab = 'upcoming';

  load();

  async function load() {
    UI.skeletonRows($list, 3);
    try {
      const res = await Api.registrations.mine();
      regs = (res.data || []).slice().sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
      render();
    } catch (err) {
      UI.errorState($list, err.message, load);
    }
  }

  function group(r) {
    if (r.status === 'cancelled') return 'cancelled';
    return new Date(r.ends_at || r.starts_at).getTime() < Date.now() ? 'past' : 'upcoming';
  }

  function row(r) {
    const start = new Date(r.starts_at);
    const month = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(start);
    const title = UI.esc(r.title);
    const g = group(r);
    return '' +
      '<li class="card p-4 sm:p-5 flex flex-wrap sm:flex-nowrap items-center gap-4">' +
        '<div class="date-sign shrink-0" aria-hidden="true"><span class="month">' + UI.esc(month) + '</span><span class="day">' + start.getDate() + '</span></div>' +
        '<div class="flex-1 min-w-0">' +
          '<h2 class="font-bold text-lg leading-snug"><a class="hover:underline" href="event.html?id=' + encodeURIComponent(r.event_id) + '">' + title + '</a></h2>' +
          '<p class="text-sm mt-0.5"><time datetime="' + UI.esc(r.starts_at) + '">' + UI.esc(UI.formatRange(r.starts_at, r.ends_at)) + '</time></p>' +
          (r.location ? '<p class="text-sm text-muted">' + UI.esc(r.location) + '</p>' : '') +
          '<p class="text-xs text-muted mt-1">' + (g === 'cancelled' ? 'Cancelled ' + UI.esc(UI.formatDate(r.updated_at, false)) : 'Registered ' + UI.esc(UI.formatDate(r.created_at, false))) + '</p>' +
        '</div>' +
        '<div class="flex flex-wrap gap-2 w-full sm:w-auto">' +
          '<a href="event.html?id=' + encodeURIComponent(r.event_id) + '" class="btn btn-secondary">View event<span class="sr-only">: ' + title + '</span></a>' +
          (g === 'upcoming' ? '<button type="button" class="btn btn-danger" data-cancel="' + UI.esc(r.event_id) + '" aria-label="Cancel registration for ' + title + '">Cancel</button>' : '') +
          (g === 'past' ? '<a href="event.html?id=' + encodeURIComponent(r.event_id) + '#feedback-heading" class="btn btn-primary">Leave feedback<span class="sr-only"> for ' + title + '</span></a>' : '') +
        '</div>' +
      '</li>';
  }

  function render() {
    // Counts on each tab
    ['upcoming', 'past', 'cancelled'].forEach(function (g) {
      const n = regs.filter(function (r) { return group(r) === g; }).length;
      $('[data-count="' + g + '"]').text('(' + n + ')');
    });

    // Tab styles
    $tabs.each(function () {
      const on = $(this).data('tab') === tab;
      $(this).attr('aria-selected', String(on)).attr('tabindex', on ? '0' : '-1')
        .toggleClass('border-civic text-ink', on).toggleClass('border-transparent text-muted hover:text-ink', !on);
    });
    $list.attr('aria-labelledby', 'tab-' + tab);

    const list = regs.filter(function (r) { return group(r) === tab; });
    $list.attr('aria-busy', 'false');
    if (!list.length) {
      const empty = {
        upcoming: { title: 'No upcoming events', text: 'Find something happening in your city and register.', actionHtml: '<a href="events.html" class="btn btn-primary">Browse events</a>' },
        past: { title: 'No past events yet', text: 'Events you attended will show here so you can leave feedback.' },
        cancelled: { title: 'No cancelled registrations', text: '' }
      }[tab];
      UI.emptyState($list, empty);
      return;
    }
    $list.html('<ul class="space-y-3">' + list.map(row).join('') + '</ul>');
  }

  // ---------- Tabs ----------
  function select(name, focus) {
    tab = name;
    render();
    if (focus) $('#tab-' + name).trigger('focus');
  }
  $tabs.on('click', function () { select($(this).data('tab')); });
  $tabs.on('keydown', function (e) {
    const names = ['upcoming', 'past', 'cancelled'];
    let i = names.indexOf(tab);
    if (e.key === 'ArrowRight') i = (i + 1) % names.length;
    else if (e.key === 'ArrowLeft') i = (i - 1 + names.length) % names.length;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = names.length - 1;
    else return;
    e.preventDefault();
    select(names[i], true);
  });

  // ---------- Cancel ----------
  $list.on('click', '[data-cancel]', async function () {
    const $btn = $(this);
    const eventId = String($btn.data('cancel'));
    const r = regs.find(function (x) { return x.event_id === eventId; });
    const ok = await UI.confirm({
      title: 'Cancel your registration?',
      message: 'You won\'t be able to register for "' + r.title + '" again after cancelling.',
      confirmLabel: 'Cancel registration',
      danger: true
    });
    if (!ok) return;
    UI.setBusy($btn, true, 'Cancelling…');
    try {
      const res = await Api.registrations.cancel(eventId);
      r.status = 'cancelled';
      r.updated_at = (res.data && res.data.updated_at) || new Date().toISOString();
      render();
      UI.toast('Registration for "' + r.title + '" cancelled.', 'success');
      $('#tab-' + tab).trigger('focus');
    } catch (err) {
      UI.setBusy($btn, false);
      UI.toast(err.message, 'error');
    }
  });
});
