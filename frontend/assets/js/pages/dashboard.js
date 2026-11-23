/**
 * dashboard.js — Admin dashboard (GET /api/dashboard/admin)
 *
 * Response shape (counts arrive as strings from PostgreSQL):
 *  users { total_users, active_users, inactive_users }
 *  events { total_events, upcoming_events, past_events }
 *  registrations { total_registrations }, feedbacks { total_feedback }
 *  promos { total_promos }, announcements { total_announcements }
 *  notifications { total_notifications }, user_growth [{ month: 'YYYY-MM', new_users }]
 *
 * Charts are plain SVG (no chart library), each with a hidden data table for
 * screen readers. Data refreshes every 60 seconds, when the tab regains focus,
 * and with the Refresh button; changed numbers are marked.
 */
$(function () {
  // ROLE GUARD (page): admins only. Normal users go to forbidden.html,
  // and the API itself returns 403 for non-admins.
  if (!Auth.requireAdmin()) return;
  Layout.init('dashboard');
  $('#admin-sidebar').html(Layout.adminSidebar('overview'));

  const COLORS = { civic: '#1F6F5C', signal: '#F2C14E', ink: '#1B2A41', grey: '#C3CCC8' };
  const $stats = $('#stats');
  const $charts = $('#charts');
  let previous = null;
  let loading = false;

  load(true);
  setInterval(function () { if (!document.hidden) load(false); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(false); });
  $('#refresh-btn').on('click', function () { load(false, true); });

  const n = function (v) { return Number(v || 0); };

  async function load(first, manual) {
    if (loading) return;
    loading = true;
    if (first) {
      let sk = '';
      for (let i = 0; i < 8; i++) sk += '<div class="skeleton h-28"></div>';
      $stats.html(sk);
      $charts.html('<div class="skeleton h-72"></div><div class="skeleton h-72"></div>');
    }
    if (manual) UI.setBusy($('#refresh-btn'), true, 'Refreshing…');
    try {
      const results = await Promise.all([Api.dashboard.admin(), Api.notifications.list()]);
      const d = results[0].data || {};
      const read = Layout.getReadIds();
      const unread = (results[1].data || []).filter(function (x) { return !read.has(x.id); }).length;
      const data = toNumbers(d, unread);
      renderStats(data);
      renderCharts(data);
      previous = data;
      $('#updated').text('Updated at ' + new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()));
      if (manual) UI.toast('Dashboard is up to date.', 'success');
    } catch (err) {
      if (first) UI.errorState($stats, err.message, function () { load(true); });
      else UI.toast('Couldn\'t refresh the dashboard. ' + err.message, 'error');
    } finally {
      loading = false;
      if (manual) UI.setBusy($('#refresh-btn'), false);
    }
  }

  function toNumbers(d, unread) {
    const u = d.users || {}, e = d.events || {};
    const total = n(e.total_events), upcoming = n(e.upcoming_events), past = n(e.past_events);
    return {
      users: n(u.total_users), active: n(u.active_users), inactive: n(u.inactive_users),
      events: total, upcoming: upcoming, past: past, ongoing: Math.max(0, total - upcoming - past),
      registrations: n((d.registrations || {}).total_registrations),
      feedback: n((d.feedbacks || {}).total_feedback),
      promos: n((d.promos || {}).total_promos),
      announcements: n((d.announcements || {}).total_announcements),
      notifications: n((d.notifications || {}).total_notifications),
      unread: unread,
      growth: lastSixMonths(d.user_growth || [])
    };
  }

  // Fill in months with no sign-ups so the chart always shows 6 months
  function lastSixMonths(rows) {
    const map = {};
    rows.forEach(function (r) { map[r.month] = n(r.new_users); });
    const out = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      out.push({ key: key, label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d), value: map[key] || 0 });
    }
    return out;
  }

  // ---------- Stat tiles ----------
  function renderStats(s) {
    const tile = function (key, value, label, sub, href) {
      const changed = previous && previous[key] !== value;
      return '<a href="' + href + '" class="card p-4 block hover:border-civic transition-colors' + (changed ? ' ring-2 ring-signal' : '') + '">' +
        '<p class="text-sm font-semibold text-muted">' + label + '</p>' +
        '<p class="text-3xl font-extrabold mt-1 tabular-nums">' + value.toLocaleString() + '</p>' +
        (sub ? '<p class="text-xs text-muted mt-1">' + sub + '</p>' : '') +
        (changed ? '<p class="text-xs font-semibold text-civic-dark mt-1">Changed since last update</p>' : '') +
      '</a>';
    };
    $stats.attr('aria-busy', 'false').html(
      tile('users', s.users, 'Users', s.active + ' active, ' + s.inactive + ' disabled', 'admin-users.html') +
      tile('events', s.events, 'Events', s.upcoming + ' upcoming', 'events.html') +
      tile('registrations', s.registrations, 'Registrations', 'Across all events', 'events.html') +
      tile('feedback', s.feedback, 'Feedback received', 'Ratings and comments', 'events.html') +
      tile('announcements', s.announcements, 'Announcements', 'Audio messages', 'announcements.html') +
      tile('promos', s.promos, 'Promos', 'Videos with captions', 'promos.html') +
      tile('notifications', s.notifications, 'Notifications sent', 'Broadcast and personal', 'admin-notifications.html') +
      tile('unread', s.unread, 'Unread notifications', 'In your inbox', 'admin-notifications.html')
    );
  }

  // ---------- Charts ----------
  function figure(id, title, desc, chart, table) {
    return '<figure class="card p-5" aria-labelledby="' + id + '-title">' +
      '<figcaption><h2 id="' + id + '-title" class="font-bold">' + title + '</h2><p class="text-sm text-muted">' + desc + '</p></figcaption>' +
      '<div class="mt-4" aria-hidden="true">' + chart + '</div>' +
      '<table class="sr-only"><caption>' + title + '</caption>' + table + '</table>' +
    '</figure>';
  }

  function tableRows(rows) {
    return '<thead><tr><th scope="col">Item</th><th scope="col">Count</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><th scope="row">' + UI.esc(r.label) + '</th><td>' + r.value + '</td></tr>'; }).join('') + '</tbody>';
  }

  // Vertical bars (new users per month)
  function columnChart(rows) {
    const W = 420, H = 200, pad = 28, gap = 14;
    const max = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.value; })));
    const bw = (W - pad * 2 - gap * (rows.length - 1)) / rows.length;
    let bars = '';
    rows.forEach(function (r, i) {
      const h = (r.value / max) * (H - pad * 2);
      const x = pad + i * (bw + gap), y = H - pad - h;
      bars += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(h, 1) + '" rx="3" fill="' + (i === rows.length - 1 ? COLORS.signal : COLORS.civic) + '"/>' +
        '<text x="' + (x + bw / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="12" font-weight="700" fill="' + COLORS.ink + '">' + r.value + '</text>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="12" fill="#4A5568">' + UI.esc(r.label) + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="w-full h-auto">' +
      '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + (H - pad) + '" y2="' + (H - pad) + '" stroke="#C3CCC8"/>' + bars + '</svg>';
  }

  // One horizontal bar split into parts, with a legend
  function splitBar(parts) {
    const total = parts.reduce(function (s, p) { return s + p.value; }, 0);
    if (!total) return '<p class="text-sm text-muted">Nothing to show yet.</p>';
    const segs = parts.filter(function (p) { return p.value > 0; }).map(function (p) {
      return '<span style="width:' + (p.value / total * 100) + '%;background:' + p.color + '" class="block h-full"></span>';
    }).join('');
    const legend = parts.map(function (p) {
      return '<li class="flex items-center gap-2 text-sm"><span class="h-3 w-3 rounded-sm shrink-0" style="background:' + p.color + '"></span>' +
        '<span class="flex-1">' + UI.esc(p.label) + '</span><span class="font-semibold tabular-nums">' + p.value + '</span>' +
        '<span class="text-muted w-12 text-right tabular-nums">' + Math.round(p.value / total * 100) + '%</span></li>';
    }).join('');
    return '<div class="flex h-6 rounded overflow-hidden bg-paper">' + segs + '</div><ul class="mt-4 space-y-2">' + legend + '</ul>';
  }

  // Horizontal bars compared against the largest value
  function barList(rows) {
    const max = Math.max(1, Math.max.apply(null, rows.map(function (r) { return r.value; })));
    return '<ul class="space-y-3">' + rows.map(function (r) {
      return '<li><div class="flex justify-between text-sm"><span>' + UI.esc(r.label) + '</span><span class="font-semibold tabular-nums">' + r.value + '</span></div>' +
        '<div class="h-3 rounded bg-paper mt-1 overflow-hidden"><span class="block h-full rounded" style="width:' + (r.value / max * 100) + '%;background:' + r.color + '"></span></div></li>';
    }).join('') + '</ul>';
  }

  function renderCharts(s) {
    const growthTotal = s.growth.reduce(function (t, r) { return t + r.value; }, 0);
    const users = [
      { label: 'Active', value: s.active, color: COLORS.civic },
      { label: 'Disabled', value: s.inactive, color: COLORS.grey }
    ];
    const events = [
      { label: 'Upcoming', value: s.upcoming, color: COLORS.civic },
      { label: 'Happening now', value: s.ongoing, color: COLORS.signal },
      { label: 'Ended', value: s.past, color: COLORS.grey }
    ];
    const content = [
      { label: 'Events', value: s.events, color: COLORS.civic },
      { label: 'Announcements', value: s.announcements, color: COLORS.signal },
      { label: 'Promos', value: s.promos, color: COLORS.ink }
    ];
    const engagement = [
      { label: 'Registrations', value: s.registrations, color: COLORS.civic },
      { label: 'Feedback', value: s.feedback, color: COLORS.signal }
    ];
    $charts.html(
      figure('growth', 'New users per month', growthTotal + ' sign-ups in the last 6 months. This month is highlighted.', columnChart(s.growth), tableRows(s.growth)) +
      figure('events-split', 'Events by status', s.events + ' events in total.', splitBar(events), tableRows(events)) +
      figure('users-split', 'Accounts', s.users + ' accounts in total.', splitBar(users), tableRows(users)) +
      figure('content', 'Content and engagement', 'How much has been published and how people are responding.',
        barList(content) + '<hr class="my-4 border-ink/10">' + barList(engagement), tableRows(content.concat(engagement)))
    );
  }
});
