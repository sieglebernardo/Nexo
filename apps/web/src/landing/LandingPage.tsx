import { useState } from "react";

import { Brand } from "../ui/Brand.js";
import "./landing.css";

type IconName = "arrow" | "check" | "menu" | "x";

function LandingIcon({ name }: Readonly<{ name: IconName }>) {
  if (name === "arrow") {
    return (
      <svg aria-hidden="true" className="landing-icon" fill="none" viewBox="0 0 20 20">
        <path
          d="M4 10h11M10.5 5.5 15 10l-4.5 4.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg aria-hidden="true" className="landing-icon" fill="none" viewBox="0 0 20 20">
        <path
          d="m4 10.5 3.7 3.7L16 6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (name === "x") {
    return (
      <svg aria-hidden="true" className="landing-icon" fill="none" viewBox="0 0 20 20">
        <path
          d="m5 5 10 10M15 5 5 15"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="landing-icon" fill="none" viewBox="0 0 20 20">
      <path
        d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

const navItems = [
  { href: "#product-preview", label: "Product" },
  { href: "#workflow-preview", label: "Workflows" },
  { href: "#board-preview", label: "Boards" },
] as const;

const previewTasks = [
  { title: "Outline launch brief", meta: "NEX-12 · High", tone: "blue" },
  { title: "Review onboarding flow", meta: "NEX-18 · Medium", tone: "violet" },
  { title: "Share release notes", meta: "NEX-21 · Low", tone: "cyan" },
] as const;

function ProductPreview() {
  return (
    <div className="landing-preview-wrap" id="product-preview">
      <div className="landing-preview-orbit" aria-hidden="true" />
      <div className="landing-preview" aria-label="Illustrative Nexo board preview" role="img">
        <div className="landing-preview-windowbar">
          <span className="landing-window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="landing-preview-path">Nexo / Product launch</span>
          <span className="landing-preview-avatar" aria-hidden="true">
            AM
          </span>
        </div>

        <div className="landing-preview-content">
          <div className="landing-preview-heading">
            <div>
              <span className="landing-preview-kicker">Project</span>
              <h2>Product launch</h2>
            </div>
            <span className="landing-preview-project-key">NEX</span>
          </div>

          <div className="landing-preview-toolbar">
            <div className="landing-preview-tabs">
              <span className="is-active">Board</span>
              <span>List</span>
            </div>
            <span className="landing-preview-filter">
              All tasks <b>⌄</b>
            </span>
          </div>

          <div className="landing-board" id="board-preview">
            <div className="landing-lane">
              <div className="landing-lane-heading">
                <span>
                  <i className="landing-status-dot is-muted" />
                  Backlog
                </span>
                <b>2</b>
              </div>
              <div className="landing-task-card">
                <span className="landing-task-label">Planning</span>
                <strong>Map the next milestone</strong>
                <small>NEX-09 · Unassigned</small>
              </div>
              <div className="landing-task-card is-faded">
                <strong>Collect team input</strong>
                <small>NEX-10 · Low</small>
              </div>
            </div>

            <div className="landing-lane" id="workflow-preview">
              <div className="landing-lane-heading">
                <span>
                  <i className="landing-status-dot is-active" />
                  In progress
                </span>
                <b>2</b>
              </div>
              {previewTasks.slice(0, 2).map((task) => (
                <div className="landing-task-card" key={task.title}>
                  <span className={`landing-task-label is-${task.tone}`}>Started</span>
                  <strong>{task.title}</strong>
                  <small>{task.meta}</small>
                </div>
              ))}
            </div>

            <div className="landing-lane">
              <div className="landing-lane-heading">
                <span>
                  <i className="landing-status-dot is-done" />
                  Completed
                </span>
                <b>1</b>
              </div>
              <div className="landing-task-card is-complete">
                <span className="landing-task-label is-green">Completed</span>
                <strong>Confirm launch date</strong>
                <small>NEX-07 · Done</small>
              </div>
            </div>
          </div>

          <div className="landing-preview-footnote">
            <span>
              <LandingIcon name="check" />
              Workspace-visible project
            </span>
            <span>
              <LandingIcon name="check" />
              Configurable workflow
            </span>
          </div>
        </div>
      </div>
      <span className="landing-preview-caption">Illustrative product preview</span>
    </div>
  );
}

function LandingNavbar() {
  const [isOpen, setIsOpen] = useState(false);

  const closeMenu = () => setIsOpen(false);

  return (
    <header className="landing-navbar">
      <div className="landing-container landing-navbar-inner">
        <a aria-label="Com Nexo home" className="landing-brand-link" href="/" onClick={closeMenu}>
          <Brand className="landing-brand" />
        </a>

        <nav aria-label="Landing page" className="landing-desktop-nav">
          {navItems.map((item) => (
            <a href={item.href} key={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="landing-navbar-actions">
          <a className="landing-login-link" href="/login">
            Sign in
          </a>
          <a className="landing-button landing-button-small" href="/signup">
            Create account
          </a>
          <button
            aria-controls="landing-mobile-navigation"
            aria-expanded={isOpen}
            aria-label={isOpen ? "Close navigation" : "Open navigation"}
            className="landing-menu-button"
            onClick={() => setIsOpen((open) => !open)}
            type="button"
          >
            <LandingIcon name={isOpen ? "x" : "menu"} />
          </button>
        </div>
      </div>

      {isOpen && (
        <nav
          aria-label="Mobile landing page"
          className="landing-mobile-nav"
          id="landing-mobile-navigation"
        >
          <div className="landing-container landing-mobile-nav-inner">
            {navItems.map((item) => (
              <a href={item.href} key={item.href} onClick={closeMenu}>
                {item.label}
              </a>
            ))}
            <a href="/login" onClick={closeMenu}>
              Sign in
            </a>
            <a className="landing-button" href="/signup" onClick={closeMenu}>
              Create account
            </a>
          </div>
        </nav>
      )}
    </header>
  );
}

export function LandingPage() {
  return (
    <div className="landing-page">
      <LandingNavbar />
      <main>
        <section aria-labelledby="landing-hero-title" className="landing-hero" id="overview">
          <div className="landing-container landing-hero-grid">
            <div className="landing-hero-copy">
              <span className="landing-eyebrow">Collaborative task management</span>
              <h1 id="landing-hero-title">
                Keep the work moving
                <span className="landing-gradient-text"> without losing the thread.</span>
              </h1>
              <p>
                Com Nexo gives teams one clear place to shape projects, coordinate tasks, and move
                from plan to done together.
              </p>
              <div className="landing-hero-actions">
                <a className="landing-button" href="/signup">
                  Start with Nexo <LandingIcon name="arrow" />
                </a>
                <a className="landing-text-link" href="#product-preview">
                  Explore the workspace <LandingIcon name="arrow" />
                </a>
              </div>
              <div className="landing-proof-row">
                <span>
                  <LandingIcon name="check" />
                  Projects with clear ownership
                </span>
                <span>
                  <LandingIcon name="check" />
                  Board and List views
                </span>
              </div>
            </div>
            <ProductPreview />
          </div>
          <div aria-hidden="true" className="landing-shadow" />
        </section>
      </main>
    </div>
  );
}
