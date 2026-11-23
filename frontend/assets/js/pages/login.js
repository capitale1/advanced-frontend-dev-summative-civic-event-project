/**
 * login.js — POST /api/auth/login, store token + user, go to the app.
 */
$(function () {
  Auth.redirectIfLoggedIn();
  UI.bindPasswordToggles();
  UI.showFlash();

  // Messages for redirects from Auth.logout(reason)
  const reasons = {
    expired: 'Your session expired. Sign in again to continue.',
    disabled: 'This account has been disabled. Contact an administrator to restore access.'
  };
  const reason = UI.param('reason');
  if (reasons[reason]) $('#reason-alert').text(reasons[reason]).removeClass('hidden');

  const $form = $('#login-form');
  const $btn = $('#login-btn');

  $form.on('submit', async function (e) {
    e.preventDefault();
    UI.clearErrors($form);

    const email = $('#email').val().trim();
    const password = $('#password').val();
    let valid = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { UI.fieldError('email', 'Enter a valid email address.'); valid = false; }
    if (!password) { UI.fieldError('password', 'Enter your password.'); valid = false; }
    if (!valid) { $form.find('[aria-invalid="true"]').first().trigger('focus'); return; }

    UI.setBusy($btn, true, 'Signing in…');
    try {
      const res = await Api.auth.login({ email: email, password: password });
      const token = res.data.token;
      const user = res.data.user; // { id, full_name, email, role }
      Auth.save(token, user, $('#remember').is(':checked'));

      // The backend lets disabled accounts log in, so check is_active here
      // and sign them straight back out.
      try {
        const me = await Api.users.me();
        if (me.data && me.data.is_active === false) { Auth.logout('disabled'); return; }
        Auth.updateUser({ is_active: me.data.is_active });
      } catch (ignore) { /* profile check is best-effort */ }

      UI.flash('Welcome back, ' + (user.full_name || '').split(' ')[0] + '.', 'success');
      // Admins land on their dashboard; everyone else on events.
      window.location.href = user.role === 'admin' ? 'dashboard.html' : 'events.html';
    } catch (err) {
      UI.setBusy($btn, false);
      UI.formAlert($form, err.status === 401 ? 'That email and password don\'t match. Check them and try again.' : err.message);
      $('#email').trigger('focus');
    }
  });
});
