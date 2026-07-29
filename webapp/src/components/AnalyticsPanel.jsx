import { useMemo } from 'react';

function getMessageRole(message) {
  const rawRole = message.role || message.sender || message.author || 'assistant';
  return String(rawRole).toLowerCase().includes('user') ? 'user' : 'assistant';
}

function getBucket(value, max) {
  if (!max) return 'b-10';
  return `b-${Math.max(10, Math.ceil((value / max) * 10) * 10)}`;
}

function formatDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getWeekday(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { weekday: 'long' });
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

    const weekdayCounts = chats.reduce((acc, chat) => {
      const key = getWeekday(chat.captured_at);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const topicCounts = chats.reduce((acc, chat) => {
      const text = `${chat.title || ''} ${(chat.messages || [])
        .map((message) => message.content || message.text || message.message || '')
        .join(' ')}`.toLowerCase();
      ['authentication', 'react', 'design', 'extension', 'api', 'database', 'interview', 'research'].forEach((topic) => {
        if (text.includes(topic)) acc[topic] = (acc[topic] || 0) + 1;
      });
      return acc;
    }, {});

    const timeline = Object.entries(dailyCounts).slice(-10);
    const topics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxDay = Math.max(1, ...timeline.map(([, count]) => count));
    const maxSite = Math.max(1, ...Object.values(siteCounts));
    const maxTopic = Math.max(1, ...topics.map(([, count]) => count));
    const bestDay = Object.entries(weekdayCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      messageCount,
      roleCounts,
      timeline,
      topics,
      maxDay,
      maxSite,
      maxTopic,
      bestDay,
      providerCount: Object.keys(siteCounts).length,
      averageMessages: chats.length ? Math.round(messageCount / chats.length) : 0,
      weeklyGrowth: timeline.reduce((sum, [, count]) => sum + count, 0),
    };
  }, [chats, siteCounts]);

  const insights = [
    topSite ? `${topSite[0]} is your strongest AI provider with ${topSite[1]} captures.` : 'Capture conversations to unlock provider insights.',
    metrics.topics[0]
      ? `You discussed ${metrics.topics[0][0]} ${metrics.topics[0][1]} times.`
      : 'Topics will appear once your archive has richer text.',
    metrics.bestDay ? `Your most productive day is ${metrics.bestDay[0]}.` : 'Activity patterns are still warming up.',
  ];

  return (
    <section className="analytics-exec">
      <div className="ai-hero-panel">
        <div>
          <span className="panel-kicker">Executive Analytics</span>
          <h2>Understand how your AI work compounds over time.</h2>
          <p>
            Track providers, learning velocity, topic depth, conversation length, and the signals
            that point toward your most valuable knowledge.
          </p>
        </div>
        <div className="memory-health-card">
          <span>Weekly Growth</span>
          <strong>{metrics.weeklyGrowth}</strong>
          <small>captures in recent activity</small>
        </div>
      </div>

      <div className="analytics-metrics">
        <article className="stat-card">
          <span>Conversations</span>
          <strong>{chats.length}</strong>
        </article>
        <article className="stat-card">
          <span>Memories</span>
          <strong>{metrics.messageCount}</strong>
        </article>
        <article className="stat-card">
          <span>Providers</span>
          <strong>{metrics.providerCount}</strong>
        </article>
        <article className="stat-card">
          <span>Avg. Length</span>
          <strong>{metrics.averageMessages}</strong>
        </article>
      </div>

      <div className="analytics-grid">
        <article className="analytics-card">
          <div className="section-header">
            <div>
              <h2>Provider Distribution</h2>
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
                  <span className={getBucket(count, metrics.maxSite)} />
                </div>
              </div>
            ))}
            {!Object.keys(siteCounts).length && <div className="empty-state">No provider data yet.</div>}
          </div>
        </article>

        <article className="analytics-card">
          <div className="section-header">
            <div>
              <h2>Weekly Activity</h2>
              <p>Recent archive momentum by capture date.</p>
            </div>
          </div>

          <div className="timeline-bars">
            {metrics.timeline.map(([date, count]) => (
              <div className="timeline-bar" key={date}>
                <span className={getBucket(count, metrics.maxDay)} />
                <strong>{count}</strong>
                <small>{date}</small>
              </div>
            ))}
            {!metrics.timeline.length && <div className="empty-state">No timeline data yet.</div>}
          </div>
        </article>

        <article className="analytics-card">
          <div className="section-header">
            <div>
              <h2>Topic Distribution</h2>
              <p>High-signal themes found in your archive.</p>
            </div>
          </div>

          <div className="bar-list">
            {metrics.topics.map(([topic, count]) => (
              <div className="bar-row" key={topic}>
                <div>
                  <strong>{topic}</strong>
                  <span>{count} mentions</span>
                </div>
                <div className="bar-track">
                  <span className={getBucket(count, metrics.maxTopic)} />
                </div>
              </div>
            ))}
            {!metrics.topics.length && <div className="empty-state">No topic data yet.</div>}
          </div>
        </article>

        <article className="analytics-card">
          <div className="section-header">
            <div>
              <h2>Conversation Length</h2>
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

        <article className="analytics-card analytics-card-wide">
          <div className="section-header">
            <div>
              <h2>Smart AI Insights</h2>
              <p>Readable signals inferred from your current archive.</p>
            </div>
          </div>

          <div className="insight-list">
            {insights.map((insight) => (
              <div className="insight-item" key={insight}>
                <span />
                <p>{insight}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

export default AnalyticsPanel;
