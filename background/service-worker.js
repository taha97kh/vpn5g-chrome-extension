/* TAHA VPN 5G — سرویس‌ورکر پس‌زمینه (MV3)
 * مالک وضعیت اتصال، همگام‌سازی ۵ دقیقه‌ای، احراز هویت و تبلیغ است.
 * سرعت زنده در پاپ‌آپ خوانده می‌شود (سرویس‌ورکر نمی‌تواند هر ثانیه
 * بیدار بماند)؛ اتصال و قطع اتصال فقط اینجاست. */
importScripts('../lib/constants.js', '../lib/util.js', '../lib/config.js', '../lib/supabase.js', '../lib/proxy.js', '../lib/native.js', '../lib/ads.js');

const U = self.Vpn5gUtil;
const C = self.VPN5G;

const store = {
  get(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, (r) => resolve(r || {})));
  },
  set(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, () => resolve()));
  }
};

async function getState() {
  const s = await store.get([
    'session', 'servers', 'serversUpdatedAt', 'remoteConfig', 'remoteConfigUpdatedAt',
    'selectedServerId', 'connected', 'connectedServerId', 'connectCount',
    'subscription', 'gift', 'dismissedAnnouncementId', 'settings', 'baselineIp'
  ]);
  return Object.assign({
    session: null, servers: [], serversUpdatedAt: 0, remoteConfig: null,
    remoteConfigUpdatedAt: 0, selectedServerId: null, connected: false,
    connectedServerId: null, connectCount: 0, subscription: null, gift: null,
    dismissedAnnouncementId: null, settings: {}, baselineIp: null
  }, s);
}

/** سطح دسترسی فعلی: subscriber / gift / free — فقط از روی وضعیت سرور و هدیه‌ی فعال. */
function currentTier(state) {
  const sub = state.subscription;
  if (sub && sub.active && sub.expires_at > Date.now()) return 'subscriber';
  const gift = state.gift;
  if (gift && gift.expires_at > Date.now()) return 'gift';
  return 'free';
}

function allowedServers(state) {
  return self.Vpn5gConfig.serversForTier(state.servers || [], currentTier(state));
}

function pickServer(state) {
  const allowed = allowedServers(state);
  if (allowed.length === 0) return null;
  const sel = state.selectedServerId
    ? allowed.find((s) => s.id === state.selectedServerId)
    : null;
  return sel || allowed[0];
}

/** همگام‌سازی سرورها و پیکربندی + تازه‌سازی وضعیت اشتراک. */
async function doSync() {
  try {
    const { servers, remoteConfig, syncedAt } = await self.Vpn5gConfig.syncAll();
    const patch = { servers, serversUpdatedAt: syncedAt };
    if (remoteConfig) { patch.remoteConfig = remoteConfig; patch.remoteConfigUpdatedAt = syncedAt; }
    const state = await getState();
    if (state.session) {
      try {
        const sub = await self.Vpn5gSupabase.fetchSubscription(state.session);
        if (sub) patch.subscription = sub;
      } catch (e) { /* وضعیت قبلی می‌ماند */ }
    }
    await store.set(patch);
    return { ok: true, count: servers.length };
  } catch (e) {
    return { ok: false, error: 'همگام‌سازی ناموفق بود؛ اتصال اینترنت را بررسی کنید.' };
  }
}

/** بررسی و فعال‌سازی کد — اول سرور، بعد لیست پیکربندی. */
async function redeemCode(codeRaw, kind, state) {
  const code = String(codeRaw || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'کد را وارد کنید.' };
  const email = state.session ? state.session.email : '';
  if (!email) return { ok: false, error: 'اول وارد حساب خود شوید.' };

  // ۱) اعتبارسنجی از سمت سرور (قرارداد ۱.۱.۱۵؛ اگر RPC نیست، مرحله‌ی ۲)
  const rpc = await self.Vpn5gSupabase.validateAndRedeemCode(code, email, state.session);
  if (rpc.rpc) {
    if (!rpc.ok) return { ok: false, error: rpc.error || 'کد معتبر نیست.' };
    return await applyRedeemResult(code, kind, rpc, state);
  }

  // ۲) بازگشت به لیست کدهای پیکربندی راه دور
  const config = state.remoteConfig;
  const codes = (config && Array.isArray(config.codes)) ? config.codes : [];
  const entry = codes.find((c) => String(c.code || '').trim().toUpperCase() === code);
  if (!entry) return { ok: false, error: 'کد پیدا نشد.' };
  if (entry.status && entry.status !== 'active') return { ok: false, error: 'این کد فعال نیست.' };
  if (entry.expires_at && Date.parse(entry.expires_at) <= Date.now()) return { ok: false, error: 'تاریخ این کد گذشته است.' };
  if (typeof entry.remaining_uses === 'number' && entry.remaining_uses <= 0) return { ok: false, error: 'ظرفیت این کد تمام شده است.' };
  if (kind === 'subscription') {
    const tier = entry.tier || entry.plan || '';
    if (entry.type !== 'gift' || !String(tier).startsWith('sub_')) {
      return { ok: false, error: 'این کد هدیه است، نه کد اشتراک؛ آن را از بخش سرورها وارد کنید.' };
    }
  }
  if (kind === 'gift') {
    if (entry.type === 'gift' && entry.tier && String(entry.tier).startsWith('sub_')) {
      return { ok: false, error: 'این کد، کد اشتراک کامل است؛ آن را از بخش ویژه وارد کنید.' };
    }
    if (entry.type !== 'gift') return { ok: false, error: 'این کد هدیه نیست.' };
  }
  await self.Vpn5gSupabase.recordCodeRedemption(code, email, state.session);
  return await applyRedeemResult(code, kind, {
    tier: entry.tier || entry.plan || 'gift',
    gift_hours: entry.gift_hours || null,
    plan: entry.plan || entry.tier || null
  }, state);
}

async function applyRedeemResult(code, kind, result, state) {
  const now = Date.now();
  if (kind === 'subscription') {
    const planId = result.plan || result.tier;
    const days = planDays(planId);
    const expiresAt = now + days * 86400000;
    await store.set({ subscription: { status: 'active', plan: planId, expires_at: expiresAt, active: true, remaining_days: days } });
    return { ok: true, message: 'اشتراک با موفقیت فعال شد.', plan: planId, remaining_days: days };
  }
  const hours = Number(result.gift_hours) || 24;
  if (result.tier && String(result.tier).startsWith('sub_')) {
    const planId = result.tier;
    const days = planDays(planId);
    const expiresAt = now + days * 86400000;
    await store.set({ subscription: { status: 'active', plan: planId, expires_at: expiresAt, active: true, remaining_days: days } });
    return { ok: true, message: 'هدیه فعال شد؛ اشتراک کامل دریافت کردید.', plan: planId, remaining_days: days };
  }
  const expiresAt = now + hours * 3600000;
  await store.set({ gift: { code: code, expires_at: expiresAt, hours: hours } });
  return { ok: true, message: 'کد هدیه فعال شد.', gift_hours: hours };
}

function planDays(planId) {
  const map = { sub_1: 30, sub_3: 90, sub_6: 180, sub_12: 360 };
  return map[String(planId || '')] || 30;
}

/** اتصال: تبلیغ (از اتصال دوم)، مسیر پروکسی، تأیید واقعی با آی‌پی خروجی. */
async function doConnect(state) {
  if (!state.session) return { ok: false, error: 'اول وارد حساب خود شوید.' };
  const server = pickServer(state);
  if (!server) return { ok: false, error: 'سروری در دسترس نیست؛ لیست را به‌روزرسانی کنید.' };
  const tier = currentTier(state);
  const adConfig = self.Vpn5gAds.getAdConfig(state.remoteConfig);

  // تبلیغ تمام‌صفحه از اتصال دوم به بعد (مشترک کامل نمی‌بیند)
  if (self.Vpn5gAds.shouldShowInterstitial(adConfig, tier, state.connectCount || 0)) {
    await store.set({ pendingConnect: { serverId: server.id, startedAt: Date.now() } });
    const url = chrome.runtime.getURL('pages/interstitial.html');
    await chrome.tabs.create({ url: url, active: true });
    return { ok: true, pendingAd: true, message: 'پیش از اتصال، تبلیغ نمایش داده می‌شود.' };
  }
  return await finishConnect(server, state);
}

async function finishConnect(server, state) {
  const baseline = await self.Vpn5gProxy.fetchExitIp();
  const direct = self.Vpn5gProxy.parseDirectProxy(server.uri);
  if (direct) {
    const set = await self.Vpn5gProxy.setProxyFixed(direct.scheme, direct.host, direct.port);
    if (!set) return { ok: false, error: 'تنظیم پروکسی ناموفق بود.' };
  } else {
    // دستور اتصال از راه پیام‌رسانی بومی به اپ دسکتاپ می‌رود (nmhost):
    // میزبان نصب نشده = host_missing (راهنمای نصب)، اپ خاموش =
    // app_not_running. هرگز بدون پاسخ درست میزبان «متصل» نمی‌شویم.
    const nm = await self.Vpn5gNative.nativeConnect(server.uri);
    if (!nm.ok) {
      if (nm.error === 'host_missing') {
        return { ok: false, error: 'افزونه به اپ ویندوز وصل نیست؛ اول نسخه‌ی ویندوز را با نصب‌کننده نصب کنید.', needHelper: true, hostMissing: true };
      }
      if (nm.error === 'app_not_running') {
        return { ok: false, error: 'اپ دسکتاپ TAHA VPN 5G در حال اجرا نیست؛ اول آن را باز کنید.', needHelper: true };
      }
      if (nm.error === 'vip') {
        return { ok: false, error: 'این سرور مخصوص مشترکین است؛ از بخش ویژه اشتراک تهیه کنید.' };
      }
      return { ok: false, error: nm.message || 'ارتباط با اپ دسکتاپ برقرار نشد.', needHelper: true };
    }
    const set = await self.Vpn5gProxy.setProxyFixed('socks5', C.HELPER_HOST, C.HELPER_SOCKS_PORT);
    if (!set) return { ok: false, error: 'تنظیم پروکسی ناموفق بود.' };
  }

  // تأیید واقعی: آی‌پی خروجی باید عوض شده باشد.
  const exitIp = await self.Vpn5gProxy.fetchExitIp();
  if (exitIp && baseline && exitIp === baseline) {
    await self.Vpn5gProxy.clearProxy();
    return { ok: false, error: 'تونل تأیید نشد؛ آی‌پی خروجی تغییر نکرد.' };
  }
  const verified = !!(exitIp && (!baseline || exitIp !== baseline));
  await store.set({
    connected: true, connectedServerId: server.id,
    connectCount: (state.connectCount || 0) + 1,
    baselineIp: baseline, exitIp: exitIp || null, verified: verified,
    pendingConnect: null
  });
  return { ok: true, verified: verified, server: server, message: verified ? 'متصل شدید.' : 'متصل شدید؛ تأیید آی‌پی ممکن نشد.' };
}

async function doDisconnect() {
  // قطع در اپ دسکتاپ هم انجام می‌شود (بهترین تلاش — اگر میزبان نباشد،
  // فقط پروکسی مرورگر پاک می‌شود و خطایی نشان داده نمی‌شود).
  try { await self.Vpn5gNative.nativeDisconnect(); } catch (e) { /* بهترین تلاش */ }
  await self.Vpn5gProxy.clearProxy();
  await store.set({ connected: false, connectedServerId: null, exitIp: null, verified: false, pendingConnect: null });
  return { ok: true };
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create('vpn5g-sync', { periodInMinutes: C.SYNC_INTERVAL_MINUTES });
  if (details.reason === 'install') {
    store.set({ connectCount: 0, connected: false, settings: {} });
    doSync();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  // نشست مرورگر تازه است؛ شمارنده‌ی تبلیغ و وضعیت اتصال از اول شروع می‌شود.
  await self.Vpn5gProxy.clearProxy();
  await store.set({ connected: false, connectedServerId: null, connectCount: 0, pendingConnect: null });
  doSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'vpn5g-sync') doSync();
});

/* اگر زبانه‌ی تبلیغ پیش از پایان بسته شود، مشاهده ناقص است و
 * اتصال معلق لغو می‌شود — اتصال بدون دیدن کامل تبلیغ شروع نمی‌شود. */
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const state = await getState();
  if (!state.pendingConnect) return;
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('pages/interstitial.html') });
  if (tabs.length === 0) {
    await store.set({ pendingConnect: null });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const state = await getState();
    switch (msg && msg.type) {
      case 'getState': {
        const tier = currentTier(state);
        sendResponse({
          ok: true, state: Object.assign({}, state, {
            tier: tier,
            allowedServers: allowedServers(state),
            announcement: self.Vpn5gAds.getAnnouncement(state.remoteConfig),
            adConfig: self.Vpn5gAds.getAdConfig(state.remoteConfig),
            groups: self.Vpn5gConfig.groupByCountry(allowedServers(state))
          })
        });
        break;
      }
      case 'refresh': {
        const r = await doSync();
        sendResponse(r);
        break;
      }
      case 'connect': {
        sendResponse(await doConnect(state));
        break;
      }
      case 'ad-complete': {
        // تبلیغ کامل دیده شد؛ اتصال معلق را ادامه بده.
        const pending = state.pendingConnect;
        if (!pending) { sendResponse({ ok: false, error: 'اتصالی در انتظار نیست.' }); break; }
        const server = (state.servers || []).find((s) => s.id === pending.serverId) || pickServer(state);
        if (!server) { sendResponse({ ok: false, error: 'سرور پیدا نشد.' }); break; }
        const st2 = await getState();
        sendResponse(await finishConnect(server, st2));
        break;
      }
      case 'ad-aborted': {
        await store.set({ pendingConnect: null });
        sendResponse({ ok: true });
        break;
      }
      case 'disconnect': {
        sendResponse(await doDisconnect());
        break;
      }
      case 'desktopStatus': {
        // وضعیت زنده‌ی اپ دسکتاپ از راه پیام‌رسانی بومی: اتصال، سرعت،
        // اشتراک و حجم. میزبان نباشد = host_missing (راهنمای نصب).
        sendResponse(await self.Vpn5gNative.nativeStatus());
        break;
      }
      case 'selectServer': {
        await store.set({ selectedServerId: msg.serverId || null });
        sendResponse({ ok: true });
        break;
      }
      case 'signup': {
        try {
          const r = await self.Vpn5gSupabase.signup(msg.email, msg.password);
          if (r.ok) {
            await store.set({ session: r.session });
            try { await self.Vpn5gSupabase.setOwnUserId(r.session); } catch (e) { /* بهترین تلاش */ }
            const sub = await self.Vpn5gSupabase.fetchSubscription(r.session);
            if (sub) await store.set({ subscription: sub });
          }
          sendResponse(r);
        } catch (e) {
          sendResponse({ ok: false, error: 'خطای شبکه؛ اتصال اینترنت را بررسی کنید.' });
        }
        break;
      }
      case 'login': {
        try {
          const r = await self.Vpn5gSupabase.login(msg.email, msg.password);
          if (r.ok) {
            await store.set({ session: r.session });
            try { await self.Vpn5gSupabase.setOwnUserId(r.session); } catch (e) { /* بهترین تلاش */ }
            const sub = await self.Vpn5gSupabase.fetchSubscription(r.session);
            if (sub) await store.set({ subscription: sub });
          }
          sendResponse(r);
        } catch (e) {
          sendResponse({ ok: false, error: 'خطای شبکه؛ اتصال اینترنت را بررسی کنید.' });
        }
        break;
      }
      case 'logout': {
        await store.set({ session: null, subscription: null, gift: null });
        await doDisconnect();
        sendResponse({ ok: true });
        break;
      }
      case 'recover': {
        try {
          sendResponse(await self.Vpn5gSupabase.recover(msg.email));
        } catch (e) {
          sendResponse({ ok: false, error: 'خطای شبکه؛ اتصال اینترنت را بررسی کنید.' });
        }
        break;
      }
      case 'redeem': {
        sendResponse(await redeemCode(msg.code, msg.kind, state));
        break;
      }
      case 'dismissAnnouncement': {
        await store.set({ dismissedAnnouncementId: msg.id || null });
        sendResponse({ ok: true });
        break;
      }
      case 'recordAdClick': {
        await self.Vpn5gAds.recordAdClick(msg.adId, state.session);
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'درخواست ناشناخته.' });
    }
  })();
  return true; // پاسخ ناهمگام
});
