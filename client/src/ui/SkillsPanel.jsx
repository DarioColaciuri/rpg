import React, { useState } from 'react';

const SKILL_NAMES = {
  combat_arms: 'Combate con Armas',
  magic: 'Magia',
  shield_defense: 'Defensa con Escudos',
  dodge: 'Evasion',
  meditation: 'Meditar',
};

export default function SkillsPanel({ skills, skillPoints, onAssignSkill }) {
  const [expanded, setExpanded] = useState(false);

  if (!skills) return null;

  const hasPoints = (skillPoints ?? 0) > 0;

  return (
    <div className="skills-panel">
      <div className="skills-header" onClick={() => setExpanded(!expanded)}>
        <span>Skills</span>
        {hasPoints && <span className="skills-badge">{skillPoints}</span>}
      </div>
      {expanded && (
        <div className="skills-list">
          {Object.entries(SKILL_NAMES).map(([key, name]) => (
            <div key={key} className="skill-row">
              <span className="skill-name">{name}</span>
              <span className="skill-val">{(skills[key] || 0)}%</span>
              {hasPoints && (skills[key] || 0) < 100 && (
                <button className="skill-plus" onClick={() => onAssignSkill(key)}>+</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
