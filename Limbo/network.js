'use strict';

// ── ICE servers — STUN (Google/Cloudflare) + TURN multi-provider ──────────
// Ordre : STUN gratuits → TURN HTTP → TURN TLS (passe les pare-feu stricts)
const _PEER_CONFIG = {
  config: {
    iceTransportPolicy: 'all',
    iceServers: [
      // STUN — plusieurs pour fiabilité
      { urls: 'stun:stun.l.google.com:19302'   },
      { urls: 'stun:stun1.l.google.com:19302'  },
      { urls: 'stun:stun2.l.google.com:19302'  },
      { urls: 'stun:stun3.l.google.com:19302'  },
      { urls: 'stun:stun.cloudflare.com:3478'  },

      // TURN Open Relay — metered.ca (HTTP + HTTPS, passe les pare-feu)
      {
        urls:       'turn:openrelay.metered.ca:80',
        username:   'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls:       'turn:openrelay.metered.ca:443',
        username:   'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls:       'turns:openrelay.metered.ca:443',  // TLS — passe les proxies
        username:   'openrelayproject',
        credential: 'openrelayproject'
      },
      // Relay secondaire metered
      {
        urls:       'turn:a.relay.metered.ca:80',
        username:   'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls:       'turns:a.relay.metered.ca:443',
        username:   'openrelayproject',
        credential: 'openrelayproject'
      },
    ]
  }
};

const _CONN_TIMEOUT_MS = 25000; // 25s — NAT traversal peut prendre du temps

const Net = {
  peer: null,
  conn: null,
  isHost: false,
  isConnected: false,
  _onMessage: null,
  _onConnect: null,
  _onDisconnect: null,

  onMessage(fn)    { this._onMessage    = fn; },
  onConnect(fn)    { this._onConnect    = fn; },
  onDisconnect(fn) { this._onDisconnect = fn; },

  // ── Host : ouvre un peer, retourne promise<code> ──────────
  host() {
    return new Promise((resolve, reject) => {
      Logger.log('NET', 'Création du peer hôte…');
      this.peer = new Peer(undefined, _PEER_CONFIG);

      this.peer.on('open', id => {
        this.isHost = true;
        Logger.log('NET', `Peer hôte ouvert — code: ${id}`);
        resolve(id);
      });

      this.peer.on('connection', conn => {
        Logger.log('NET', `Client entrant: ${conn.peer}`);
        this.conn = conn;
        this._setupConn(conn);
      });

      this.peer.on('disconnected', () => {
        Logger.log('NET', 'Peer déconnecté du signaling — reconnect…');
        if (this.peer && !this.peer.destroyed) this.peer.reconnect();
      });

      this.peer.on('error', e => {
        Logger.log('NET', `Erreur peer hôte: ${e.type} — ${e.message || ''}`);
        reject(e);
      });
    });
  },

  // ── Client : se connecte au code hôte ────────────────────
  join(code) {
    return new Promise((resolve, reject) => {
      const cleanCode = code.trim();
      Logger.log('NET', `Connexion au pair ${cleanCode}…`);

      this.peer = new Peer(undefined, _PEER_CONFIG);

      let resolved = false;
      const done = (err) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        if (err) reject(err); else resolve();
      };

      // Timeout global — aucune connexion établie dans le délai
      const timeoutId = setTimeout(() => {
        Logger.log('NET', `Timeout connexion après ${_CONN_TIMEOUT_MS}ms`);
        done(new Error(`Connexion expirée (${_CONN_TIMEOUT_MS/1000}s) — l'hôte est-il bien en attente ?`));
      }, _CONN_TIMEOUT_MS);

      this.peer.on('open', () => {
        Logger.log('NET', 'Peer local ouvert — négociation ICE…');
        this.isHost = false;

        const conn = this.peer.connect(cleanCode, {
          reliable: true,
          serialization: 'json'
        });
        this.conn = conn;

        conn.on('open', () => {
          Logger.log('NET', 'Canal data ouvert — connexion établie');
          this._setupConn(conn);
          done(null);
        });

        conn.on('error', e => {
          Logger.log('NET', `Erreur canal client: ${e.type || e.message}`);
          done(e);
        });

        // ICE : n'échouer que sur 'failed' — 'disconnected' est transitoire
        conn.on('iceStateChanged', state => {
          Logger.log('NET', `ICE state: ${state}`);
          if (state === 'failed') {
            done(new Error('Échec ICE — NAT incompatible. Réessaie ou utilise un réseau différent.'));
          }
          // 'disconnected' est normal pendant la négociation, ne pas rejeter
        });
      });

      this.peer.on('disconnected', () => {
        Logger.log('NET', 'Peer client déconnecté du signaling — reconnect…');
        if (this.peer && !this.peer.destroyed) this.peer.reconnect();
      });

      this.peer.on('error', e => {
        Logger.log('NET', `Erreur peer client: ${e.type} — ${e.message || ''}`);
        done(e);
      });
    });
  },

  _setupConn(conn) {
    this.isConnected = true;
    Logger.log('NET', `Canal configuré (reliable=${conn.reliable})`);

    conn.on('data', data => {
      if (this._onMessage) this._onMessage(data);
    });

    conn.on('close', () => {
      this.isConnected = false;
      Logger.log('NET', 'Canal data fermé');
      if (this._onDisconnect) this._onDisconnect();
    });

    conn.on('error', e => {
      Logger.log('NET', `Erreur canal: ${e.type || e.message}`);
    });

    if (this._onConnect) this._onConnect();
  },

  send(data) {
    if (this.conn && this.conn.open) {
      this.conn.send(data);
    }
  },

  disconnect() {
    if (this.conn)  this.conn.close();
    if (this.peer)  this.peer.destroy();
    this.conn = null; this.peer = null;
    this.isHost = false; this.isConnected = false;
    Logger.log('NET', 'Déconnexion manuelle');
  }
};
