/**
 * search.js — Global search (from the header search bar).
 * The API has no search endpoint, so this loads events, announcements and
 * promos in parallel and matches the query in the browser.
 */
$(function () {
  // ROLE GUARD (page): any signed-in user.
  if (!Auth.requireAuth()) return;
  Layout.init('search');

  const isAdmin = Auth.isAdmin();
  const $results = $('#results');
  const $count = $('#results-count');
  const q = (UI.param('q') || '').trim();
  $('#q').val(q);

  if (!q) {
    $count.text('');
    $results.html('<p class="text-muted">Type a word above to search events, announcements and promos.</p>');
    $('#q').trigger('focus');
    return;
  }
  document.title = 'Search: ' + q + ' | CivicEvents';
  run();

  // Wrap matches in <mark> (text is escaped first)
  function highlight(text) {
    const safe = UI.esc(text || '');
    const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp('(' + UI.esc(pattern) + ')', 'gi'), '<mark class="bg-signal/50 text-ink rounded px-0.5">$1</mark>');
  }

  function matches() {
    const needle = q.toLowerCase();
    return Array.prototype.slice.call(arguments).some(function (v) { return (v || '').toLowerCase().indexOf(needle) !== -1; });
  }

  // Short excerpt around the first match
  function excerpt(text) {
    if (!text) return '';
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return text.length > 160 ? text.slice(0, 160) + '…' : text;
    const start = Math.max(0, i - 60);
    return (start ? '…' : '') + text.slice(start, start + 160) + (start + 160 < text.length ? '…' : '');
  }

  async function run() {
    UI.skeletonRows($results, 4);
    $count.text('Searching…');
    // Load all three; one failing doesn't hide the others
    const settled = await Promise.all([
      Api.events.list().catch(function (e) { return { error: e }; }),
      Api.announcements.list().catch(function (e) { return { error: e }; }),
      Api.promos.list().catch(function (e) { return { error: e }; })
    ]);

    // ROLE GUARD (data): normal users never see drafts in results.
    const show = function (x) { return isAdmin || x.published !== false; };

    const groups = [
      {
        title: 'Events', res: settled[0],
        pick: function (e) { return show(e) && matches(e.title, e.description, e.location); },
        item: function (e) {
          return { href: 'event.html?id=' + encodeURIComponent(e.id), title: e.title, meta: UI.formatRange(e.starts_at, e.ends_at) + (e.location ? ', ' + e.location : ''), text: excerpt(e.description) };
        }
      },
      {
        title: 'Announcements', res: settled[1],
        pick: function (a) { return show(a) && matches(a.title); },
        item: function (a) {
          return { href: 'announcement.html?id=' + encodeURIComponent(a.id), title: a.title, meta: 'Audio announcement, posted ' + UI.formatDate(a.created_at, false), text: '' };
        }
      },
      {
        title: 'Promos', res: settled[2],
        pick: function (p) { return show(p) && matches(p.title, p.description, p.caption_text); },
        item: function (p) {
          return { href: 'promo.html?id=' + encodeURIComponent(p.id), title: p.title, meta: 'Video with captions, posted ' + UI.formatDate(p.created_at, false), text: excerpt(p.description || p.caption_text) };
        }
      }
    ];

    let total = 0;
    const html = groups.map(function (g) {
      const head = '<h2 class="text-xl font-bold">' + g.title;
      if (g.res.error) {
        return '<section>' + head + '</h2><p class="text-danger mt-2" role="alert">Couldn\'t search ' + g.title.toLowerCase() + ': ' + UI.esc(g.res.error.message) + '</p></section>';
      }
      const found = (g.res.data || []).filter(g.pick).map(g.item);
      total += found.length;
      if (!found.length) {
        return '<section>' + head + ' <span class="text-muted font-normal text-base">(0)</span></h2><p class="text-muted mt-2">No ' + g.title.toLowerCase() + ' match.</p></section>';
      }
      return '<section>' + head + ' <span class="text-muted font-normal text-base">(' + found.length + ')</span></h2>' +
        '<ul class="mt-3 space-y-3">' + found.map(function (r) {
          return '<li class="card p-4">' +
            '<a href="' + r.href + '" class="font-bold text-lg hover:underline">' + highlight(r.title) + '</a>' +
            '<p class="text-sm text-muted">' + UI.esc(r.meta) + '</p>' +
            (r.text ? '<p class="text-sm mt-1">' + highlight(r.text) + '</p>' : '') +
          '</li>';
        }).join('') + '</ul></section>';
    }).join('');

    $results.attr('aria-busy', 'false').html(html);
    $count.text(total + ' result' + (total === 1 ? '' : 's') + ' for "' + q + '"');
  }
});
