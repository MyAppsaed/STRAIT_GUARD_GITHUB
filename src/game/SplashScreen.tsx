import { useEffect, useState } from "react";
import splashUrl from "@/assets/straitguard-splash.jpg";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 2600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setTimeout(onDone, 250);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden">
      <img
        src={splashUrl}
        alt="StraitGuard"
        className="absolute inset-0 w-full h-full object-cover animate-[splashZoom_3s_ease-out_forwards]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/80" />

      <div className="absolute bottom-[8%] left-0 right-0 flex flex-col items-center gap-3 px-8">
        <div className="w-[min(80vw,420px)] h-2 bg-black/60 border border-cyan-400/40 overflow-hidden rounded-sm shadow-[0_0_18px_rgba(80,200,255,.4)]">
          <div
            className="h-full transition-[width] duration-100 ease-out"
            style={{
              width: `${progress * 100}%`,
              background: "linear-gradient(90deg,#7fd9ff 0%,#1f7aa3 60%,#ffb648 100%)",
              boxShadow: "0 0 12px rgba(80,200,255,.7)",
            }}
          />
        </div>
        <div className="text-cyan-200/90 tracking-[0.4em] text-[10px] font-bold font-mono uppercase animate-pulse">
          Loading · {String(Math.floor(progress * 100)).padStart(3, "0")}%
        </div>
      </div>

      <style>{`
        @keyframes splashZoom {
          0% { transform: scale(1.08); filter: brightness(0.6); }
          100% { transform: scale(1); filter: brightness(1); }
        }
      `}</style>
    </div>
  );
}
