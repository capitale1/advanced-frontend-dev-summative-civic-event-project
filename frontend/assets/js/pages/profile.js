/**
 * profile.js — GET /api/users/profile/me, PATCH /api/users/profile/me
 * Users can change full_name and email only. role and is_active are shown
 * read-only and are never sent (the backend also rejects them).
 * Activity numbers come from GET /api/dashboard/me.
 */
$(function () {
  // ROLE GUARD (page): any signed-in user, for their own account only.
  if (!Auth.requireAuth()) return;
  Layout.init('profile');

  const $form = $('#profile-form');
  const $btn = $('#save-btn');
  let me = null;

  loadProfile();
  loadActivity();

  function initials(name) {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('');
  }

  async function loadProfile() {
    try {
      const res = await Api.users.me();
      me = res.data;
      renderSummary();
      $('#full_name').val(me.full_name);
      $('#email').val(me.email);
      $('#role-text').html(roleBadge());
      $('#status-text').html(statusBadge());
      $form.find('input, button').prop('disabled', false);
    } catch (err) {
      UI.errorState($('#summary'), err.message, loadProfile);
    }
  }

  function roleBadge() {
    return me.role === 'admin'
      ? '<span class="badge bg-signal/30 text-ink">Administrator</span>'
      : '<span class="badge bg-civic-light text-civic-dark">Member</span>';
  }
  function statusBadge() {
    return me.is_active === false
      ? '<span class="badge bg-red-50 text-danger">Disabled</span>'
      : '<span class="badge bg-civic-light text-civic-dark">Active</span>';
  }

  function renderSummary() {
    $('#summary').attr('aria-busy', 'false').html(
      '<h2 id="summary-heading" class="sr-only">Account summary</h2>' +
      '<div class="flex flex-wrap items-center gap-4">' +
        '<span class="h-16 w-16 rounded-full bg-ink text-signal grid place-items-center text-2xl font-extrabold" aria-hidden="true">' + UI.esc(initials(me.full_name)) + '</span>' +
        '<div class="min-w-0 flex-1">' +
          '<p class="text-xl font-bold break-words">' + UI.esc(me.full_name) + '</p>' +
          '<p class="text-muted break-all">' + UI.esc(me.email) + '</p>' +
          '<div class="flex flex-wrap gap-2 mt-2">' + roleBadge() + statusBadge() + '</div>' +
        '</div>' +
        '<p class="text-sm text-muted w-full sm:w-auto">Member since ' + UI.esc(UI.formatDate(me.created_at, false)) + '</p>' +
      '</div>'
    );
  }

  async function loadActivity() {
    const $a = $('#activity');
    $a.html('<div class="skeleton h-24"></div><div class="skeleton h-24"></div><div class="skeleton h-24"></div>');
    try {
      const results = await Promise.all([Api.dashboard.me(), Api.notifications.list()]);
      const d = results[0].data || {};
      const notes = results[1].data || [];
      const read = Layout.getReadIds();
      const unread = notes.filter(function (n) { return !read.has(n.id); }).length;
      const tile = function (value, label, href, linkText) {
        return '<div class="card p-4">' +
          '<p class="text-3xl font-extrabold">' + Number(value || 0) + '</p>' +
          '<p class="text-sm text-muted">' + label + '</p>' +
          (href ? '<a href="' + href + '" class="text-sm font-semibold text-civic underline mt-2 inline-block">' + linkText + '</a>' : '') +
        '</div>';
      };
      $a.html(
        tile(d.registrations && d.registrations.total_registered_events, 'Event registrations', Auth.isAdmin() ? '' : 'my-registrations.html', 'See my registrations') +
        tile(d.feedbacks && d.feedbacks.total_feedbacks, 'Feedback given') +
        tile(unread, 'Unread notifications')
      );
    } catch (err) {
      UI.errorState($a, err.message, loadActivity);
    }
  }

  $form.on('submit', async function (e) {
    e.preventDefault();
    UI.clearErrors($form);
    const fullName = $('#full_name').val().trim();
    const email = $('#email').val().trim();

    let valid = true;
    if (fullName.length < 2) { UI.fieldError('full_name', 'Enter your full name.'); valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { UI.fieldError('email', 'Enter a valid email address.'); valid = false; }
    if (!valid) { $form.find('[aria-invalid="true"]').first().trigger('focus'); return; }

    // Only send what changed. Never send role or is_active.
    const changes = {};
    if (fullName !== me.full_name) changes.full_name = fullName;
    if (email.toLowerCase() !== (me.email || '').toLowerCase()) changes.email = email;
    if (!Object.keys(changes).length) { UI.toast('There are no changes to save.', 'info'); return; }

    if (changes.email) {
      const ok = await UI.confirm({
        title: 'Change your sign-in email?',
        message: 'From now on you\'ll sign in with ' + email + ' instead of ' + me.email + '.',
        confirmLabel: 'Change email'
      });
      if (!ok) return;
    }

    UI.setBusy($btn, true, 'Saving…');
    try {
      const res = await Api.users.updateMe(changes);
      me = Object.assign(me, res.data);
      Auth.updateUser({ full_name: me.full_name, email: me.email });
      Layout.refreshUser();
      renderSummary();
      UI.setBusy($btn, false);
      UI.toast('Profile updated.', 'success');
    } catch (err) {
      UI.setBusy($btn, false);
      if (err.status === 409) {
        UI.fieldError('email', 'Another account already uses this email. Use a different one.');
        $('#email').trigger('focus');
      } else {
        UI.formAlert($form, err.message);
      }
    }
  });
});
