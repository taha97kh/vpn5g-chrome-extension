/* TAHA VPN 5G — صفحه‌ی تنظیمات
 * وضعیت اپ دسکتاپ از راه سرویس‌ورکر و پیام‌رسانی بومی بررسی می‌شود؛
 * اگر میزبان بومی نصب نشده باشد، راهنمای نصب نشان داده می‌شود. */
(function () {
  'use strict';

  const C = window.VPN5G;
  const U = window.Vpn5gUtil;

  function send(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (res) => resolve(res || { ok: false, error: 'host_missing' }));
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('version').textContent = U.toFaDigits(C.VERSION);

    document.getElementById('probeBtn').addEventListener('click', async () => {
      const msg = document.getElementById('helperMsg');
      const vol = document.getElementById('volumeMsg');
      msg.textContent = 'در حال بررسی…';
      msg.className = 'msg';
      vol.textContent = '';
      const r = await send({ type: 'desktopStatus' });
      if (r && r.ok) {
        msg.textContent = 'اپ ویندوز در حال اجراست و افزونه به آن وصل است.';
        msg.className = 'msg ok';
        if (r.volume_limited) {
          const used = U.faNum(Number(r.used_gb || 0).toFixed(1));
          const total = U.faNum(Number(r.volume_gb || 0).toFixed(1));
          vol.textContent = r.volume_exceeded
            ? 'حجم اشتراک تمام شد — برای ادامه تمدید کنید.'
            : 'حجم: ' + used + ' از ' + total + ' گیگابایت (' + U.faNum(Math.round(r.usage_percent || 0)) + '٪)';
        } else if (r.plan) {
          vol.textContent = 'حجم: نامحدود';
        }
      } else if (r && r.error === 'host_missing') {
        msg.textContent = 'میزبان پیام‌رسانی نصب نشده است؛ نصب‌کننده‌ی ویندوز (TAHA VPN 5G Setup.exe) را اجرا کنید.';
        msg.className = 'msg err';
      } else if (r && r.error === 'app_not_running') {
        msg.textContent = 'اپ ویندوز نصب است ولی در حال اجرا نیست؛ آن را باز کنید.';
        msg.className = 'msg err';
      } else {
        msg.textContent = 'بررسی ناموفق بود؛ اتصال اینترنت و نصب ویندوز را بررسی کنید.';
        msg.className = 'msg err';
      }
    });
  });
})();
