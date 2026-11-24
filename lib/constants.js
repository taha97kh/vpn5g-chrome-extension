/* TAHA VPN 5G — ثابت‌ها و پیکربندی مشترک
 * کلید anon سوپابیس کلید عمومی سمت کاربر است و طبق طراحی سوپابیس
 * برای انتشار در کد سمت کاربر ساخته شده است. هیچ کلید محرمانه‌ای
 * (service_role، رمز ربات، اطلاعات پرداخت) هرگز در این فایل نیست.
 * همه‌ی مقادیر تجاری (طرح‌ها، قیمت‌ها، کدها، تبلیغات) از راه دور
 * خوانده می‌شوند و در کد ثابت نیستند. */
(function (global) {
  'use strict';

  const VPN5G = {
    VERSION: '1.1.0',
    BRAND: 'TAHA VPN 5G',
    CREATOR_FA: 'ساخته شده توسط AREF KH — ۲۰۲۶ - ۱۴۰۵',
    BOT_URL: 'https://t.me/VPN5G_IRBot',
    BOT_SUPPORT_URL: 'https://t.me/VPN5G_IRBot?start=support',
    BOT_USERNAME: '@VPN5G_IRBot',
    CHANNEL_USERNAME: '@VPNCRACKNET',
    CHANNEL_URL: 'https://t.me/VPNCRACKNET',

    // سوپابیس — پروژه‌ی جدید (مهاجرت ۱.۱.۱۰ اندروید)
    SUPABASE_URL: 'https://atvcpfnnmwguhjvhbbfj.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0dmNwZm5ubXdndWhqdmhiYmZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0MzQ1MjUsImV4cCI6MjExMTAxMDUyNX0.4Xm5jUrfVP3rkGBFbWaaY6xJ9BBBONaWzevUNbFg6J4',

    // پیکربندی راه دور و لیست زنده‌ی سرورها
    APP_CONFIG_URL: 'https://taha97kh-vpn5g-app.static.hf.space/app_config.json',
    LIVE_CONFIGS_URL: 'https://taha97kh-vpn5g-app.static.hf.space/live_configs.json',
    SUB_TXT_URL: 'https://taha97kh-vpn5g-app.static.hf.space/sub.txt',

    // منابع عمومی کانفیگ (همان منابع اندروید) — هر منبع حداکثر ۳۰۰ خط
    BUILTIN_SOURCES: [
      'https://raw.githubusercontent.com/0xRadikal/Free-v2ray-Configs/main/verified/configs.txt',
      'https://raw.githubusercontent.com/barry-far/V2ray-Config/main/All_Configs_Sub.txt',
      'https://raw.githubusercontent.com/morpheusadam/v2ray-config/main/subs/bundles/iran.txt',
      'https://raw.githubusercontent.com/morpheusadam/v2ray-config/main/subs/bundles/best.txt',
      'https://raw.githubusercontent.com/Alirewa/V2ray-Configs/main/config.txt',
      'https://raw.githubusercontent.com/MatinGhanbari/v2ray-configs/main/subscriptions/v2ray/super-sub.txt'
    ],
    MAX_LINES_PER_SOURCE: 300,
    SYNC_INTERVAL_MINUTES: 5,

    // سطح‌های دسترسی (همان اندروید ۱.۱.۱۱ / ۱.۱.۱۴)
    FREE_SERVER_COUNT: 20,
    GIFT_SERVER_COUNT: 50,

    // کمک‌کننده‌ی محلی (اپ دسکتاپ ویندوز TAHA VPN 5G)
    // ورودی SOCKS5 و آمار سرعت — قرارداد با اپ ویندوز نسخه‌ی ۲٫۱٫۰
    // دستور اتصال/قطع از راه پیام‌رسانی بومی انجام می‌شود (lib/native.js)؛
    // سرعت زنده فقط از آمار HTTP کمک‌کننده خوانده می‌شود.
    HELPER_HOST: '127.0.0.1',
    HELPER_SOCKS_PORT: 10809,
    HELPER_STATS_PORT: 17890,
    HELPER_STATS_PATH: '/api/stats',

    // پیام‌رسانی بومی (Native Messaging) — نام میزبان در ویندوز؛ شناسه‌ی
    // ثابت افزونه از کلید عمومی manifest.json می‌آید و در allowed_origins
    // مانیفست میزبان ثبت شده است.
    NM_HOST: 'com.taha97kh.vpn5g',

    // تبلیغ تمام‌صفحه (قرارداد ۱.۱.۱۵ اندروید)
    AD_MIN_SECONDS: 1,
    AD_MAX_SECONDS: 20,
    AD_DEFAULT_SECONDS: 10,

    // کف و سقف‌های شبکه
    FETCH_TIMEOUT_MS: 15000,
    PROBE_TIMEOUT_MS: 4000,
    PROBE_CONCURRENCY: 8,
    PROBE_CANDIDATE_CAP: 120
  };

  global.VPN5G = VPN5G;
})(typeof self !== 'undefined' ? self : this);
