import { useEffect, useRef, useState } from 'react';

// Real signals (fonts ready, first frame drawn) blended with a small minimum
// display time so the loader reads as intentional rather than a flash/glitch.
// Ported from the vanilla build's bootSequence().
export default function Loader({ onDone }) {
  const [progress, setProgress] = useState(0);
  const [hidden, setHidden] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const loadStart = performance.now();

    async function bootSequence() {
      setProgress(15);

      await (document.fonts ? document.fonts.ready.catch(() => {}) : Promise.resolve());
      setProgress(55);

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      setProgress(85);

      const elapsed = performance.now() - loadStart;
      const MIN_DISPLAY_MS = 600;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, MIN_DISPLAY_MS - elapsed)));
      setProgress(100);

      setTimeout(() => {
        setHidden(true);
        onDone?.();
      }, 200);
    }
    bootSequence();
  }, [onDone]);

  return (
    <div id="loader" className={hidden ? 'hidden' : ''}>
      <div className="loader-name">Ifedayo's Projects</div>
      <div className="loader-bar-wrap">
        <div className="loader-bar" style={{ width: `${progress}%` }} />
      </div>
      <div className="loader-label">LOADING {Math.floor(progress)}%</div>
    </div>
  );
}
