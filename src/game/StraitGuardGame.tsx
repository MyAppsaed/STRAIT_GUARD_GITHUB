import { useEffect, useMemo, useRef, useState } from "react";
import { GameManager, LEVELS } from "./straitguard";
import { audio } from "./audio";
import logoUrl from "@/assets/straitguard-logo.png";
import { render } from "./Renderer";
import { getHighScore, submitScore } from "./highscore";
import { AdManager } from "@/ads/AdManager";
import { setHapticsEnabled } from "./haptics";
import SplashScreen from "./SplashScreen";
import { creditScore, loadUpgrades, nextCost, purchase, UPGRADES, UpgradeKey, UpgradeState } from "./upgrades";




type Screen = "menu" | "levels" | "play" | "pause" | "win" | "lose" | "privacy" | "contact" | "about" | "shop";
type Lang = "en" | "ar";

const APP_VERSION = "1.0.0";
const SUPPORT_EMAIL = "budapest2015@gmail.com";
const COPYRIGHT_YEAR = "2026";

const I18N: Record<Lang, Record<string, string>> = {
  en: {
    tagline: "ESCORT · DEFEND · DELIVER",
    start: "▶ START MISSION",
    selectMission: "SELECT LEVEL",
    mission: "LEVEL",
    patrol: "EASY", blockade: "MEDIUM", gauntlet: "HARD",
    back: "◀ BACK", pause: "❚❚ PAUSE", paused: "PAUSED",
    resume: "▶ RESUME", restart: "↻ RESTART", menu: "⌂ MAIN MENU",
    complete: "SAFE ARRIVAL", failed: "MISSION FAILED",
    completeSub: "CARGO REACHED SAFE HARBOR · STRAIT SECURED",
    cargoLost: "Cargo ship destroyed", frigateLost: "Escort frigate sunk",
    playAgain: "▶ PLAY AGAIN", retry: "↻ RETRY",
    cargo: "CARGO", frigate: "FRIGATE", progress: "PROGRESS",
    lang: "العربية", sound: "SOUND", on: "ON", off: "OFF",
    score: "SCORE", best: "BEST", newBest: "NEW HIGH SCORE!", kills: "KILLS",
    bombs: "BOMBS", useBomb: "MEGA BOMB",
    congrats: "CONGRATULATIONS!", nextLevel: "▶ NEXT LEVEL",
    allCleared: "ALL LEVELS CLEARED · LEGENDARY COMMANDER",
    privacy: "PRIVACY POLICY", contact: "CONTACT US", about: "ABOUT GAME",
    testAd: "TEST AD",
    shop: "UPGRADES", points: "POINTS", buy: "UPGRADE", maxed: "MAX", cost: "COST",
    tier: "TIER", earned: "+{n} POINTS EARNED",
    upgFrigateSpeed: "FRIGATE SPEED", upgCargoArmor: "CARGO ARMOR", upgBombCapacity: "MEGA-BOMB CAPACITY",
    tripleActive: "TRIPLE SHOT",
    privacyBody: [
      "STRAIT-GUARD is a fully offline single-player game. It does not require registration or a user account, and does not directly collect any personal information from you.",
      "The game displays advertisements provided by Google AdMob. To serve ads, Google may collect limited advertising data (such as device identifier, approximate location, and app usage) in accordance with Google's own Privacy Policy.",
      "No gameplay data is uploaded to our servers. High scores and settings are stored only on your device.",
      "For any privacy-related questions, please contact us at the email listed on the Contact Us page.",
    ].join("\n\n"),
    contactBody: "For support, feedback, or bug reports, please reach out to us by email. We reply as soon as possible.",
    contactEmailLabel: "Support Email",
    aboutName: "Game Name",
    aboutVersion: "Version",
    aboutCopyright: "Copyright",
    aboutDesc: "Description",
    aboutDescBody: "STRAIT-GUARD is a 2D top-down naval defense game. Escort a cargo ship safely through a dangerous strait while defending it from enemy attacks across three progressively harder levels.",
    copyrightText: `© ${COPYRIGHT_YEAR} ClickTech. All rights reserved.`,
  },

  ar: {
    tagline: "مرافقة · دفاع · توصيل",
    start: "▶ بدء المهمة",
    selectMission: "اختر المستوى",
    mission: "مستوى",
    patrol: "سهل", blockade: "متوسط", gauntlet: "صعب",
    back: "◀ رجوع", pause: "❚❚ إيقاف", paused: "متوقف",
    resume: "▶ استئناف", restart: "↻ إعادة", menu: "⌂ القائمة",
    complete: "وصول آمن", failed: "فشلت المهمة",
    completeSub: "وصلت الشحنة إلى الميناء الآمن · المضيق مؤمَّن",
    cargoLost: "تم تدمير سفينة الشحن", frigateLost: "أُغرقت الفرقاطة",
    playAgain: "▶ العب مجددًا", retry: "↻ أعد المحاولة",
    cargo: "الشحنة", frigate: "الفرقاطة", progress: "التقدم",
    lang: "English", sound: "الصوت", on: "تشغيل", off: "إيقاف",
    score: "النقاط", best: "الأفضل", newBest: "رقم قياسي جديد!", kills: "القتلى",
    bombs: "قنابل", useBomb: "قنبلة كبرى",
    congrats: "مبروك!", nextLevel: "▶ المستوى التالي",
    allCleared: "تم إنهاء جميع المستويات · قائد أسطوري",
    privacy: "سياسة الخصوصية", contact: "اتصل بنا", about: "عن اللعبة",
    testAd: "اختبار الإعلان",
    shop: "الترقيات", points: "النقاط", buy: "ترقية", maxed: "أقصى", cost: "التكلفة",
    tier: "المستوى", earned: "+{n} نقطة مكتسبة",
    upgFrigateSpeed: "سرعة الفرقاطة", upgCargoArmor: "درع الشحنة", upgBombCapacity: "سعة القنابل",
    tripleActive: "طلقة ثلاثية",
    privacyBody: [
      "لعبة حارس المضيق تعمل بالكامل دون اتصال بالإنترنت وبلاعب واحد. لا تتطلب اللعبة تسجيل حساب ولا تجمع أي معلومات شخصية منك بشكل مباشر.",
      "تعرض اللعبة إعلانات مقدَّمة من Google AdMob. لعرض هذه الإعلانات قد تجمع Google بيانات إعلانية محدودة (مثل معرّف الجهاز والموقع التقريبي واستخدام التطبيق) وفقاً لسياسة الخصوصية الخاصة بها.",
      "لا يتم رفع بيانات اللعب إلى خوادمنا. يتم حفظ الأرقام القياسية والإعدادات على جهازك فقط.",
      "لأي استفسار يتعلق بالخصوصية، يرجى التواصل معنا عبر البريد الإلكتروني المذكور في صفحة اتصل بنا.",
    ].join("\n\n"),
    contactBody: "للدعم أو الملاحظات أو الإبلاغ عن الأخطاء، يرجى مراسلتنا عبر البريد الإلكتروني وسنرد في أقرب وقت ممكن.",
    contactEmailLabel: "بريد الدعم",
    aboutName: "اسم اللعبة",
    aboutVersion: "الإصدار",
    aboutCopyright: "حقوق النشر",
    aboutDesc: "الوصف",
    aboutDescBody: "حارس المضيق لعبة دفاع بحري ثنائية الأبعاد بمنظور علوي. رافق سفينة شحن عبر مضيق خطر وادفع عنها هجمات الأعداء عبر ثلاثة مستويات متصاعدة الصعوبة.",
    copyrightText: `© ${COPYRIGHT_YEAR} كليك تك. جميع الحقوق محفوظة.`,
  },

};


export default function StraitGuardGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<GameManager | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const [screen, setScreen] = useState<Screen>("menu");
  const [loading, setLoading] = useState(true);

  const [lang, setLang] = useState<Lang>("ar");
  const [muted, setMuted] = useState(false);
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [, force] = useState(0);
  const [endResult, setEndResult] = useState<{ score: number; best: number; isNew: boolean; kills: number; earned: number } | null>(null);
  const [upgrades, setUpgrades] = useState<UpgradeState>(() => loadUpgrades());
  const t = I18N[lang];

  const highScores = useMemo(() => ({
    1: getHighScore(1), 2: getHighScore(2), 3: getHighScore(3),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [endResult, screen]);

  // Initialize AdMob (native only; safe no-op on web).
  useEffect(() => { AdManager.initialize(); }, []);

  useEffect(() => {
    const cap = (window as any).Capacitor;
    setIsNativeApp(Boolean(cap?.isNativePlatform?.()));
  }, []);

  useEffect(() => {
    audio.setMuted(muted);
    setHapticsEnabled(!muted);
  }, [muted]);



  // music per screen
  useEffect(() => {
    if (muted) { audio.stopMusic(); return; }
    if (screen === "menu" || screen === "levels") audio.startMusic("menu");
    else if (screen === "play") audio.startMusic("play");
    else if (screen === "pause") audio.stopMusic();
  }, [screen, muted]);

  const click = (fn: () => void) => () => { audio.resume(); audio.play("click"); fn(); };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (gameRef.current) gameRef.current.resize(rect.width, rect.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastRef.current) / 1000 || 0);
      lastRef.current = ts;
      const g = gameRef.current;
      if (g) {
        g.update(dt);
        render(ctx, g);
        if (g.status === "win" || g.status === "lose") {
          const res = submitScore(g.level, g.score);
          const state = creditScore(g.score);
          setUpgrades(state);
          const earned = Math.max(0, Math.floor(g.score / 10));
          setEndResult({ score: g.score, best: res.best, isNew: res.isNew, kills: g.kills, earned });
          setScreen(g.status);
          AdManager.hideBanner();
          AdManager.showInterstitial();
          gameRef.current = null;
        } else {
          force((n) => (n + 1) % 1000);
        }
      } else {
        ctx.fillStyle = "#0b3a5b";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);


    const getPos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      const g = gameRef.current;
      if (!g || g.status !== "playing") return;
      canvas.setPointerCapture(e.pointerId);
      g.player.setTarget(getPos(e));
    };
    const onMove = (e: PointerEvent) => {
      const g = gameRef.current;
      if (!g || g.status !== "playing") return;
      if (e.buttons === 0 && e.pointerType === "mouse") return;
      g.player.setTarget(getPos(e));
    };
    const onUp = () => { gameRef.current?.player.setTarget(null); };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const lastLevelRef = useRef<1 | 2 | 3>(1);
  const startLevel = (lvl: 1 | 2 | 3) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const g = new GameManager({ width: rect.width, height: rect.height, level: lvl });
    g.start(lvl);
    gameRef.current = g;
    lastLevelRef.current = lvl;
    setEndResult(null);
    setScreen("play");
    AdManager.showBanner();
  };
  const pause = () => { gameRef.current?.pause(); setScreen("pause"); };
  const resume = () => { gameRef.current?.resume(); setScreen("play"); };
  const restart = () => { startLevel(lastLevelRef.current); };
  const toMenu = () => { gameRef.current = null; setScreen("menu"); AdManager.hideBanner(); };



  const g = gameRef.current;
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <div dir={dir} className="relative w-full h-[100svh] bg-slate-900 overflow-hidden select-none touch-none">
      {loading && <SplashScreen onDone={() => setLoading(false)} />}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {screen !== "play" && (
        <div className="absolute top-2 right-2 z-20 pointer-events-auto" dir="ltr">
          <button
            type="button"
            data-language-toggle
            aria-label="Switch language"
            onClick={click(() => setLang(lang === "en" ? "ar" : "en"))}
            className="btn-language"
          >
            {lang === "en" ? "EN / AR" : "AR / EN"}
          </button>
        </div>
      )}

      {screen === "play" && g && (
        <div className="absolute top-0 left-0 right-0 p-2 sm:p-3 flex items-start justify-between gap-2 pointer-events-none">
          <div className="space-y-1.5 pointer-events-auto sg-panel px-2 sm:px-3 py-1.5 sm:py-2 max-w-[60vw]">
            <HpBar label={t.cargo} value={g.cargo.hp / g.cargo.maxHp} />
            <HpBar label={t.frigate} value={g.player.hp / g.player.maxHp} />
            <div className="flex justify-between gap-3 text-[9px] sm:text-[10px] tracking-[0.2em] text-cyan-200/80 font-mono">
              <span>{t.progress} · {String(Math.floor(g.progress() * 100)).padStart(3, "0")}%</span>
              <span className="text-amber-200">{t.score} {String(g.score).padStart(5, "0")}</span>
            </div>
            <div className="text-[8px] sm:text-[9px] tracking-[0.2em] text-cyan-300/60 font-mono">
              {t.best} {String(highScores[g.level as 1 | 2 | 3]).padStart(5, "0")}
            </div>
          </div>
          <button onClick={click(pause)} className="pointer-events-auto btn-ghost shrink-0 !px-3 !py-2 text-[10px] sm:text-xs">{t.pause}</button>
        </div>
      )}

      {screen === "play" && g && (
        <div className="absolute bottom-4 z-20 pointer-events-none flex flex-col items-end gap-2"
          style={{ [dir === "rtl" ? "left" : "right"]: "1rem" } as React.CSSProperties}>
          {g.player.tripleTimer > 0 && (
            <div className="sg-panel px-2 py-1 text-[10px] tracking-[0.2em] font-mono text-emerald-200">
              🔫 {t.tripleActive} · {g.player.tripleTimer.toFixed(1)}s
            </div>
          )}
          <button
            type="button"
            aria-label={t.useBomb}
            disabled={g.bombs <= 0}
            onClick={() => { audio.resume(); if (g.useBomb()) force((n) => (n + 1) % 1000); }}
            className="pointer-events-auto btn-bomb"
          >
            <span className="btn-bomb-icon">💣</span>
            <span className="btn-bomb-count">{g.bombs}/{g.maxBombs}</span>
            <span className="btn-bomb-label">{t.useBomb}</span>
          </button>
        </div>
      )}


      {screen === "menu" && (
        <Overlay>
          <img src={logoUrl} alt="StraitGuard"
            className="w-[min(90vw,520px)] rounded-2xl shadow-2xl ring-1 ring-cyan-400/30" />
          <p className="sg-tagline">{t.tagline}</p>
          <button onClick={click(() => setScreen("levels"))} className="btn-primary">{t.start}</button>
          <div className="flex gap-2 mt-2 flex-wrap justify-center">
            <button onClick={click(() => setMuted(!muted))} className="btn-ghost">
              {muted ? "🔇" : "🔊"} {t.sound}: {muted ? t.off : t.on}
            </button>
          </div>
          <div className="flex gap-2 mt-1 flex-wrap justify-center">
            <button onClick={click(() => setScreen("shop"))} className="btn-ghost">🛠 {t.shop} · {upgrades.points}★</button>
            <button onClick={click(() => setScreen("about"))} className="btn-ghost">{t.about}</button>
            <button onClick={click(() => setScreen("privacy"))} className="btn-ghost">{t.privacy}</button>
            <button onClick={click(() => setScreen("contact"))} className="btn-ghost">{t.contact}</button>
          </div>
        </Overlay>
      )}

      {screen === "levels" && (
        <Overlay>
          <SgTitle>{t.selectMission}</SgTitle>
          <div className="flex gap-3 flex-wrap justify-center">
            {[1, 2, 3].map((lvl) => (
              <button key={lvl} onClick={click(() => startLevel(lvl as 1 | 2 | 3))} className="btn-primary min-w-[150px]">
                <span className="block text-lg font-black tracking-wider">
                  {t.mission} 0{lvl}
                </span>
                <span className="block text-[10px] tracking-[0.25em] opacity-80 mt-0.5">
                  {lvl === 1 ? t.patrol : lvl === 2 ? t.blockade : t.gauntlet}
                </span>
                <span className="block text-[9px] tracking-[0.2em] mt-1 opacity-70 font-mono">
                  {t.best} {String(highScores[lvl as 1 | 2 | 3]).padStart(5, "0")}
                </span>
              </button>
            ))}

          </div>
          <button onClick={click(toMenu)} className="btn-ghost">{t.back}</button>
        </Overlay>
      )}

      {screen === "privacy" && (
        <Overlay>
          <SgTitle accent="cyan">{t.privacy}</SgTitle>
          <InfoPanel lang={lang}>
            {t.privacyBody.split("\n\n").map((p, i) => (
              <p key={i} className="mb-3 last:mb-0 leading-relaxed">{p}</p>
            ))}
          </InfoPanel>
          <button onClick={click(toMenu)} className="btn-ghost">{t.back}</button>
        </Overlay>
      )}

      {screen === "contact" && (
        <Overlay>
          <SgTitle accent="cyan">{t.contact}</SgTitle>
          <InfoPanel lang={lang}>
            <p className="mb-4 leading-relaxed">{t.contactBody}</p>
            <div className="flex flex-col gap-1" dir="ltr">
              <span className="text-[10px] tracking-[0.25em] text-cyan-200/70 font-bold uppercase">{t.contactEmailLabel}</span>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-200 font-mono text-base underline break-all">{SUPPORT_EMAIL}</a>
            </div>
          </InfoPanel>
          <button onClick={click(toMenu)} className="btn-ghost">{t.back}</button>
        </Overlay>
      )}

      {screen === "about" && (
        <Overlay>
          <SgTitle accent="cyan">{t.about}</SgTitle>
          <InfoPanel lang={lang}>
            <AboutRow label={t.aboutName} value="STRAIT-GUARD | حارس المضيق" />
            <AboutRow label={t.aboutVersion} value={APP_VERSION} />
            <AboutRow label={t.aboutCopyright} value={t.copyrightText} />
            <div className="mt-3 pt-3 border-t border-cyan-400/20">
              <div className="text-[10px] tracking-[0.25em] text-cyan-200/70 font-bold uppercase mb-1">{t.aboutDesc}</div>
              <p className="leading-relaxed">{t.aboutDescBody}</p>
            </div>
          </InfoPanel>
          <button onClick={click(toMenu)} className="btn-ghost">{t.back}</button>
        </Overlay>
      )}

      {screen === "shop" && (
        <Overlay>
          <SgTitle accent="cyan">{t.shop}</SgTitle>
          <div className="sg-panel px-4 py-2 text-amber-200 tracking-[0.25em] text-sm font-mono">
            ★ {t.points}: {upgrades.points}
          </div>
          <div className="flex flex-col gap-2 w-[min(92vw,420px)]">
            {(Object.keys(UPGRADES) as UpgradeKey[]).map((k) => {
              const def = UPGRADES[k];
              const tier = upgrades.tiers[k];
              const cost = nextCost(k, upgrades);
              const label = k === "frigateSpeed" ? t.upgFrigateSpeed : k === "cargoArmor" ? t.upgCargoArmor : t.upgBombCapacity;
              const cur = def.values[tier];
              const nxt = tier < def.maxTier ? def.values[tier + 1] : null;
              const canBuy = cost !== null && upgrades.points >= cost;
              return (
                <div key={k} className="sg-panel px-3 py-2 flex flex-col gap-1" dir="ltr">
                  <div className="flex justify-between items-baseline">
                    <span className="text-cyan-100 text-xs tracking-[0.2em] font-bold">{label}</span>
                    <span className="text-cyan-200/70 text-[10px] tracking-[0.2em]">{t.tier} {tier}/{def.maxTier}</span>
                  </div>
                  <div className="flex justify-between items-baseline text-[11px] font-mono">
                    <span className="text-cyan-50">{cur}{nxt !== null ? ` → ${nxt}` : ""}</span>
                    <span className="text-amber-200">{cost === null ? t.maxed : `${t.cost} ${cost}★`}</span>
                  </div>
                  <button
                    onClick={click(() => {
                      const r = purchase(k);
                      if (r.ok) { setUpgrades(r.state); audio.play("win"); }
                    })}
                    disabled={!canBuy}
                    className="btn-primary !py-2 !text-xs mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cost === null ? t.maxed : t.buy}
                  </button>
                </div>
              );
            })}
          </div>
          <button onClick={click(toMenu)} className="btn-ghost">{t.back}</button>
        </Overlay>
      )}






      {screen === "pause" && (
        <Overlay>
          <SgTitle>{t.paused}</SgTitle>
          <button onClick={click(resume)} className="btn-primary">{t.resume}</button>
          <button onClick={click(restart)} className="btn-ghost">{t.restart}</button>
          <button onClick={click(toMenu)} className="btn-ghost">{t.menu}</button>
        </Overlay>
      )}

      {screen === "win" && (
        <Overlay>
          <SgTitle accent="cyan">{t.complete}</SgTitle>
          <p className="text-amber-300 tracking-[0.3em] text-lg font-black animate-pulse">🎉 {t.congrats} 🎉</p>
          <p className="text-cyan-100/80 tracking-wider text-sm">{t.completeSub}</p>
          {endResult && <ScorePanel t={t} result={endResult} />}
          {lastLevelRef.current < 3 ? (
            <button
              onClick={click(() => startLevel((lastLevelRef.current + 1) as 1 | 2 | 3))}
              className="btn-primary"
            >
              {t.nextLevel} · {t.mission} 0{lastLevelRef.current + 1}
            </button>
          ) : (
            <p className="text-amber-200 tracking-[0.25em] text-xs font-bold uppercase">{t.allCleared}</p>
          )}
          <button onClick={click(restart)} className="btn-ghost">{t.playAgain}</button>
          <button onClick={click(toMenu)} className="btn-ghost">{t.menu}</button>
        </Overlay>
      )}


      {screen === "lose" && (
        <Overlay>
          <SgTitle accent="red">{t.failed}</SgTitle>
          <p className="text-red-200/80 tracking-wider text-sm uppercase">
            {endResult && endResult.score === 0 ? t.cargoLost : t.frigateLost}
          </p>
          {endResult && <ScorePanel t={t} result={endResult} />}
          <button onClick={click(restart)} className="btn-primary">{t.retry}</button>
          <button onClick={click(toMenu)} className="btn-ghost">{t.menu}</button>
        </Overlay>
      )}


      <style>{`
        .btn-primary {
          background: linear-gradient(180deg,#0a2540 0%,#0b2e56 45%,#061a30 55%,#0a2540 100%);
          color:#FDE68A; font-weight:900; padding:12px 26px; border-radius:4px;
          letter-spacing:.18em; font-size:13px;
          border:1px solid rgba(120,220,255,.55);
          box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 0 14px rgba(80,200,255,.35),
            inset 0 1px 0 rgba(120,180,220,.35), inset 0 -2px 0 rgba(0,0,0,.35);
          clip-path: polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);
          text-shadow:0 1px 2px rgba(0,0,0,.6);
          transition:transform .1s, filter .15s;
        }
        .btn-primary:hover{ transform: translateY(-1px); filter:brightness(1.15); }
        .btn-primary:active{ transform: translateY(1px); }
        .btn-ghost {
          color:#FDE68A; padding:10px 22px; border-radius:4px;
          background: linear-gradient(180deg, #0a2540 0%, #061a30 100%);
          border:1px solid rgba(120,220,255,.35);
          letter-spacing:.18em; font-size:12px; font-weight:700;
          box-shadow: inset 0 0 12px rgba(80,200,255,.12), 0 0 8px rgba(0,0,0,.4);
          clip-path: polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px);
          backdrop-filter: blur(6px);
        }
        .btn-ghost:hover{ border-color: rgba(120,220,255,.7); color:#FEF3C7; }
        .btn-language {
          color:#FDE68A;
          padding:6px 10px;
          border-radius:3px;
          background: linear-gradient(180deg,#0a2540 0%,#0b2e56 45%,#061a30 58%,#0a2540 100%);
          border:1px solid rgba(210,250,255,.6);
          letter-spacing:.05em;
          font-size:11px;
          font-weight:800;
          box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 0 14px rgba(80,200,255,.5), inset 0 1px 0 rgba(120,180,220,.35);
          clip-path: polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px);
          text-shadow:0 1px 2px rgba(0,0,0,.6);
          line-height:1;
        }
        .btn-language:hover{ filter:brightness(1.15); }
        @media (max-width: 520px) {
          .btn-language { font-size:9px; padding:5px 8px; letter-spacing:.03em; }
        }
        .sg-panel {
          background: linear-gradient(180deg, rgba(10,22,34,.78), rgba(6,14,22,.78));
          border:1px solid rgba(120,220,255,.28);
          box-shadow: inset 0 0 14px rgba(80,200,255,.1), 0 4px 18px rgba(0,0,0,.4);
          backdrop-filter: blur(8px);
          clip-path: polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);
        }
        .sg-tagline { color: #9fd8ff; letter-spacing:.45em; font-size:11px; font-weight:700;
          text-shadow: 0 0 12px rgba(80,200,255,.45); }
        [dir="rtl"] .sg-tagline { letter-spacing:.2em; }
        .btn-bomb {
          display:flex; flex-direction:column; align-items:center; justify-content:center;
          width:72px; height:72px; border-radius:50%;
          background: radial-gradient(circle at 30% 30%, #ffcf5e 0%, #ff6a1f 55%, #7a1a05 100%);
          border:2px solid rgba(255,220,140,.9);
          box-shadow: 0 0 22px rgba(255,140,40,.7), inset 0 0 12px rgba(0,0,0,.5);
          color:#fff; font-weight:900; text-shadow:0 1px 2px rgba(0,0,0,.7);
          transition: transform .1s, filter .15s;
        }
        .btn-bomb:hover:not(:disabled){ transform: scale(1.06); filter:brightness(1.1); }
        .btn-bomb:active:not(:disabled){ transform: scale(0.94); }
        .btn-bomb:disabled { filter: grayscale(0.7) brightness(0.55); opacity: .75; }
        .btn-bomb-icon { font-size: 22px; line-height:1; }
        .btn-bomb-count { font-size: 14px; line-height:1; margin-top:2px; font-family: ui-monospace, monospace; }
        .btn-bomb-label { font-size: 7px; letter-spacing:.15em; margin-top:2px; opacity:.9; }
      `}</style>

      <div className="sr-only">Levels available: {Object.keys(LEVELS).join(", ")}</div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-6
      bg-[radial-gradient(ellipse_at_center,rgba(8,20,32,.6),rgba(2,6,12,.92))] backdrop-blur-md">
      {children}
    </div>
  );
}

function ScorePanel({ t, result }: { t: Record<string, string>; result: { score: number; best: number; isNew: boolean; kills: number; earned: number } }) {
  return (
    <div className="sg-panel px-5 py-3 flex flex-col items-center gap-1 min-w-[240px]" dir="ltr">
      <div className="flex items-baseline gap-3">
        <span className="text-[10px] tracking-[0.25em] text-cyan-200/70 font-bold">{t.score}</span>
        <span className="text-3xl font-black font-mono text-amber-200 drop-shadow">{String(result.score).padStart(5, "0")}</span>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-[9px] tracking-[0.25em] text-cyan-200/60 font-bold">{t.best}</span>
        <span className="text-sm font-mono text-cyan-100">{String(result.best).padStart(5, "0")}</span>
        <span className="text-[9px] tracking-[0.25em] text-cyan-200/60 font-bold">· {t.kills}</span>
        <span className="text-sm font-mono text-cyan-100">{result.kills}</span>
      </div>
      {result.earned > 0 && (
        <div className="mt-1 text-[10px] tracking-[0.25em] font-bold text-emerald-300 font-mono">
          ★ {t.earned.replace("{n}", String(result.earned))} ★
        </div>
      )}
      {result.isNew && (
        <div className="mt-1 text-[10px] tracking-[0.3em] font-black text-amber-300 animate-pulse">★ {t.newBest} ★</div>
      )}
    </div>
  );
}


function SgTitle({ children, accent = "silver" }: { children: React.ReactNode; accent?: "silver" | "cyan" | "red" }) {
  const grad =
    accent === "cyan" ? "linear-gradient(180deg,#dffaff 0%,#7fd9ff 45%,#1f7aa3 55%,#bfeaff 100%)"
    : accent === "red" ? "linear-gradient(180deg,#ffd6d6 0%,#ff7878 45%,#8a1a1a 55%,#ffb8b8 100%)"
    : "linear-gradient(180deg,#f4f6fa 0%,#b9c0cc 45%,#5a6470 55%,#e0e5ec 100%)";
  return (
    <h2 className="text-3xl md:text-4xl font-black tracking-[0.2em] uppercase"
      style={{ backgroundImage: grad, WebkitBackgroundClip: "text", backgroundClip: "text",
        color: "transparent", textShadow: "0 0 24px rgba(80,200,255,.25)",
        filter: "drop-shadow(0 2px 0 rgba(0,0,0,.6))" }}>
      {children}
    </h2>
  );
}

function HpBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-32 sm:w-44 md:w-48">
      <div className="flex justify-between text-[9px] sm:text-[10px] tracking-[0.2em] text-cyan-100/80 mb-0.5 font-bold">
        <span className="truncate">{label}</span>
        <span className="font-mono opacity-70">{String(Math.floor(value * 100)).padStart(3, "0")}</span>
      </div>
      <div className="h-1.5 sm:h-2 w-full bg-black/70 overflow-hidden border border-cyan-400/30 shadow-[inset_0_0_6px_rgba(0,0,0,0.8)]">
        <div className="h-full transition-[width] duration-150"
          style={{ width: `${Math.max(0, value) * 100}%`,
            background: "linear-gradient(90deg,#ffb648 0%,#ff6a1f 60%,#ff2e2e 100%)",
            boxShadow: "0 0 8px rgba(255,140,40,.6)" }} />
      </div>
    </div>
  );
}

function InfoPanel({ children, lang }: { children: React.ReactNode; lang: Lang }) {
  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="sg-panel px-5 py-4 max-w-[min(92vw,560px)] max-h-[60vh] overflow-y-auto text-cyan-50/90 text-sm"
    >
      {children}
    </div>
  );
}

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col mb-2">
      <span className="text-[10px] tracking-[0.25em] text-cyan-200/70 font-bold uppercase">{label}</span>
      <span className="text-cyan-50 font-mono text-sm break-words">{value}</span>
    </div>
  );
}
