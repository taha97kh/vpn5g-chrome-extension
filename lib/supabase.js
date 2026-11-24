/* TAHA VPN 5G — احراز هویت و اشتراک (سوپابیس)
 * فقط رمز عبور؛ کد یکبارمصرف کاملاً حذف شده است (اندروید ۱.۱.۹).
 * ثبت‌نام: یک حساب برای هر ایمیل و هر آی‌پی — از طریق RPC های
 * check_registration / register_account که در SQL پروژه تعریف شده‌اند.
 * اعتبارسنجی کد از سمت سرور (قرارداد ۱.۱.۱۵ اندروید) در صورت وجود
 * RPC مربوطه استفاده می‌شود و در غیر این صورت به بررسی لیست کدهای
 * پیکربندی راه دور برمی‌گردد — هرگز موفقیت جعلی گزارش نمی‌شود. */
(function (global) {
  'use strict';

  const U = global.Vpn5gUtil;
  const C = global.VPN5G;

  function headers(session) {
    const h = { 'apikey': C.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    if (session && session.access_token) h['Authorization'] = 'Bearer ' + session.access_token;
    return h;
  }

  async function callJson(path, options, session) {
    const res = await U.fetchWithTimeout(
      C.SUPABASE_URL + path,
      Object.assign({}, options || {}, { headers: headers(session) }),
      C.FETCH_TIMEOUT_MS
    );
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return { status: res.status, ok: res.ok, body: body };
  }

  /** پیام فارسی خطا از روی کلید خطای GoTrue. */
  function mapError(body, status) {
    const msg = (body && (body.error_description || body.msg || body.message)) || '';
    const code = (body && (body.error_code || body.error)) || '';
    if (status === 422 && /user already registered|already registered/i.test(msg + code)) return 'این ایمیل قبلاً ثبت شده است؛ وارد شوید.';
    if (status === 400 && /invalid login credentials|invalid_credentials/i.test(msg + code)) return 'ایمیل یا رمز عبور اشتباه است.';
    if (/weak password|password should be/i.test(msg)) return 'رمز عبور باید حداقل ۶ کاراکتر باشد.';
    if (/email.*not confirmed|email_not_confirmed/i.test(msg + code)) return 'ایمیل هنوز تأیید نشده است.';
    if (/too many requests|rate limit|over_request/i.test(msg + code)) return 'درخواست زیاد است؛ چند دقیقه بعد دوباره تلاش کنید.';
    if (/network|failed to fetch|abort/i.test(msg)) return 'خطای شبکه؛ اتصال اینترنت را بررسی کنید.';
    return 'خطایی رخ داد؛ دوباره تلاش کنید.';
  }

  /** آی‌پی عمومی از طریق Edge Function پروژه‌ی جدید. */
  async function fetchPublicIp() {
    const r = await callJson('/functions/v1/get-client-ip', { method: 'GET' }, null);
    if (r.ok && r.body && r.body.ip) return String(r.body.ip);
    throw new Error('ip');
  }

  /** ثبت‌نام با ایمیل و رمز عبور — فقط در صورت خالی بودن ایمیل و آی‌پی. */
  async function signup(email, password) {
    const ip = await fetchPublicIp();
    const check = await callJson('/rest/v1/rpc/check_registration', {
      method: 'POST', body: JSON.stringify({ p_email: email, p_ip: ip })
    }, null);
    if (!check.ok) throw new Error('network');
    const row = Array.isArray(check.body) ? check.body[0] : check.body;
    if (row && row.email_taken) return { ok: false, error: 'این ایمیل قبلاً ثبت شده است؛ وارد شوید.' };
    if (row && row.ip_taken) return { ok: false, error: 'با این اینترنت قبلاً یک حساب ساخته شده است؛ هر اینترنت فقط یک حساب.' };

    const res = await callJson('/auth/v1/signup', {
      method: 'POST', body: JSON.stringify({ email: email, password: password })
    }, null);
    if (!res.ok) return { ok: false, error: mapError(res.body, res.status) };
    const session = toSession(res.body, email);
    if (!session) return { ok: false, error: 'ثبت‌نام کامل نشد؛ دوباره تلاش کنید.' };
    // ثبت ایمیل و آی‌پی — بهترین تلاش؛ UNIQUE(ip) در دیتابیس پشتیبان مسابقه است.
    try {
      await callJson('/rest/v1/rpc/register_account', {
        method: 'POST', body: JSON.stringify({ p_email: email, p_ip: ip })
      }, session);
    } catch (e) { /* بهترین تلاش — ثبت‌نام موفق است */ }
    return { ok: true, session: session };
  }

  /** ورود با رمز عبور. */
  async function login(email, password) {
    const res = await callJson('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email: email, password: password })
    }, null);
    if (!res.ok) return { ok: false, error: mapError(res.body, res.status) };
    const session = toSession(res.body, email);
    if (!session) return { ok: false, error: 'ورود کامل نشد؛ دوباره تلاش کنید.' };
    return { ok: true, session: session };
  }

  /** ارسال لینک بازیابی رمز عبور.
   * نکته‌ی داشبورد: آدرس بازگشت افزونه باید در تنظیمات احراز هویت
   * سوپابیس (Redirect URLs) ثبت شود تا لینک به افزونه برگردد. */
  async function recover(email) {
    const redirectTo = (typeof chrome !== 'undefined' && chrome.runtime)
      ? chrome.runtime.getURL('pages/recovery.html')
      : 'https://t.me/VPN5G_IRBot';
    const res = await callJson('/auth/v1/recover', {
      method: 'POST', body: JSON.stringify({ email: email, redirect_to: redirectTo })
    }, null);
    if (!res.ok) return { ok: false, error: mapError(res.body, res.status) };
    return { ok: true };
  }

  /** تنظیم رمز جدید با توکن لینک بازیابی. */
  async function updatePasswordWithToken(accessToken, newPassword) {
    const res = await U.fetchWithTimeout(C.SUPABASE_URL + '/auth/v1/user', {
      method: 'PUT',
      headers: { 'apikey': C.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword })
    }, C.FETCH_TIMEOUT_MS);
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      return { ok: false, error: mapError(body, res.status) };
    }
    return { ok: true };
  }

  /** تمدید نشست با refresh_token. */
  async function refreshSession(session) {
    if (!session || !session.refresh_token) return null;
    const res = await callJson('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token })
    }, null);
    if (!res.ok) return null;
    return toSession(res.body, session.email);
  }

  function toSession(body, email) {
    if (!body || !body.access_token || !body.user || !body.user.id) return null;
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token || '',
      user_id: body.user.id,
      email: email || body.user.email || '',
      expires_at: body.expires_in ? Date.now() + body.expires_in * 1000 : 0
    };
  }

  /** پیوند شناسه‌ی کاربر به ردیف ثبت‌نام (بهترین تلاش). */
  async function setOwnUserId(session) {
    try {
      const r = await callJson('/rest/v1/rpc/set_own_user_id', { method: 'POST', body: JSON.stringify({}) }, session);
      return r.ok && r.body === true;
    } catch (e) {
      return false;
    }
  }

  /** وضعیت اشتراک کاربر از ردیف خودش (RLS با توکن خودش). */
  async function fetchSubscription(session) {
    if (!session) return null;
    try {
      const r = await callJson(
        '/rest/v1/vpn5g_registrations?select=subscription_status,subscription_expires_at,subscription_plan&user_id=eq.' + encodeURIComponent(session.user_id),
        { method: 'GET' }, session
      );
      if (!r.ok || !Array.isArray(r.body) || r.body.length === 0) return null;
      const row = r.body[0];
      const expires = row.subscription_expires_at ? Date.parse(row.subscription_expires_at) : 0;
      const active = row.subscription_status === 'active' && expires > Date.now();
      return {
        status: row.subscription_status || 'none',
        plan: row.subscription_plan || null,
        expires_at: expires || 0,
        active: !!active,
        remaining_days: active ? Math.max(0, Math.ceil((expires - Date.now()) / 86400000)) : 0
      };
    } catch (e) {
      return null;
    }
  }

  /** ثبت استفاده از کد — بهترین تلاش؛ هرگز فعال‌سازی را خراب نمی‌کند. */
  async function recordCodeRedemption(code, email, session) {
    try {
      const r = await callJson('/rest/v1/rpc/record_code_redemption', {
        method: 'POST', body: JSON.stringify({ p_code: code, p_email: email })
      }, session || null);
      return r.ok && r.body === true;
    } catch (e) {
      return false;
    }
  }

  /** اعتبارسنجی و فعال‌سازی کد از سمت سرور (قرارداد ۱.۱.۱۵).
   * اگر RPC هنوز در پروژه ساخته نشده باشد (404)، مقدار rpc:false
   * برمی‌گردد تا فراخواننده به بررسی لیست پیکربندی برگردد. */
  async function validateAndRedeemCode(code, email, session) {
    try {
      const r = await callJson('/rest/v1/rpc/validate_and_redeem_code', {
        method: 'POST', body: JSON.stringify({ p_code: code, p_email: email })
      }, session || null);
      if (r.status === 404) return { rpc: false };
      if (!r.ok) return { rpc: true, ok: false, error: mapError(r.body, r.status) };
      const b = r.body || {};
      return { rpc: true, ok: !!b.ok, tier: b.tier || null, gift_hours: b.gift_hours || null, plan: b.plan || null, error: b.error || null };
    } catch (e) {
      return { rpc: false };
    }
  }

  const Supabase = {
    signup, login, recover, updatePasswordWithToken, refreshSession,
    setOwnUserId, fetchSubscription, recordCodeRedemption,
    validateAndRedeemCode, mapError
  };

  global.Vpn5gSupabase = Supabase;
})(typeof self !== 'undefined' ? self : this);
