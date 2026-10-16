import { BackendStatus } from './BackendStatus';

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#main">
          <span aria-hidden="true" className="brand-icon">
            &lt;/&gt;
          </span>{' '}
          OpenSource Explorer
        </a>
        <nav aria-label="Main navigation">
          <a href="#explore">Explore</a>
          <a href="#about">About</a>
        </nav>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">OPEN CODE. NEW POSSIBILITIES.</p>
          <h1 id="hero-title">
            Find your next
            <br />
            <span>open-source adventure.</span>
          </h1>
          <p className="intro">
            Discover projects worth exploring. Understand the code, meet new
            ideas, and take your next step as a developer.
          </p>
          <a className="primary-link" href="#explore">
            Explore the foundation <span aria-hidden="true">→</span>
          </a>
        </section>
        <section
          className="search-card"
          id="explore"
          aria-labelledby="search-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR STARTING POINT</p>
              <h2 id="search-title">Explore repositories</h2>
            </div>
            <span className="badge">Phase 1 · Foundation</span>
          </div>
          <p id="search-note">
            Search is coming in a later phase. These controls preview the
            experience; they do not send searches.
          </p>
          <div className="search-fields">
            <div>
              <label htmlFor="query">Repository or topic</label>
              <input
                id="query"
                type="search"
                placeholder="e.g. developer tools, react, accessibility"
                aria-describedby="search-note"
              />
            </div>
            <div>
              <label htmlFor="language">Language</label>
              <select id="language" aria-describedby="search-note">
                <option>Any language</option>
                <option>TypeScript</option>
                <option>JavaScript</option>
                <option>Python</option>
                <option>Go</option>
              </select>
            </div>
            <button disabled>Search · coming soon</button>
          </div>
          <BackendStatus />
        </section>
        <section className="about" id="about" aria-labelledby="about-title">
          <div>
            <p className="eyebrow">BUILT TO LEARN</p>
            <h2 id="about-title">
              A small start.
              <br />A real full-stack foundation.
            </h2>
          </div>
          <p>
            OpenSource Explorer is a student learning project built with React,
            TypeScript, and Express. Today, the interface talks to a live
            backend. Next, we’ll connect the official GitHub REST API to bring
            public repositories into view.
          </p>
        </section>
      </main>
      <footer>
        OpenSource Explorer <span>Built one thoughtful step at a time.</span>
      </footer>
    </>
  );
}
