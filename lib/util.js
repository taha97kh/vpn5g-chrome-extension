/* TAHA VPN 5G — ابزارهای مشترک (بدون وابستگی به کروم) */
(function (global) {
  'use strict';

  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  function toFaDigits(value) {
    return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
  }

  function faNum(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return toFaDigits(Number(value).toLocaleString('en-US'));
  }

  /** قالب‌بندی سرعت: بایت‌برثانیه -> KB/s یا MB/s (فارسی). */
  function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond === null || bytesPerSecond === undefined || bytesPerSecond < 0) return '—';
    if (bytesPerSecond < 1024) return toFaDigits(Math.round(bytesPerSecond)) + ' B/s';
    if (bytesPerSecond < 1024 * 1024) return toFaDigits((bytesPerSecond / 1024).toFixed(1)) + ' KB/s';
    return toFaDigits((bytesPerSecond / (1024 * 1024)).toFixed(2)) + ' MB/s';
  }

  /** قالب‌بندی پینگ (میلی‌ثانیه) — مقدار نامعتبر «—» می‌شود، نه صفر جعلی. */
  function formatPing(ms) {
    if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
    return toFaDigits(Math.round(ms)) + 'ms';
  }

  /** عادی‌سازی ارقام فارسی/عربی به لاتین برای پارس عدد. */
  function normalizeDigits(text) {
    if (text === null || text === undefined) return '';
    let out = String(text);
    for (let i = 0; i < 10; i++) {
      out = out.split(FA_DIGITS[i]).join(String(i)).split(AR_DIGITS[i]).join(String(i));
    }
    return out;
  }

  /** base64 استاندارد و URL-safe — با تحمل خطا. */
  function b64decode(text) {
    if (!text) return '';
    try {
      let t = String(text).trim().replace(/-/g, '+').replace(/_/g, '/');
      while (t.length % 4 !== 0) t += '=';
      return decodeURIComponent(escape(atob(t)));
    } catch (e) {
      try { return atob(String(text).trim()); } catch (e2) { return ''; }
    }
  }

  function isProbablyBase64(text) {
    const t = String(text || '').trim();
    if (t.length < 20) return false;
    return /^[A-Za-z0-9+/=_-]+$/.test(t) && !t.includes('://');
  }

  /** fetch با مهلت زمانی — به‌جای آویزان ماندن بی‌نهایت. */
  async function fetchWithTimeout(url, options, timeoutMs) {
    const timeout = timeoutMs || (global.VPN5G ? VPN5G.FETCH_TIMEOUT_MS : 15000);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      return await fetch(url, Object.assign({}, options || {}, { signal: ctrl.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  function nowMs() { return Date.now(); }

  /** شناسه‌ی پایدار یک سرور از روی URI (نه اندیس لیست). */
  function serverId(uri) {
    let h = 0;
    const s = String(uri || '');
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return 'srv_' + (h >>> 0).toString(36) + '_' + s.length;
  }

  /** پاک‌سازی کشور برای گروه‌بندی: ایموجی پرچم حذف نمی‌شود، فقط فاصله‌ها یکدست می‌شوند. */
  function countryKey(country) {
    return String(country || '🌐 بین‌الملل').trim().replace(/\s+/g, ' ');
  }

  const Util = {
    toFaDigits, faNum, formatSpeed, formatPing, normalizeDigits,
    b64decode, isProbablyBase64, fetchWithTimeout, nowMs, serverId, countryKey
  };

  global.Vpn5gUtil = Util;
})(typeof self !== 'undefined' ? self : this);
