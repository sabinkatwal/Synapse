import { useMemo } from 'react';

function getMessageRole(message) {
  const rawRole = message.role || message.sender || message.author || 'assistant';
  return String(rawRole).toLowerCase().includes('user') ? 'user' : 'assistant';
}

function formatDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function AnalyticsPanel({ chats, siteCounts, favoriteCount, topSite }) {
  const metrics = useMemo(() => {
    const messageCount = chats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0);
    const roleCounts = chats.reduce(
      (acc, chat) => {
        (chat.messages || []).forEach((message) => {
          acc[getMessageRole(message)] += 1;
        });
        return acc;
      },
      { user: 0, assistant: 0 }
    );

    const dailyCounts = chats.reduce((acc, chat) => {
      const key = formatDateKey(chat.captured_at);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const timeline = Object.entries(dailyCounts).slice(-10);
    const maxDay = Math.max(1, ...timeline.map(([, count]) => count));
    const maxSite = Math.max(1, ...Object.values(siteCounts));

    return {
      messageCount,
      roleCounts,
      timeline,
      maxDay,
      maxSite,
      averageMessages: chats.length ? Math.round(messageCount / chats.length) : 0,
    };
  }, [chats, siteCounts]);

  return (
    <section className="analytics-view">
      <div className="analytics-metrics">
        <article className="stat-card">
          <span>Total messages</span>
          <strong>{metrics.messageCount}</strong>
        </article>
        <article className="stat-card">
          <span>Avg. messages</span>
          <strong>{metrics.averageMessages}</strong>
        </article>
        <article className="stat-card">
          <span>Favorites</span>
          <strong>{favoriteCount}</strong>
        </article>
        <article className="stat-card">
          <span>Top source</span>
          <strong>{topSite ? topSite[0] : '-'}</strong>
        </article>
      </div>

      <div className="analytics-grid">
        <article className="analytics-card">
          <div className="section-header">
            <div>
              <h2>Source Distribution</h2>
              <p>Where your archived conversations came from.</p>
            </div>
          </div>

          <div className="bar-list">
            {Object.entries(siteCounts).map(([site, count]) => (
              <div className="bar-row" key={site}>
                <div>
                  <strong>{site}</strong>
                  <span>{count} captures</span>
                </div>
                <div className="bar-track">
                  <span style={{ width: `${Math.max(8, (count / metrics.maxSite) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!Object.keys(siteCounts).length && <div className="empty-state">No source data yet.</div>}
          </div>
        </article>

        <article className="analytics-card">
          <div className="section-header">
            <div>
              <h2>Capture Timeline</h2>
              <p>Recent archive activity by capture date.</p>
            </div>
          </div>

          <div className="timeline-bars">
            {metrics.timeline.map(([date, count]) => (
              <div className="timeline-bar" key={date}>
                <span style={{ height: `${Math.max(12, (count / metrics.maxDay) * 100)}%` }} />
                <strong>{count}</strong>
                <small>{date}</small>
              </div>
            ))}
            {!metrics.timeline.length && <div className="empty-state">No timeline data yet.</div>}
          </div>
        </article>

        <article className="analytics-card analytics-card-wide">
          <div className="section-header">
            <div>
              <h2>Message Mix</h2>
              <p>User and assistant turns across the archive.</p>
            </div>
          </div>

          <div className="role-grid">
            <div className="role-card">
              <span>User turns</span>
              <strong>{metrics.roleCounts.user}</strong>
            </div>
            <div className="role-card">
              <span>Assistant turns</span>
              <strong>{metrics.roleCounts.assistant}</strong>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export default AnalyticsPanel;
