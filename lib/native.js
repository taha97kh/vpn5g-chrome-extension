/* TAHA VPN 5G — پیام‌رسانی بومی (Native Messaging)
 * اتصال و قطع اتصال و وضعیت، از راه میزبان بومی ویندوز (nmhost.exe)
 * انجام می‌شود؛ میزبان خودش هیچ وضعیتی ندارد و همه‌چیز را از برنامه‌ی
 * دسکتاپ روی 127.0.0.1:17890 می‌خواند. احراز هویت را کروم انجام می‌دهد:
 * فقط همین افزونه (شناسه‌ی ثابت از کلید عمومی manifest.json) در
 * allowed_origins مانیفست میزبان ثبت شده است.
 *
 * پاسخ‌ها فقط وقتی پذیرفته می‌شوند که شیء باشند و ok بولی داشته باشند؛
 * هر پاسخ دیگری رد می‌شود. وقتی میزبان نصب نشده باشد، به‌جای وضعیت
 * جعلی، host_missing برمی‌گردد تا راهنمای نصب نشان داده شود. سرعت زنده
 * از این مسیر خوانده نمی‌شود (پاپ‌آپ هر ثانیه آمار HTTP می‌خواند) تا
 * برای هر نمونه‌برداری، یک پردازش تازه ساخته نشود. */
(function (global) {
  'use strict';

  const C = global.VPN5G;

  function sendNative(msg) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendNativeMessage) {
        resolve({ ok: false, error: 'host_missing' });
        return;
      }
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve({ ok: false, error: 'timeout' }); }
      }, 8000);
      try {
        chrome.runtime.sendNativeMessage(C.NM_HOST, msg, (res) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            const m = String(chrome.runtime.lastError.message || '');
            if (/not found/i.test(m)) resolve({ ok: false, error: 'host_missing' });
            else resolve({ ok: false, error: 'host_error', detail: m });
            return;
          }
          resolve(validateReply(res));
        });
      } catch (e) {
        if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, error: 'host_error' }); }
      }
    });
  }

  /** پاسخ فقط وقتی معتبر است که شیء باشد و ok بولی داشته باشد. */
  function validateReply(res) {
    if (!res || typeof res !== 'object' || typeof res.ok !== 'boolean') {
      return { ok: false, error: 'bad_reply' };
    }
    return res;
  }

  function probeNative() { return sendNative({ type: 'ping' }); }
  function nativeStatus() { return sendNative({ type: 'status' }); }
  function nativeConnect(uri) { return sendNative({ type: 'connect', uri: String(uri || '') }); }
  function nativeDisconnect() { return sendNative({ type: 'disconnect' }); }

  global.Vpn5gNative = { probeNative, nativeStatus, nativeConnect, nativeDisconnect, sendNative };
})(typeof self !== 'undefined' ? self : this);
