import { useRef, useState, useEffect, useCallback } from "react";

const HOLD_MS = 2000;
const CIRC = 754; 


export default function HoldButton({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [pressing, setPressing] = useState(false);
  const raf = useRef(null);
  const t0 = useRef(0);

  const cancel = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setPressing(false);
    setProgress(0);
  }, []);

  const tick = useCallback((now) => {
    const f = Math.min(1, (now - t0.current) / HOLD_MS);
    setProgress(f);
    if (f >= 1) {
      raf.current = null;
      setPressing(false);
      setProgress(0);
      if (navigator.vibrate) navigator.vibrate(200);
      onComplete();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }, [onComplete]);

  const start = useCallback(() => {
    if (raf.current) return;
    setPressing(true);
    t0.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => cancel, [cancel]);

  return (
    <button
      className={"hold" + (pressing ? " pressing" : "")}
      aria-label="Hold for 2 seconds to send an emergency alert"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); start(); }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") cancel(); }}
      onBlur={cancel}
    >
      <svg viewBox="0 0 264 264" aria-hidden="true">
        <circle className="track" cx="132" cy="132" r="120" />
        <circle className="prog" cx="132" cy="132" r="120" style={{ strokeDashoffset: CIRC * (1 - progress) }} />
      </svg>
      <span className="core">
        <b>SOS</b>
        <small>Hold to send</small>
      </span>
    </button>
  );
}
