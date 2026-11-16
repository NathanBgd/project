'use strict';

// ── PeerJS ICE config — STUN public + fallback TURN open-relay ──
const _PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      // Open-relay TURN pour NAT symétrique (norme WebRTC RFC 5766)
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
    ]
  }
};

const _CONN_TIMEOUT_MS = 15000; // 15s avant d'abandonner

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

  // Host: open a peer, return promise<code>
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
        Logger.log('NET', 'Peer déconnecté du serveur de signalisation — tentative reconnect…');
        if (this.peer && !this.peer.destroyed) this.peer.reconnect();
      });

      this.peer.on('error', e => {
        Logger.log('NET', `Erreur peer hôte: ${e.type} — ${e.message || ''}`);
        reject(e);
      });
    });
  },

  // Client: connect to host code
  join(code) {
    return new Promise((resolve, reject) => {
      const cleanCode = code.trim(); // NE PAS toLowerCase — IDs PeerJS sont déjà lowercase
      Logger.log('NET', `Connexion au pair ${cleanCode}…`);

      this.peer = new Peer(undefined, _PEER_CONFIG);

      // Timeout global de négociation
      const timeoutId = setTimeout(() => {
        Logger.log('NET', `Timeout connexion après ${_CONN_TIMEOUT_MS}ms`);
        reject(new Error(`Connexion expirée (${_CONN_TIMEOUT_MS/1000}s) — vérifiez le code ou réessayez`));
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
          clearTimeout(timeoutId);
          Logger.log('NET', 'Canal data ouvert — connexion établie');
          this._setupConn(conn);
          resolve();
        });

        conn.on('error', e => {
          clearTimeout(timeoutId);
          Logger.log('NET', `Erreur canal client: ${e.type || e.message}`);
          reject(e);
        });

        // ICE failure détecté via peerConnection si disponible
        conn.on('iceStateChanged', state => {
          Logger.log('NET', `ICE state: ${state}`);
          if (state === 'failed' || state === 'disconnected') {
            clearTimeout(timeoutId);
            reject(new Error(`Échec négociation ICE (${state}) — NAT incompatible ou TURN indisponible`));
          }
        });
      });

      this.peer.on('disconnected', () => {
        Logger.log('NET', 'Peer client déconnecté du signaling — reconnect…');
        if (this.peer && !this.peer.destroyed) this.peer.reconnect();
      });

      this.peer.on('error', e => {
        clearTimeout(timeoutId);
        Logger.log('NET', `Erreur peer client: ${e.type} — ${e.message || ''}`);
        reject(e);
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
