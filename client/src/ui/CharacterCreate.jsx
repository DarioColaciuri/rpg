import React, { useState } from 'react';
import { supabase } from '../supabaseClient.js';

const CLASS_STATS = {
  WARRIOR: { hp: 120, mana: 10, stamina: 20, desc: 'High HP, high melee damage' },
  HUNTER: { hp: 100, mana: 10, stamina: 25, desc: 'Ranged specialist, high stamina' },
  PALADIN: { hp: 110, mana: 30, stamina: 20, desc: 'Holy warrior, can heal' },
  ASSASSIN: { hp: 90, mana: 15, stamina: 30, desc: 'Stealthy, high stamina' },
  CLERIC: { hp: 85, mana: 60, stamina: 20, desc: 'Healer, high mana' },
  BARD: { hp: 85, mana: 60, stamina: 22, desc: 'Support, high mana' },
  MAGE: { hp: 60, mana: 100, stamina: 20, desc: 'Low HP, high mana, spells' },
  DRUID: { hp: 80, mana: 60, stamina: 20, desc: 'Nature caster, can heal' },
  BANDIT: { hp: 95, mana: 15, stamina: 22, desc: 'Agile fighter' },
};
const RACE_STATS = {
  HUMAN: { hp: 15, mana: 0, stamina: 1, desc: 'Balanced' },
  ELF: { hp: 5, mana: 10, stamina: 2, desc: 'More mana, agile' },
  DROW: { hp: 10, mana: 5, stamina: 1, desc: 'Dark elf, balanced' },
  GNOME: { hp: -5, mana: 15, stamina: 3, desc: 'Less HP, more mana' },
  DWARF: { hp: 20, mana: -5, stamina: 0, desc: 'More HP, less mana' },
  ORC: { hp: 25, mana: -5, stamina: 0, desc: 'Most HP, less mana' },
};

export default function CharacterCreate({ session, onBack, onCreated }) {
  const [name, setName] = useState('');
  const [sex, setSex] = useState('male');
  const [charClass, setCharClass] = useState('WARRIOR');
  const [race, setRace] = useState('HUMAN');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [headVariant, setHeadVariant] = useState(1);

  const calcStats = () => {
    const base = CLASS_STATS[charClass];
    const bonus = RACE_STATS[race];
    return {
      hp: base.hp + bonus.hp,
      mana: base.mana + bonus.mana,
      stamina: base.stamina + (bonus.stamina || 0),
    };
  };

  const preview = calcStats();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (name.length < 2 || name.length > 20) {
      setError('Name must be 2-20 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      setError('Name can only contain letters, numbers, and underscores');
      return;
    }

    setLoading(true);
    const { error: insertError } = await supabase.from('characters').insert({
      user_id: session.user.id,
      name,
      class: charClass,
      race,
      sex,
      hp: preview.hp,
      max_hp: preview.hp,
      mana: preview.mana,
      max_mana: preview.mana,
      stamina: preview.stamina,
      max_stamina: preview.stamina,
      food: 100,
      drink: 100,
      level: 1,
      xp: 0,
      map: 'city',
      x: 10,
      y: 10,
      head_variant: headVariant,
    });

    if (insertError) {
      if (insertError.code === '23505') {
        setError('Name already taken');
      } else {
        setError(insertError.message);
      }
      setLoading(false);
    } else {
      onCreated();
    }
  };

  return (
    <div className="create-screen">
      <div className="create-card">
        <h1 className="create-title">Create Character</h1>
        <form onSubmit={handleSubmit}>
          <label className="create-label">Name</label>
          <input
            className="auth-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Character name"
            required
          />

          <label className="create-label">Sex</label>
          <div className="create-options">
            <button type="button" className={`opt-btn ${sex === 'male' ? 'opt-active' : ''}`} onClick={() => setSex('male')}>Male</button>
            <button type="button" className={`opt-btn ${sex === 'female' ? 'opt-active' : ''}`} onClick={() => setSex('female')}>Female</button>
          </div>

          <label className="create-label">Class</label>
          <div className="create-options">
            {Object.keys(CLASS_STATS).map((c) => (
              <button key={c} type="button" className={`opt-btn ${charClass === c ? 'opt-active' : ''}`} onClick={() => setCharClass(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="create-desc">{CLASS_STATS[charClass].desc}</div>

          <label className="create-label">Race</label>
          <div className="create-options" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {Object.keys(RACE_STATS).map((r) => (
              <button key={r} type="button" className={`opt-btn ${race === r ? 'opt-active' : ''}`} onClick={() => setRace(r)}>
                {r}
              </button>
            ))}
          </div>
          <div className="create-desc">{RACE_STATS[race].desc}</div>

          <label className="create-label">Head Style</label>
          {race === 'HUMAN' ? (
            <div className="create-options">
              <button type="button"
                className={`opt-btn ${headVariant === 1 ? 'opt-active' : ''}`}
                onClick={() => setHeadVariant(1)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span style={{
                  display: 'inline-block', width: 24, height: 24,
                  background: '#cc3333', borderRadius: 4
                }} />
                Head 1
              </button>
              <button type="button"
                className={`opt-btn ${headVariant === 2 ? 'opt-active' : ''}`}
                onClick={() => setHeadVariant(2)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span style={{
                  display: 'inline-block', width: 24, height: 24,
                  background: '#3366cc', borderRadius: 4
                }} />
                Head 2
              </button>
            </div>
          ) : (
            <div className="create-desc" style={{ padding: '8px', color: '#888' }}>
              No heads available for {race}
            </div>
          )}


          <div className="create-preview">
            <div>HP: {preview.hp} | Mana: {preview.mana} | Stamina: {preview.stamina}</div>
            <div>Race: {race} | Class: {charClass}</div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create'}
          </button>
        </form>
        <button className="auth-toggle" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
