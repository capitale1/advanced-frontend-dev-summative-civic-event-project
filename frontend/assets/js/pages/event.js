/**
 * event.js — Event detail (GET /api/events/:id)
 *  - Users: register / cancel, add or edit their feedback (one per event).
 *  - Admins: edit / delete, see attendees and all feedback with the average rating.
 *
 * Backend notes:
 *  - GET /event-feedback/event/:id is admin-only, so normal users see their own
 *    feedback only (GET /event-feedback/my-feedback), not other people's.
 *  - Feedback is unique per (user, event); a second POST returns 409.
 */
$(function () {
  // ROLE GUARD (page): any signed-in user can view an event.
  if (!Auth.requireAuth()) return;
  Layout.init('events');

  const id = UI.param('id');
  const isAdmin = Auth.isAdmin();
  const $root = $('#event-root');

  let event = null;
  let regStatus = null;     // 'registered' | 'cancelled' | null
  let myFeedback = null;    // this user's feedback for this event
  let editingFeedback = false;

  if (!id) { notFound(); return; }
  load();

  // ---------- Loading ----------
  async function load() {
    try {
      const res = await Api.events.get(id);
      event = res.data;
    } catch (err) {
      if (err.status === 404) notFound();
      else UI.errorState($root, err.message, load);
      return;
    }
    // ROLE GUARD (data): unpublished events are hidden from normal users.
    if (!isAdmin && event.published === false) { notFound(); return; }

    document.title = event.title + ' | CivicEvents';
    renderShell();
    if (isAdmin) {
      loadAttendees();
      loadAllFeedback();
    } else {
      loadRegistration();
      loadMyFeedback();
    }
  }

  function notFound() {
    $root.attr('aria-busy', 'false').html(
      '<div class="card p-10 text-center">' +
        '<h1 class="text-2xl font-extrabold">Event not found</h1>' +
        '<p class="text-muted mt-2">It may have been removed, or the link is incorrect.</p>' +
        '<a href="events.html" class="btn btn-primary mt-6">Browse events</a>' +
      '</div>'
    );
  }

  function isPast() {
    return new Date(event.ends_at || event.starts_at).getTime() < Date.now();
  }

  // ---------- Page layout ----------
  function renderShell() {
    const start = new Date(event.starts_at);
    const month = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(start);
    const img = event.metadata && event.metadata.image_url;
    const title = UI.esc(event.title);
    const mapUrl = event.location ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(event.location) : '';

    const badges = [];
    if (event.published === false) badges.push('<span class="badge bg-signal/30 text-ink">Draft</span>');
    if (isPast()) badges.push('<span class="badge bg-ink/10 text-muted">Ended</span>');

    const media = img
      ? '<img src="' + UI.esc(img) + '" alt="Image for ' + title + '" class="h-full w-full object-cover">'
      : '<div class="h-full w-full grid place-items-center" aria-hidden="true"><svg viewBox="0 0 64 64" class="h-20 w-20 text-civic/40" fill="currentColor"><path d="M31 8h2v48h-2z"/><path d="M14 14h28l6 6-6 6H14z"/><path d="M50 32H22l-6 6 6 6h28z" opacity=".6"/></svg></div>';

    $root.attr('aria-busy', 'false').html(
      '<article aria-labelledby="event-title">' +
        '<div class="rounded-lg overflow-hidden aspect-[16/9] sm:aspect-[21/9] bg-civic-light">' + media + '</div>' +

        '<div class="mt-8 grid gap-8 lg:grid-cols-3">' +
          '<div class="lg:col-span-2 min-w-0">' +
            '<div class="flex items-start gap-4">' +
              '<div class="date-sign shrink-0" aria-hidden="true"><span class="month">' + UI.esc(month) + '</span><span class="day">' + start.getDate() + '</span></div>' +
              '<div class="min-w-0">' +
                (badges.length ? '<div class="flex gap-1.5 mb-2">' + badges.join('') + '</div>' : '') +
                '<h1 id="event-title" class="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight break-words">' + title + '</h1>' +
              '</div>' +
            '</div>' +

            '<section class="mt-8" aria-labelledby="about-heading">' +
              '<h2 id="about-heading" class="text-xl font-bold">About this event</h2>' +
              '<p class="mt-2 leading-relaxed max-w-prose whitespace-pre-line">' + (event.description ? UI.esc(event.description) : '<span class="text-muted">No description yet.</span>') + '</p>' +
            '</section>' +

            '<section id="feedback-section" class="mt-10" aria-labelledby="feedback-heading">' +
              '<h2 id="feedback-heading" class="text-xl font-bold">Feedback</h2>' +
              '<div id="feedback-body" class="mt-3"></div>' +
            '</section>' +
          '</div>' +

          '<aside class="space-y-4" aria-label="Event details">' +
            '<div class="card p-5">' +
              '<h2 class="text-sm font-semibold text-muted">When</h2>' +
              '<p class="mt-1 font-semibold"><time datetime="' + UI.esc(event.starts_at) + '">' + UI.esc(UI.formatRange(event.starts_at, event.ends_at)) + '</time></p>' +
              '<h2 class="text-sm font-semibold text-muted mt-4">Where</h2>' +
              '<p class="mt-1 font-semibold">' + (event.location ? UI.esc(event.location) : 'To be announced') + '</p>' +
              (mapUrl ? '<a href="' + mapUrl + '" target="_blank" rel="noopener" class="inline-block mt-2 text-sm font-semibold text-civic underline">Open in Google Maps<span class="sr-only"> (opens in a new tab)</span></a>' : '') +
            '</div>' +
            // ROLE GUARD (render): users get the registration card, admins get the manage card.
            (isAdmin
              ? '<div class="card p-5"><h2 class="font-bold">Manage event</h2>' +
                  '<div class="mt-3 flex flex-wrap gap-2">' +
                    '<a href="event-form.html?id=' + encodeURIComponent(event.id) + '" class="btn btn-secondary">Edit event</a>' +
                    '<button id="delete-event" type="button" class="btn btn-danger">Delete event</button>' +
                  '</div></div>'
              : '<div id="registration-card" class="card p-5"><div class="skeleton h-5 w-1/2"></div><div class="skeleton h-10 w-full mt-4"></div></div>') +
          '</aside>' +
        '</div>' +

        (isAdmin
          ? '<section id="attendees-section" class="mt-12" aria-labelledby="attendees-heading">' +
              '<h2 id="attendees-heading" class="text-xl font-bold">Registered attendees</h2>' +
              '<div id="attendees-body" class="mt-3"></div>' +
            '</section>'
          : '') +
      '</article>'
    );
  }

  // ---------- Stars ----------
  function stars(value, size) {
    const full = Math.round(value);
    let html = '<span class="inline-flex ' + (size || 'text-lg') + ' leading-none" role="img" aria-label="Rated ' + (Math.round(value * 10) / 10) + ' out of 5">';
    for (let i = 1; i <= 5; i++) {
      html += '<span aria-hidden="true" class="' + (i <= full ? 'text-signal' : 'text-ink/20') + '">★</span>';
    }
    return html + '</span>';
  }

  // ---------- Registration (users) ----------
  async function loadRegistration() {
    try {
      const res = await Api.registrations.mine();
      const reg = (res.data || []).find(function (r) { return r.event_id === event.id; });
      regStatus = reg ? reg.status : null;
      renderRegistration();
    } catch (err) {
      UI.errorState($('#registration-card'), err.message, loadRegistration);
    }
  }

  function renderRegistration() {
    const $card = $('#registration-card');
    let html = '<h2 class="font-bold">Registration</h2>';
    if (regStatus === 'registered') {
      html += '<p class="mt-2 flex items-center gap-2 text-civic-dark font-semibold"><span aria-hidden="true">✓</span> You\'re registered</p>' +
        '<p class="text-sm text-muted mt-1">It\'s listed in <a href="my-registrations.html" class="underline">My registrations</a>.</p>' +
        (isPast() ? '' : '<button id="cancel-reg" type="button" class="btn btn-secondary w-full mt-4">Cancel registration</button>');
    } else if (regStatus === 'cancelled') {
      html += '<p class="mt-2 text-muted">You cancelled your registration for this event. Contact the organisers if you\'d like to attend after all.</p>';
    } else if (isPast()) {
      html += '<p class="mt-2 text-muted">This event has ended, so registration is closed.</p>';
    } else {
      html += '<p class="mt-2 text-sm text-muted">Registering lets organisers plan for numbers and keeps the event in your list.</p>' +
        '<button id="register" type="button" class="btn btn-primary w-full mt-4">Register for this event</button>';
    }
    $card.attr('aria-busy', 'false').html(html);
  }

  $root.on('click', '#register', async function () {
    const $btn = $(this);
    UI.setBusy($btn, true, 'Registering…');
    try {
      await Api.registrations.register(event.id);
      regStatus = 'registered';
      renderRegistration();
      UI.toast('You\'re registered for "' + event.title + '".', 'success');
      $('#cancel-reg').trigger('focus');
    } catch (err) {
      UI.setBusy($btn, false);
      if (err.status === 409) { regStatus = 'registered'; renderRegistration(); }
      UI.toast(err.status === 409 ? 'You\'re already registered for this event.' : err.message, err.status === 409 ? 'info' : 'error');
    }
  });

  $root.on('click', '#cancel-reg', async function () {
    const $btn = $(this);
    const ok = await UI.confirm({
      title: 'Cancel your registration?',
      message: 'You won\'t be able to register for "' + event.title + '" again after cancelling.',
      confirmLabel: 'Cancel registration',
      danger: true
    });
    if (!ok) return;
    UI.setBusy($btn, true, 'Cancelling…');
    try {
      await Api.registrations.cancel(event.id);
      regStatus = 'cancelled';
      renderRegistration();
      UI.toast('Registration cancelled.', 'success');
    } catch (err) {
      UI.setBusy($btn, false);
      UI.toast(err.message, 'error');
    }
  });

  // ---------- Feedback: users ----------
  async function loadMyFeedback() {
    const $body = $('#feedback-body');
    UI.skeletonRows($body, 2);
    try {
      const res = await Api.feedback.mine();
      myFeedback = (res.data || []).find(function (f) { return f.event_id === event.id; }) || null;
      renderMyFeedback();
    } catch (err) {
      UI.errorState($body, err.message, loadMyFeedback);
    }
  }

  function renderMyFeedback() {
    const $body = $('#feedback-body').attr('aria-busy', 'false');
    const note = '<p class="text-sm text-muted">Your rating helps organisers plan better events. Overall ratings are shared with event organisers.</p>';

    if (myFeedback && !editingFeedback) {
      $body.html(note +
        '<div class="card p-5 mt-4">' +
          '<div class="flex items-center justify-between gap-2"><h3 class="font-bold">Your feedback</h3>' + stars(myFeedback.rating) + '</div>' +
          (myFeedback.comment ? '<p class="mt-2 whitespace-pre-line">' + UI.esc(myFeedback.comment) + '</p>' : '<p class="mt-2 text-muted">No comment added.</p>') +
          '<p class="text-xs text-muted mt-3">Submitted ' + UI.esc(UI.formatDate(myFeedback.created_at, false)) + '</p>' +
          '<button id="edit-feedback" type="button" class="btn btn-secondary mt-4">Edit feedback</button>' +
        '</div>');
      return;
    }

    let radios = '';
    for (let i = 1; i <= 5; i++) {
      radios +=
        '<span>' +
          '<input id="rating-' + i + '" type="radio" name="rating" value="' + i + '" class="sr-only peer">' +
          '<label for="rating-' + i + '" data-star="' + i + '" class="block cursor-pointer text-3xl leading-none px-0.5 rounded text-ink/20 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-signal">' +
            '<span aria-hidden="true">★</span><span class="sr-only">' + i + ' star' + (i > 1 ? 's' : '') + '</span>' +
          '</label>' +
        '</span>';
    }

    $body.html(note +
      '<form id="feedback-form" class="card p-5 mt-4" novalidate>' +
        '<div data-form-alert role="alert" class="hidden mb-4 rounded-md border border-danger/30 bg-red-50 text-danger px-4 py-3 text-sm"></div>' +
        '<fieldset aria-describedby="rating-error">' +
          '<legend class="label">' + (myFeedback ? 'Update your rating' : 'How would you rate this event?') + '</legend>' +
          '<div class="flex items-center gap-1">' + radios + '<span id="rating-text" class="ml-3 text-sm text-muted">Choose 1 to 5 stars</span></div>' +
          '<p id="rating-error" class="field-error hidden"></p>' +
        '</fieldset>' +
        '<div class="mt-4">' +
          '<label for="fb-comment" class="label">Comment <span class="font-normal text-muted">(optional)</span></label>' +
          '<textarea id="fb-comment" rows="4" maxlength="1000" class="input" aria-describedby="fb-count"></textarea>' +
          '<p id="fb-count" class="text-xs text-muted mt-1">0 of 1000 characters</p>' +
        '</div>' +
        '<div class="mt-4 flex flex-wrap gap-2">' +
          '<button id="fb-submit" type="submit" class="btn btn-primary">' + (myFeedback ? 'Save changes' : 'Submit feedback') + '</button>' +
          (myFeedback ? '<button id="fb-cancel" type="button" class="btn btn-secondary">Cancel</button>' : '') +
        '</div>' +
      '</form>');

    if (myFeedback) {
      $('#rating-' + myFeedback.rating).prop('checked', true);
      $('#fb-comment').val(myFeedback.comment || '').trigger('input');
      paintStars(myFeedback.rating);
    }
  }

  function paintStars(value) {
    $('[data-star]').each(function () {
      const n = Number($(this).data('star'));
      $(this).toggleClass('text-signal', n <= value).toggleClass('text-ink/20', n > value);
    });
    const words = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
    $('#rating-text').text(value ? value + ' of 5: ' + words[value] : 'Choose 1 to 5 stars');
  }

  $root.on('change', 'input[name="rating"]', function () {
    paintStars(Number($(this).val()));
    $('#rating-error').addClass('hidden');
  });
  $root.on('input', '#fb-comment', function () {
    $('#fb-count').text($(this).val().length + ' of 1000 characters');
  });
  $root.on('click', '#edit-feedback', function () {
    editingFeedback = true; renderMyFeedback(); $('input[name="rating"]:checked').trigger('focus');
  });
  $root.on('click', '#fb-cancel', function () {
    editingFeedback = false; renderMyFeedback(); $('#edit-feedback').trigger('focus');
  });

  $root.on('submit', '#feedback-form', async function (e) {
    e.preventDefault();
    const $form = $(this);
    UI.clearErrors($form);
    const rating = Number($('input[name="rating"]:checked').val());
    const comment = $('#fb-comment').val().trim();
    if (!rating || rating < 1 || rating > 5) {
      $('#rating-error').text('Choose a rating from 1 to 5 stars.').removeClass('hidden');
      $('#rating-1').trigger('focus');
      return;
    }

    const $btn = $('#fb-submit');
    UI.setBusy($btn, true, 'Saving…');
    try {
      let res;
      if (myFeedback) res = await Api.feedback.update(myFeedback.id, { rating: rating, comment: comment });
      else res = await Api.feedback.create({ event_id: event.id, rating: rating, comment: comment });
      const wasEdit = !!myFeedback;
      myFeedback = Object.assign({}, myFeedback, res.data);
      editingFeedback = false;
      renderMyFeedback();
      UI.toast(wasEdit ? 'Feedback updated.' : 'Thanks, your feedback was submitted.', 'success');
      $('#edit-feedback').trigger('focus');
    } catch (err) {
      UI.setBusy($btn, false);
      if (err.status === 409) {
        // Already left feedback (e.g. in another tab): load it and switch to edit
        UI.toast('You\'ve already left feedback for this event. You can edit it instead.', 'info');
        loadMyFeedback();
      } else {
        UI.formAlert($form, err.message);
      }
    }
  });

  // ---------- Feedback: admins ----------
  async function loadAllFeedback() {
    const $body = $('#feedback-body');
    UI.skeletonRows($body, 3);
    try {
      const res = await Api.feedback.forEvent(event.id);
      renderAllFeedback(res.data || []);
    } catch (err) {
      UI.errorState($body, err.message, loadAllFeedback);
    }
  }

  function renderAllFeedback(list) {
    const $body = $('#feedback-body').attr('aria-busy', 'false');
    if (!list.length) {
      $body.html('<div class="card border-dashed p-6 text-center text-muted">No feedback yet. Attendees can rate the event from this page.</div>');
      return;
    }
    const avg = list.reduce(function (s, f) { return s + Number(f.rating || 0); }, 0) / list.length;
    const counts = [5, 4, 3, 2, 1].map(function (n) {
      const c = list.filter(function (f) { return Number(f.rating) === n; }).length;
      const pct = Math.round((c / list.length) * 100);
      return '<div class="flex items-center gap-2 text-sm"><span class="w-12">' + n + ' star' + (n > 1 ? 's' : '') + '</span>' +
        '<span class="flex-1 h-2 rounded bg-ink/10 overflow-hidden" aria-hidden="true"><span class="block h-full bg-signal" style="width:' + pct + '%"></span></span>' +
        '<span class="w-8 text-right text-muted">' + c + '</span></div>';
    }).join('');

    const items = list.map(function (f) {
      return '<li class="py-4 border-b border-ink/10 last:border-0">' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<p class="font-semibold">' + UI.esc(f.full_name || 'Attendee') + '</p>' + stars(f.rating, 'text-base') +
        '</div>' +
        (f.comment ? '<p class="mt-1 whitespace-pre-line">' + UI.esc(f.comment) + '</p>' : '') +
        '<p class="text-xs text-muted mt-1">' + UI.esc(UI.formatDate(f.created_at, false)) + '</p>' +
      '</li>';
    }).join('');

    $body.html(
      '<div class="card p-5 grid gap-6 sm:grid-cols-[auto_1fr] items-center">' +
        '<div class="text-center sm:pr-6 sm:border-r border-ink/10">' +
          '<p class="text-5xl font-extrabold">' + avg.toFixed(1) + '</p>' +
          '<div class="mt-1">' + stars(avg) + '</div>' +
          '<p class="text-sm text-muted mt-1">' + list.length + ' review' + (list.length === 1 ? '' : 's') + '</p>' +
        '</div>' +
        '<div class="space-y-1.5">' + counts + '</div>' +
      '</div>' +
      '<ul class="card px-5 mt-4">' + items + '</ul>'
    );
  }

  // ---------- Attendees (admins) ----------
  async function loadAttendees() {
    const $body = $('#attendees-body');
    UI.skeletonRows($body, 3);
    try {
      const res = await Api.registrations.attendees(event.id);
      const list = res.data || [];
      $body.attr('aria-busy', 'false');
      if (!list.length) {
        $body.html('<div class="card border-dashed p-6 text-center text-muted">No one has registered yet.</div>');
        return;
      }
      const rows = list.map(function (a) {
        return '<tr class="border-t border-ink/10">' +
          '<td class="px-4 py-3 font-semibold">' + UI.esc(a.full_name) + '</td>' +
          '<td class="px-4 py-3"><a class="underline" href="mailto:' + UI.esc(a.email) + '">' + UI.esc(a.email) + '</a></td>' +
          '<td class="px-4 py-3 text-muted">' + UI.esc(UI.formatDate(a.created_at)) + '</td>' +
        '</tr>';
      }).join('');
      $body.html(
        '<div class="card overflow-x-auto">' +
          '<table class="w-full text-sm text-left">' +
            '<caption class="sr-only">People registered for ' + UI.esc(event.title) + '</caption>' +
            '<thead class="bg-paper"><tr>' +
              '<th scope="col" class="px-4 py-3 font-semibold">Name</th>' +
              '<th scope="col" class="px-4 py-3 font-semibold">Email</th>' +
              '<th scope="col" class="px-4 py-3 font-semibold">Registered on</th>' +
            '</tr></thead><tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
        '<p class="text-sm text-muted mt-2">' + list.length + ' registered</p>'
      );
    } catch (err) {
      UI.errorState($body, err.message, loadAttendees);
    }
  }

  // ---------- Delete (admins) ----------
  // ROLE GUARD (action): button only exists for admins; backend also returns 403.
  $root.on('click', '#delete-event', async function () {
    const $btn = $(this);
    const ok = await UI.confirm({
      title: 'Delete this event?',
      message: '"' + event.title + '" will be removed for everyone. This can\'t be undone.',
      confirmLabel: 'Delete event',
      danger: true
    });
    if (!ok) return;
    UI.setBusy($btn, true, 'Deleting…');
    try {
      await Api.events.remove(event.id);
      UI.flash('Deleted "' + event.title + '".', 'success');
      window.location.href = 'events.html';
    } catch (err) {
      UI.setBusy($btn, false);
      UI.toast(err.status >= 500
        ? 'The server couldn\'t delete this event. This usually means people have registered for it.'
        : err.message, 'error');
    }
  });
});
