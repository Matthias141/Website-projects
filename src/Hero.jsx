import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useScroll } from '@react-three/drei';

// Same name/tagline as this codebase's original static hero (ui/UIOverlay.jsx,
// pre-Stage-1) — reused rather than inventing new placeholder copy.
const HEADING_LINE1 = 'Creative Technologist';
const HEADING_LINE2 = 'Systems Engineer';
const TAGLINE = 'Building interactive systems, generative experiences, and low-level tools from Umuahia, Nigeria.';

function StaggeredWords({ text, revealed, delayStart, delayStep }) {
  const words = text.split(' ');
  return words.map((w, i) => (
    <span
      key={i}
      className={`kinetic-word${revealed ? ' revealed' : ''}`}
      style={{ transitionDelay: `${delayStart + i * delayStep}ms` }}
    >
      {w}&nbsp;
    </span>
  ));
}

/**
 * Mounted via <Scroll html> inside <ScrollControls> (App.jsx) — a
 * descendant of the R3F Canvas context, so useFrame/useScroll both work
 * here even though this renders plain DOM, not three.js objects.
 *
 * Two independent motion sources, combined by multiplying opacity:
 * 1. Kinetic reveal on mount — CSS-driven, staggered per word.
 * 2. Scroll-driven fade/lift — this component reads useScroll().offset
 *    every frame and writes directly to the DOM node's style (bypassing
 *    React state/re-renders for a 60fps-safe hot path, same reasoning
 *    Sculpture.jsx uses for mutating object3D transforms in useFrame
 *    instead of setState).
 *
 * `heroFaded` (from App.jsx, true while the user is actively dragging to
 * orbit) is preserved from the pre-Stage-1 static hero and folded in as
 * a third multiplier, so that existing behavior isn't silently dropped.
 */
export default function Hero({ prefersReducedMotion = false, heroFaded = false }) {
  const rootRef = useRef();
  const scroll = useScroll();
  const [revealed, setRevealed] = useState(prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion) return; // already revealed=true, nothing to animate
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [prefersReducedMotion]);

  useFrame(() => {
    const el = rootRef.current;
    if (!el) return;

    if (prefersReducedMotion) {
      el.style.opacity = heroFaded ? '0' : '1';
      el.style.transform = 'translateY(0px)';
      return;
    }

    // Fades + lifts out over the first page of scroll, rather than the
    // hero just vanishing at some threshold.
    const progress = scroll.range(0, 1 / scroll.pages);
    const opacity = (1 - progress) * (heroFaded ? 0.25 : 1);
    const lift = progress * -60;
    el.style.opacity = String(opacity);
    el.style.transform = `translateY(${lift}px)`;
  });

  return (
    <div ref={rootRef} className="kinetic-hero">
      <h1>
        <StaggeredWords text={HEADING_LINE1} revealed={revealed} delayStart={0} delayStep={60} />
        <br />
        <StaggeredWords text={HEADING_LINE2} revealed={revealed} delayStart={HEADING_LINE1.split(' ').length * 60} delayStep={60} />
      </h1>
      <p>
        <StaggeredWords
          text={TAGLINE}
          revealed={revealed}
          delayStart={(HEADING_LINE1.split(' ').length + HEADING_LINE2.split(' ').length) * 60 + 100}
          delayStep={30}
        />
      </p>
    </div>
  );
}
