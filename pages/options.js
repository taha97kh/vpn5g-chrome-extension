/* TAHA VPN 5G — صفحه‌ی تنظیمات */
(function () {
  'use strict';

  const C = window.VPN5G;
  const U = window.Vpn5gUtil;
  const P = window.Vpn5gProxy;

  function get(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, (r) => resolve(r || {})));
  }
  function set(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()));
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('version').textContent = U.toFaDigits(C.VERSION);
    const s = await get(['settings']);
    const settings = s.settings || {};
    document.getElementById('helperHost').value = settings.helperHost || C.HELPER_HOST;
    document.getElementById('helperSocksPort').value = settings.helperSocksPort || C.HELPER_SOCKS_PORT;
    document.getElementById('helperWebPort').value = settings.helperWebPort || C.HELPER_WEB_PORT;

    document.getElementById('saveBtn').addEventListener('click', async () => {
      const host = document.getElementById('helperHost').value.trim() || C.HELPER_HOST;
      const socks = parseInt(document.getElementById('helperSocksPort').value, 10) || C.HELPER_SOCKS_PORT;
      const web = parseInt(document.getElementById('helperWebPort').value, 10) || C.HELPER_WEB_PORT;
      await set({ settings: { helperHost: host, helperSocksPort: socks, helperWebPort: web } });
      const msg = document.getElementById('helperMsg');
      msg.textContent = 'تنظیمات ذخیره شد.';
      msg.className = 'msg ok';
    });

    document.getElementById('probeBtn').addEventListener('click', async () => {
      const msg = document.getElementById('helperMsg');
      msg.textContent = 'در حال بررسی…';
      msg.className = 'msg';
      const r = await P.probeHelper();
      if (r.alive && r.stats) {
        msg.textContent = 'کمک‌کننده در حال اجراست و آمار سرعت را می‌دهد.';
        msg.className = 'msg ok';
      } else if (r.alive) {
        msg.textContent = 'کمک‌کننده در حال اجراست ولی نسخه‌ی قدیمی است؛ برای آمار سرعت آن را به‌روزرسانی کنید.';
        msg.className = 'msg ok';
      } else {
        msg.textContent = 'کمک‌کننده پیدا نشد؛ اپ دسکتاپ TAHA VPN 5G را باز کنید.';
        msg.className = 'msg err';
      }
    });
  });
})();
