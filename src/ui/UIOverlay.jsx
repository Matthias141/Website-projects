import { useEffect, useRef, useState } from 'react';
import { MoonIcon, SunIcon, SoundOnIcon, SoundOffIcon, ChevronIcon } from './icons.jsx';

const NAV_LINKS = [
  { id: 'about', label: 'About' },
  { id: 'work', label: 'Work' },
  { id: 'skills', label: 'Skills' },
  { id: 'contact', label: 'Contact' },
];

const WORK_ITEMS = [
  {
    id: 'godform',
    title: 'Godform',
    meta: 'Interactive 3D Experience — 2026',
    open: true,
    body: (
      <>
        <p><strong>What it is —</strong> A living geometric organism built with Three.js: procedural motion, particle systems, and cinematic post-processing, rendered live in the browser on this page.</p>
        <p><strong>Stack —</strong> Three.js, React Three Fiber, WebGL, custom OrbitControls tuning, N8AO + Bloom post-processing.</p>
      </>
    ),
  },
  {
    id: 'foundry',
    title: 'Foundry',
    meta: 'Serverless CI/CD Pipeline on AWS — 2026',
    body: (
      <>
        <p><strong>Problem —</strong> Manual releases and configuration drift across dev, staging, and production, with long-lived AWS credentials sitting in the pipeline.</p>
        <p><strong>Approach —</strong> Version-controlled every AWS resource — Lambda, IAM roles, API Gateway — in Terraform as a single source of truth, and replaced static credentials with OIDC federation between GitHub Actions and AWS IAM: zero long-lived secrets in version control.</p>
        <p><strong>Stack —</strong> AWS Lambda, API Gateway, Terraform, GitHub Actions, Trivy, Bandit, pip-audit.</p>
        <p><strong>Outcome —</strong> 131 workflow runs across a 3-environment promotion gate with no manual releases; deployments protected by a 4-stage canary rollout (10%→25%→50%→100%) with automatic rollback on error, a 6-rule WAF policy, and 8 CloudWatch alarms with SNS alerting.</p>
        <p><a href="https://github.com/Matthias141/my-cicd-project" target="_blank" rel="noopener">→ github.com/Matthias141/my-cicd-project</a></p>
      </>
    ),
  },
  {
    id: 'abiaeats',
    title: 'AbiaEats',
    meta: 'Food Delivery Marketplace (Next.js) — 2026',
    body: (
      <>
        <p><strong>What it is —</strong> A food delivery marketplace built for Southeastern Nigeria, with infrastructure and security treated as first-class from day one rather than bolted on later.</p>
        <p><strong>Approach —</strong> A 7-stage CI security pipeline gates every pull request — Gitleaks secret scanning, Semgrep SAST, npm audit, TypeScript enforcement, ESLint, a build gate, and OWASP ZAP dynamic analysis against a live staging environment.</p>
        <p><strong>Stack —</strong> Next.js, Terraform, GitHub Actions, AWS S3 Object Lock.</p>
        <p><strong>Outcome —</strong> A tamper-resistant audit trail via S3 Object Lock in GOVERNANCE mode with AES-256 encryption, 90-day retention, and a least-privilege IAM policy scoped to PutObject only.</p>
      </>
    ),
  },
  {
    id: 'systems',
    title: 'Systems & Tooling',
    meta: 'Low-level C++ / Cryptography',
    body: (
      <>
        <p><strong>What it is —</strong> Production-grade implementations from first principles — hashing, concurrency, and memory systems built without relying on high-level abstractions.</p>
        <p><strong>Stack —</strong> C++, Rust, Go.</p>
      </>
    ),
  },
  {
    id: 'generative',
    title: 'Generative Experiments',
    meta: 'WebGL / Creative Coding',
    body: (
      <p><strong>What it is —</strong> An ongoing series of real-time visual systems exploring form, chaos, and structured randomness.</p>
    ),
  },
];

const SKILL_GROUPS = [
  {
    title: 'Cloud & DevOps',
    skills: ['AWS (Lambda, API Gateway, IAM)', 'Terraform', 'GitHub Actions / OIDC', 'Docker', 'Security Gating (Trivy, Semgrep, ZAP)', 'CloudWatch / X-Ray / SNS'],
  },
  {
    title: 'Creative & Systems',
    skills: ['C++ / Systems', 'Three.js / React Three Fiber', 'JavaScript / TypeScript', 'Cryptography', 'Concurrency', 'Generative Art', 'Rust / Go', 'Real-time Graphics'],
  },
];

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function Panel({ id, title, children, isOpen, onClose }) {
  const panelRef = useRef(null);
  const closeBtnRef = useRef(null);
  const lastFocusedRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      lastFocusedRef.current = document.activeElement;
      closeBtnRef.current?.focus();
    } else if (lastFocusedRef.current) {
      lastFocusedRef.current.focus?.();
      lastFocusedRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function trapFocus(e) {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [isOpen]);

  return (
    <div
      ref={panelRef}
      className={`panel${isOpen ? ' open' : ''}`}
      id={`panel-${id}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`panel-${id}-title`}
    >
      <button ref={closeBtnRef} className="close" onClick={onClose} aria-label="Close panel">×</button>
      <h2 id={`panel-${id}-title`}>{title}</h2>
      {children}
    </div>
  );
}

export default function UIOverlay({ darkMode, onToggleDark, soundOn, onToggleSound }) {
  const [activePanel, setActivePanel] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dragHintVisible, setDragHintVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDragHintVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!dragHintVisible) return;
    const t = setTimeout(() => setDragHintVisible(false), 3800);
    return () => clearTimeout(t);
  }, [dragHintVisible]);

  const openPanel = (id) => {
    setActivePanel(id);
    setMobileNavOpen(false);
    setDragHintVisible(false);
  };
  const closePanels = () => setActivePanel(null);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (activePanel) closePanels();
      else if (mobileNavOpen) setMobileNavOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activePanel, mobileNavOpen]);

  const navLink = (id, label) => (
    <a
      key={id}
      href="#"
      data-panel={id}
      onClick={(e) => { e.preventDefault(); openPanel(id); }}
    >
      {label}
    </a>
  );

  return (
    <>
      <div id="panel-overlay" className={activePanel ? 'active' : ''} onClick={closePanels} />

      <div id="drag-hint" className={dragHintVisible ? 'visible' : ''}>DRAG TO EXPLORE</div>

      <div id="ui">
        <div className="topbar">
          <div className="logo">Ifedayo Idowu</div>
          <div className="topbar-right">
            <nav className="nav-desktop" id="panel-nav">
              {NAV_LINKS.map((l) => navLink(l.id, l.label))}
            </nav>
            <div className="toolbar">
              <button
                className="tool-btn"
                onClick={onToggleDark}
                aria-label="Toggle dark mode"
                aria-pressed={darkMode}
              >
                {darkMode ? <SunIcon /> : <MoonIcon />}
              </button>
              <button
                className="tool-btn"
                onClick={onToggleSound}
                aria-label="Toggle ambient sound"
                aria-pressed={soundOn}
              >
                {soundOn ? <SoundOnIcon /> : <SoundOffIcon />}
              </button>
            </div>
            <button
              className="menu-btn"
              aria-label="Menu"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((v) => !v)}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>

        <div className={`mobile-nav${mobileNavOpen ? ' open' : ''}`}>
          {NAV_LINKS.map((l) => navLink(l.id, l.label))}
        </div>

        <Panel id="about" title="About" isOpen={activePanel === 'about'} onClose={closePanels}>
          <p>I'm Ifedayo Idowu — a DevOps/Cloud Engineer, creative technologist, and digital builder based in Aba, Abia State, Nigeria (relocating to Ibadan).</p>
          <p>On the infrastructure side, I build multi-environment CI/CD pipelines on AWS with Terraform and GitHub Actions, secured via OIDC federation — zero long-lived credentials in version control. Security tooling (Trivy, Semgrep, Gitleaks, OWASP ZAP) is a mandatory gate in every pipeline I ship, not an afterthought. Currently building Foundry, a production GitOps platform running real workloads, and pursuing AWS Certified Solutions Architect – Associate.</p>
          <p>During NYSC service, I also designed and delivered digital literacy training to 600+ civil servants across 4 Abia State government ministries — curriculum materials that were adopted into the ongoing programme.</p>
          <p>On the creative side, I build things that live on-chain and on-screen — generative sculpture, procedural motion, and digital experiences with their own internal logic. Godform is one of them.</p>
          <p>Also exploring: systems programming in C++ and Rust, AI image generation, and tools built for builders on the African continent.</p>
        </Panel>

        <Panel id="work" title="Selected Work" isOpen={activePanel === 'work'} onClose={closePanels}>
          {WORK_ITEMS.map((item) => (
            <details className="work-item" key={item.id} open={item.open}>
              <summary>
                <div>
                  <h3>{item.title}</h3>
                  <span>{item.meta}</span>
                </div>
                <ChevronIcon />
              </summary>
              <div className="work-detail">{item.body}</div>
            </details>
          ))}
        </Panel>

        <Panel id="skills" title="Skills" isOpen={activePanel === 'skills'} onClose={closePanels}>
          {SKILL_GROUPS.map((group) => (
            <div className="skills-group" key={group.title}>
              <h3>{group.title}</h3>
              <div className="skills-grid">
                {group.skills.map((s) => <div className="skill" key={s}>{s}</div>)}
              </div>
            </div>
          ))}
        </Panel>

        <Panel id="contact" title="Contact" isOpen={activePanel === 'contact'} onClose={closePanels}>
          <p>Open to collaborations, interesting problems, and conversations about systems, art, and technology.</p>
          <div className="contact-links">
            <a href="https://x.com/Raw_Chrome" target="_blank" rel="noopener"><span>→</span> X / Twitter</a>
            <a href="mailto:hello@ifedayo.dev"><span>→</span> Email</a>
            <a href="https://github.com/Matthias141" target="_blank" rel="noopener"><span>→</span> GitHub</a>
          </div>
        </Panel>
      </div>
    </>
  );
}
