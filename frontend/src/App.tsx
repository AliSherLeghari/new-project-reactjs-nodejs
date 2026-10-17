import { SearchExplorer } from './search/SearchExplorer';

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
            Find a project <span aria-hidden="true">→</span>
          </a>
        </section>
        <SearchExplorer />
        <section className="about" id="about" aria-labelledby="about-title">
          <div>
            <p className="eyebrow">BUILT TO LEARN</p>
            <h2 id="about-title">
              Open source.
              <br />A world of ideas.
            </h2>
          </div>
          <p>
            OpenSource Explorer is a student learning project built with React,
            TypeScript, and Express. Search public repositories through our
            backend and the official GitHub REST API. Explore projects on GitHub
            and learn how they work, one discovery at a time.
          </p>
        </section>
      </main>
      <footer>
        OpenSource Explorer <span>Built one thoughtful step at a time.</span>
      </footer>
    </>
  );
}
