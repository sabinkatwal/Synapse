function SiteBreakdown({ siteCounts }) {
  const entries = Object.entries(siteCounts);

  return (
    <section className="section-card">
      <div className="section-header">
        <div>
          <h2>Site breakdown</h2>
          <p>Platforms with the most archived chats.</p>
        </div>
      </div>
      <div className="breakdown-grid">
        {entries.map(([site, count]) => (
          <article key={site} className="breakdown-card">
            <span>{site}</span>
            <strong>{count}</strong>
          </article>
        ))}
        {!entries.length && <p className="empty-state">No site analytics available.</p>}
      </div>
    </section>
  );
}

export default SiteBreakdown;