import React, { useState, useRef, useEffect, useCallback } from 'react';

export default function ChatBox({ messages, onSend }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Enter') {
        if (!open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        } else {
          e.preventDefault();
          e.stopPropagation();
          if (input.trim()) {
            onSend(input);
            setInput('');
          }
          setOpen(false);
        }
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setInput('');
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [open, input, onSend]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <div className={`chat-box ${open ? 'chat-open' : ''}`}>
      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={i} className="chat-msg">
            <span className="chat-name">{m.name}: </span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>
      {open && (
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          maxLength={200}
        />
      )}
    </div>
  );
}