/**
 * TmdbAttribution — server-safe, no hooks, no state.
 *
 * Renders the mandatory TMDB attribution notice required by TMDB API Terms.
 * Exact wording is fixed by TMDB — do NOT rephrase.
 */
export function TmdbAttribution() {
  return (
    <p
      style={{
        textAlign: 'center',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-lo)',
        margin: 0,
      }}
    >
      This product uses the{' '}
      <a
        href="https://www.themoviedb.org"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'underline' }}
      >
        TMDB
      </a>{' '}
      API but is not endorsed or certified by TMDB.
    </p>
  );
}
