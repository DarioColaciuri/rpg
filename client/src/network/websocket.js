class GameSocket {
  constructor() {
    this.ws = null;
    this.listeners = [];
    this.connected = false;
    this.userId = null;
    this.selectedSlot = null;
  }

  connect(token) {
    if (this.ws) this.disconnect();
    const url = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.send('auth', { token });
    };

    this.ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'auth_ok') {
        this.connected = true;
        this.userId = msg.userId;
      }
      for (const fn of this.listeners) {
        fn(msg);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      for (const fn of this.listeners) {
        fn({ type: 'disconnected' });
      }
    };

    this.ws.onerror = () => {
      for (const fn of this.listeners) {
        fn({ type: 'error', msg: 'Connection error' });
      }
    };
  }

  disconnect() {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.connected = false;
  }

  send(type, data = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  onMessage(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  removeListener(fn) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
}

export const gameSocket = new GameSocket();
