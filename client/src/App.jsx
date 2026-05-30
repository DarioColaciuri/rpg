import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient.js';
import Auth from './ui/Auth.jsx';
import CharacterSelect from './ui/CharacterSelect.jsx';
import CharacterCreate from './ui/CharacterCreate.jsx';
import GameScreen from './ui/GameScreen.jsx';
import './App.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState('auth');
  const [selectedCharacter, setSelectedCharacter] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) {
        setSession(s);
        setScreen('character_select');
      }
    });
  }, []);

  const handleAuth = (newSession) => {
    setSession(newSession);
    setScreen('character_select');
  };

  const handleSelect = (character) => {
    setSelectedCharacter(character);
    setScreen('game');
  };

  const handleLeave = () => {
    setSelectedCharacter(null);
    setScreen('character_select');
  };

  const renderScreen = () => {
    switch (screen) {
      case 'auth':
        return <Auth onAuth={handleAuth} />;
      case 'character_select':
        return session ? (
          <CharacterSelect
            session={session}
            onSelect={handleSelect}
            onCreate={() => setScreen('character_create')}
            onLogout={async () => {
              await supabase.auth.signOut();
              setSession(null);
              setSelectedCharacter(null);
              setScreen('auth');
            }}
          />
        ) : (
          <Auth onAuth={handleAuth} />
        );
      case 'character_create':
        return session ? (
          <CharacterCreate
            session={session}
            onBack={() => setScreen('character_select')}
            onCreated={() => setScreen('character_select')}
          />
        ) : (
          <Auth onAuth={handleAuth} />
        );
      case 'game':
        return session && selectedCharacter ? (
          <GameScreen
            key={selectedCharacter.id}
            character={selectedCharacter}
            session={session}
            onLeave={handleLeave}
          />
        ) : (
          <Auth onAuth={handleAuth} />
        );
      default:
        return null;
    }
  };

  return <div className="app">{renderScreen()}</div>;
}
