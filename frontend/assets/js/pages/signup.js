/**
 * signup.js — POST /api/auth/signup.
 * Password rules match the backend's regex in auth.controller.js.
 * Note: we never send `role`. New accounts are always normal users.
 */
$(function () {
  Auth.redirectIfLoggedIn();
  UI.bindPasswordToggles();

  const $form = $('#signup-form');
  const $btn = $('#signup-btn');
  const LEVELS = [
    { label: 'not set', color: 'bg-ink/10' },
    { label: 'very weak', color: 'bg-danger' },
    { label: 'weak', color: 'bg-danger' },
    { label: 'fair', color: 'bg-signal' },
    { label: 'good', color: 'bg-civic' },
    { label: 'strong', color: 'bg-civic-dark' }
  ];

  // Live strength meter
  $('#password').on('input', function () {
    const pw = $(this).val();
    const checks = UI.passwordChecks(pw);
    const score = pw ? Object.values(checks).filter(Boolean).length : 0;
    const level = LEVELS[score];

    $('.pw-bar').each(function (i) {
      $(this).attr('class', 'pw-bar h-1.5 flex-1 rounded ' + (i < score ? level.color : 'bg-ink/10'));
    });
    $('#pw-strength').text('Password strength: ' + level.label);

    Object.keys(checks).forEach(function (rule) {
      const $li = $('[data-rule="' + rule + '"]');
      $li.toggleClass('text-civic-dark font-semibold', checks[rule]).toggleClass('text-muted', !checks[rule]);
      $li.find('span').first().text(checks[rule] ? '✓' : '○');
      // Screen readers hear "met" / "not met" through hidden text
      $li.find('.sr-only').remove();
      $li.append('<span class="sr-only">' + (checks[rule] ? ' (met)' : ' (not met)') + '</span>');
    });
  });

  function validate(data) {
    let valid = true;
    if (data.full_name.length < 2) { UI.fieldError('full_name', 'Enter your full name.'); valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { UI.fieldError('email', 'Enter a valid email address, like name@example.com.'); valid = false; }
    const checks = UI.passwordChecks(data.password);
    if (!Object.values(checks).every(Boolean)) {
      UI.fieldError('password', 'Your password needs every item in the checklist below.');
      valid = false;
    }
    if (!data.confirm) { UI.fieldError('confirm_password', 'Type your password again.'); valid = false; }
    else if (data.confirm !== data.password) { UI.fieldError('confirm_password', 'The passwords don\'t match.'); valid = false; }
    return valid;
  }

  $form.on('submit', async function (e) {
    e.preventDefault();
    UI.clearErrors($form);

    const data = {
      full_name: $('#full_name').val().trim(),
      email: $('#email').val().trim(),
      password: $('#password').val(),
      confirm: $('#confirm_password').val()
    };
    if (!validate(data)) { $form.find('[aria-invalid="true"]').first().trigger('focus'); return; }

    UI.setBusy($btn, true, 'Creating account…');
    try {
      await Api.auth.signup({ full_name: data.full_name, email: data.email, password: data.password });
      UI.flash('Account created. Sign in to continue.', 'success');
      window.location.href = 'login.html';
    } catch (err) {
      UI.setBusy($btn, false);
      if (err.status === 409) {
        UI.fieldError('email', 'An account with this email already exists. Sign in instead.');
        $('#email').trigger('focus');
      } else {
        UI.formAlert($form, err.message);
      }
    }
  });
});
