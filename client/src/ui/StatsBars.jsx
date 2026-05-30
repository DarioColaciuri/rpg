import React from 'react';

const barConfig = [
  { key: 'hp', label: 'HP', color: '#cc4444', bg: '#441111' },
  { key: 'mana', label: 'MANA', color: '#4444cc', bg: '#111144' },
  { key: 'stamina', label: 'STA', color: '#44cc44', bg: '#114411' },
  { key: 'food', label: 'FOOD', color: '#cc8844', bg: '#442211' },
  { key: 'drink', label: 'DRINK', color: '#4488cc', bg: '#112244' },
];

export default function StatsBars({ stats }) {
  if (!stats) return <div className="stats-bars"><span className="stats-loading">Loading...</span></div>;

  return (
    <div className="stats-bars">
      <div className="stats-header">
        <span className="stats-name">{stats.name || 'Unknown'}</span>
        <span className="stats-level">Lv.{stats.level ?? 1}</span>
        <span className="stats-xp">XP: {stats.xp ?? 0}</span>
      </div>
      {barConfig.map(({ key, label, color, bg }) => {
        const current = stats[key] ?? 0;
        const max = stats[`max${key.charAt(0).toUpperCase() + key.slice(1)}`] ?? 100;
        const pct = Math.min(100, Math.max(0, (current / max) * 100));
        return (
          <div key={key} className="stat-bar-row">
            <span className="stat-label">{label}</span>
            <div className="stat-bar-bg" style={{ backgroundColor: bg }}>
              <div
                className="stat-bar-fill"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="stat-value">{current}/{max}</span>
          </div>
        );
      })}
    </div>
  );
}
