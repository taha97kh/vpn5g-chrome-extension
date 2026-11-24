/* TAHA VPN 5G — تبلیغات
 * اطلاعیه‌ی متنی/تصویری با لینک اختیاری + تبلیغ تمام‌صفحه‌ی اجباری.
 * قانون اتصال (قرارداد ۱.۱.۱۵ اندروید): اتصال اول بدون تبلیغ؛ از
 * اتصال دوم به بعد، پیش از شروع اتصال، تبلیغ تمام‌صفحه با شمارش
 * معکوس ۱ تا ۲۰ ثانیه نمایش داده می‌شود و اتصال فقط بعد از دیدن
 * کامل آن شروع می‌شود. مشترکین کامل تبلیغ نمی‌بینند (قابل تنظیم
 * از راه دور). مشاهده از سمت سرور ثبت می‌شود؛ اگر سرور در دسترس
 * نبود، تکمیل شمارش معکوس محلی ملاک است و اپ هرگز قفل نمی‌شود. */
(function (global) {
  'use strict';

  const U = global.Vpn5gUtil;
  const C = global.VPN5G;

  /** اطلاعیه‌ی بالای صفحه‌ی اصلی — با لینک اختیاری (قرارداد ۱.۱.۱۵). */
  function getAnnouncement(config) {
    if (!config || !config.announcement) return null;
    const a = config.announcement;
    if (a.enabled !== true) return null;
    const text = (a.text || '').trim();
    if (!text) return null;
    return {
      id: a.id || text,
      text: text,
      image_url: a.image_url || null,
      link_url: a.link_url || a.link || a.url || null,
      button_title: a.button_title || null
    };
  }

  /** پیکربندی تبلیغ تمام‌صفحه از فایل راه دور (فیلد ads در فایل زنده). */
  function getAdConfig(config) {
    const ads = (config && config.ads) || {};
    const duration = Number(ads.duration_seconds) || C.AD_DEFAULT_SECONDS;
    return {
      enabled: ads.enabled === true,
      type: ads.type || 'image',
      media_url: ads.media_url || null,
      text: ads.text || null,
      link_url: ads.link_url || ads.link || null,
      button_title: ads.button_title || null,
      interval_minutes: Number(ads.interval_minutes) || 30,
      duration_seconds: Math.min(C.AD_MAX_SECONDS, Math.max(C.AD_MIN_SECONDS, duration)),
      skip_for_subscribers: ads.skip_for_subscribers !== false
    };
  }

  /** آیا برای این اتصال باید تبلیغ تمام‌صفحه نشان داده شود؟
   * connectCount = تعداد اتصال‌های همین نشست مرورگر (اتصال اول = ۰). */
  function shouldShowInterstitial(adConfig, tier, connectCount) {
    if (!adConfig || adConfig.enabled !== true) return false;
    if (connectCount < 1) return false; // اتصال اول بدون تبلیغ
    if (tier === 'subscriber' && adConfig.skip_for_subscribers) return false;
    return true;
  }

  /** ثبت مشاهده‌ی تبلیغ در سرور — بهترین تلاش؛ نبود RPC مانع اتصال نیست. */
  async function recordAdView(adId, session) {
    try {
      const res = await U.fetchWithTimeout(C.SUPABASE_URL + '/rest/v1/rpc/record_ad_view', {
        method: 'POST',
        headers: {
          'apikey': C.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Authorization': session && session.access_token ? 'Bearer ' + session.access_token : ''
        },
        body: JSON.stringify({ p_ad_id: adId || 'default' })
      }, 8000);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  /** ثبت کلیک روی تبلیغ در سرور — بهترین تلاش. */
  async function recordAdClick(adId, session) {
    try {
      const res = await U.fetchWithTimeout(C.SUPABASE_URL + '/rest/v1/rpc/record_ad_click', {
        method: 'POST',
        headers: {
          'apikey': C.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Authorization': session && session.access_token ? 'Bearer ' + session.access_token : ''
        },
        body: JSON.stringify({ p_ad_id: adId || 'default' })
      }, 8000);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  const Ads = { getAnnouncement, getAdConfig, shouldShowInterstitial, recordAdView, recordAdClick };

  global.Vpn5gAds = Ads;
})(typeof self !== 'undefined' ? self : this);
