/* TAHA VPN 5G — صفحه‌ی تبلیغ تمام‌صفحه
 * شمارش معکوس با ساعت یکنواخت (performance.now) انجام می‌شود تا
 * تغییر ساعت گوشی/سیستم شمارنده را دور نزند. بستن صفحه پیش از
 * پایان یعنی مشاهده‌ی ناقص و اتصال شروع نمی‌شود. */
(function () {
  'use strict';

  const U = window.Vpn5gUtil;

  function getStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, (r) => resolve(r || {})));
  }

  function send(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (res) => resolve(res || { ok: false }));
    });
  }

  async function init() {
    const state = await getStorage(['remoteConfig', 'session', 'pendingConnect']);
    const config = state.remoteConfig || {};
    const ad = window.Vpn5gAds.getAdConfig(config);
    const ann = window.Vpn5gAds.getAnnouncement(config);

    const mediaUrl = ad.media_url || (ann && ann.image_url) || null;
    const text = ad.text || (ann && ann.text) || 'TAHA VPN 5G';
    const linkUrl = ad.link_url || (ann && ann.link_url) || null;
    const buttonTitle = ad.button_title || (ann && ann.button_title) || 'مشاهده';
    const adId = (ann && ann.id) || 'ad-default';
    const totalSeconds = ad.duration_seconds || 10;

    const img = document.getElementById('adImage');
    if (mediaUrl) {
      img.src = mediaUrl;
      img.classList.remove('hidden');
      img.onerror = () => img.classList.add('hidden');
    }
    document.getElementById('adText').textContent = text;
    const link = document.getElementById('adLink');
    if (linkUrl) {
      link.classList.remove('hidden');
      link.href = linkUrl;
      link.textContent = buttonTitle;
      link.addEventListener('click', () => {
        window.Vpn5gAds.recordAdClick(adId, state.session);
      });
    }

    const countNum = document.getElementById('countNum');
    const barFill = document.getElementById('barFill');
    const statusText = document.getElementById('statusText');
    const start = performance.now();
    const totalMs = totalSeconds * 1000;

    const timer = setInterval(() => {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, totalMs - elapsed);
      const remainSec = Math.ceil(remaining / 1000);
      countNum.textContent = U.toFaDigits(remainSec);
      barFill.style.width = Math.min(100, (elapsed / totalMs) * 100) + '%';
      if (remaining <= 0) {
        clearInterval(timer);
        finish();
      }
    }, 100);

    async function finish() {
      countNum.textContent = '✓';
      statusText.textContent = 'تبلیغ کامل دیده شد؛ در حال اتصال…';
      document.getElementById('closeBtn').classList.add('hidden');
      await window.Vpn5gAds.recordAdView(adId, state.session);
      const r = await send({ type: 'ad-complete' });
      if (r && r.ok) {
        statusText.textContent = 'متصل شدید.';
        setTimeout(() => window.close(), 1200);
      } else {
        statusText.textContent = (r && r.error) || 'اتصال ناموفق بود؛ پنجره را ببندید و دوباره تلاش کنید.';
      }
    }

    document.getElementById('closeBtn').addEventListener('click', async () => {
      clearInterval(timer);
      await send({ type: 'ad-aborted' });
      window.close();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
