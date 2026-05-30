import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';

export default function CharacterSelect({ session, onSelect, onCreate, onLogout }) {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at');
    if (error) {
      setError(error.message);
    } else {
      setCharacters(data || []);
    }
    setLoading(false);
  };

  const handleDelete = async (charId) => {
    const { error } = await supabase.from('characters').delete().eq('id', charId);
    if (error) {
      setError(error.message);
    } else {
      loadCharacters();
    }
  };

  return (
    <div className="select-screen">
      <div className="select-card">
        <h1 className="select-title">Select Character</h1>
        <div className="select-email">{session.user.email}</div>

        {error && <div className="auth-error">{error}</div>}

        {loading ? (
          <div className="select-loading">Loading characters...</div>
        ) : (
          <div className="char-list">
            {characters.length === 0 && (
              <div className="char-empty">No characters yet</div>
            )}
            {characters.map((c) => (
              <div key={c.id} className="char-card">
                <div className="char-card-info">
                  <span className="char-card-name">{c.name}</span>
                  <span className="char-card-detail">{c.class} | {c.race} | {c.sex}</span>
                  <span className="char-card-detail">Lv.{c.level} | Map: {c.map}</span>
                </div>
                <div className="char-card-actions">
                  <button className="char-play-btn" onClick={() => onSelect(c)}>Play</button>
                  <button className="char-delete-btn" onClick={() => handleDelete(c.id)}>X</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="select-actions">
          <button
            className="create-btn"
            onClick={onCreate}
            disabled={characters.length >= 5}
          >
            Create Character ({characters.length}/5)
          </button>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
