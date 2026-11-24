/* TAHA VPN 5G — لایه‌ی پروکسی
 * واقعیت فنی: API پروکسی کروم (chrome.proxy) فقط HTTP و SOCKS5 می‌فهمد؛
 * VLESS و VMess و Trojan و Shadowsocks را مستقیم نمی‌فهمد. پس تونل
 * واقعی فقط از دو راه ممکن است:
 *  ۱) کمک‌کننده‌ی محلی: اپ دسکتاپ TAHA VPN 5G (ویندوز نسخه‌ی ۲٫۱٫۰) که
 *     هسته‌ی Xray را اجرا می‌کند و یک ورودی SOCKS5 روی 127.0.0.1:10809
 *     دارد؛ افزونه پروکسی کروم را به همان ورودی وصل می‌کند. دستور
 *     اتصال/قطع از راه پیام‌رسانی بومی انجام می‌شود (lib/native.js) و
 *     سرعت زنده از آمار HTTP کمک‌کننده خوانده می‌شود (fetchHelperStats).
 *  ۲) سرور مستقیم SOCKS5 یا HTTP — اگر خود کانفیگ همین باشد.
 * افزونه هرگز بدون یکی از این دو، «متصل» گزارش نمی‌کند و سرعت جعلی
 * نشان نمی‌دهد. سرعت زنده فقط از آمار کمک‌کننده خوانده می‌شود. */
(function (global) {
  'use strict';

  const U = global.Vpn5gUtil;
  const C = global.VPN5G;

  function helperStatsUrl() {
    return 'http://' + C.HELPER_HOST + ':' + C.HELPER_STATS_PORT + C.HELPER_STATS_PATH;
  }

  /** آمار زنده از کمک‌کننده: {download_bps, upload_bps, connected} یا null.
   * فقط خواندن سرعت است؛ دستور اتصال از راه پیام‌رسانی بومی می‌رود. */
  async function fetchHelperStats() {
    try {
      const res = await U.fetchWithTimeout(helperStatsUrl(), {}, 2000);
      if (!res.ok) return null;
      const j = await res.json();
      if (!j || typeof j !== 'object') return null;
      return {
        download_bps: Number(j.download_bps) >= 0 ? Number(j.download_bps) : null,
        upload_bps: Number(j.upload_bps) >= 0 ? Number(j.upload_bps) : null,
        connected: !!j.connected
      };
    } catch (e) {
      return null;
    }
  }

  /** پارس پروکسی مستقیم SOCKS5 یا HTTP از روی URI (بدون احراز هویت در این نسخه). */
  function parseDirectProxy(uri) {
    if (!uri || typeof uri !== 'string') return null;
    const m = uri.match(/^(socks5|http|https):\/\//i);
    if (!m) return null;
    const scheme = m[1].toLowerCase() === 'https' ? 'https' : m[1].toLowerCase();
    const rest = uri.slice(uri.indexOf('://') + 3).split(/[/?#]/)[0];
    const at = rest.lastIndexOf('@');
    const hostPort = at >= 0 ? rest.slice(at + 1) : rest;
    if (at >= 0) return null; // احراز هویت در این نسخه پشتیبانی نمی‌شود
    const colon = hostPort.lastIndexOf(':');
    if (colon < 0) return null;
    const host = hostPort.slice(0, colon);
    const port = parseInt(hostPort.slice(colon + 1), 10);
    if (!host || !Number.isFinite(port)) return null;
    return { scheme: scheme, host: host, port: port };
  }

  function setProxyFixed(scheme, host, port) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.proxy) return resolve(false);
      chrome.proxy.settings.set({
        value: {
          mode: 'fixed_servers',
          rules: { singleProxy: { scheme: scheme, host: host, port: port }, bypassList: ['<local>'] }
        },
        scope: 'regular'
      }, () => resolve(!chrome.runtime.lastError));
    });
  }

  function clearProxy() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.proxy) return resolve(false);
      chrome.proxy.settings.clear({ scope: 'regular' }, () => resolve(!chrome.runtime.lastError));
    });
  }

  function getProxyState() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.proxy) return resolve(null);
      chrome.proxy.settings.get({ incognito: false }, (details) => resolve(details || null));
    });
  }

  /** آی‌پی خروجی فعلی (برای تأیید واقعی تونل بعد از اتصال). */
  async function fetchExitIp() {
    try {
      const res = await U.fetchWithTimeout('https://api.ipify.org?format=json', {}, 8000);
      if (!res.ok) return null;
      const j = await res.json();
      return (j && j.ip) ? String(j.ip) : null;
    } catch (e) {
      return null;
    }
  }

  const Proxy = {
    fetchHelperStats, parseDirectProxy,
    setProxyFixed, clearProxy, getProxyState, fetchExitIp
  };

  global.Vpn5gProxy = Proxy;
})(typeof self !== 'undefined' ? self : this);
