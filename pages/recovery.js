/* TAHA VPN 5G — تکمیل بازیابی رمز عبور
 * توکن از بخش # آدرس لینک بازیابی خوانده می‌شود (GoTrue).
 * نکته: آدرس این صفحه باید در Redirect URLs سوپابیس ثبت شده باشد. */
(function () {
  'use strict';

  function parseHash() {
    const out = {};
    const hash = window.location.hash.replace(/^#/, '');
    for (const part of hash.split('&')) {
      const kv = part.split('=');
      if (kv.length === 2) out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
    }
    return out;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const params = parseHash();
    const token = params.access_token || '';
    const msg = document.getElementById('msg');
    if (!token || params.type !== 'recovery') {
      msg.textContent = 'لینک بازیابی معتبر نیست؛ از پاپ‌آپ افزونه دوباره درخواست بدهید.';
      msg.className = 'msg err';
      document.getElementById('submitBtn').disabled = true;
      return;
    }
    document.getElementById('submitBtn').addEventListener('click', async () => {
      const p1 = document.getElementById('newPassword').value;
      const p2 = document.getElementById('newPassword2').value;
      if (p1.length < 6) {
        msg.textContent = 'رمز عبور باید حداقل ۶ کاراکتر باشد.';
        msg.className = 'msg err';
        return;
      }
      if (p1 !== p2) {
        msg.textContent = 'تکرار رمز عبور یکی نیست.';
        msg.className = 'msg err';
        return;
      }
      msg.textContent = 'در حال ثبت…';
      msg.className = 'msg';
      const r = await window.Vpn5gSupabase.updatePasswordWithToken(token, p1);
      if (r.ok) {
        msg.textContent = 'رمز عبور عوض شد؛ حالا از پاپ‌آپ افزونه وارد شوید.';
        msg.className = 'msg ok';
      } else {
        msg.textContent = r.error || 'ثبت ناموفق بود؛ لینک را دوباره درخواست کنید.';
        msg.className = 'msg err';
      }
    });
  });
})();
