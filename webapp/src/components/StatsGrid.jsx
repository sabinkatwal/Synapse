function StatsGrid({ total, favoriteCount, topSite }) {
  return (
    <section className="stats-grid">
      <article className="stat-card">
        <span>Total captures</span>
        <strong>{total}</strong>
      </article>
      <article className="stat-card">
        <span>Favorites</span>
        <strong>{favoriteCount}</strong>
      </article>
      <article className="stat-card">
        <span>Top site</span>
        <strong>{topSite ? `${topSite[0]} (${topSite[1]})` : '—'}</strong>
      </article>
    </section>
  );
}

export default StatsGrid;