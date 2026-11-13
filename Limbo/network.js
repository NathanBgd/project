'use strict';

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
      this.peer = new Peer();
      this.peer.on('open', id => {
        this.isHost = true;
        resolve(id);
      });
      this.peer.on('connection', conn => {
        this.conn = conn;
        this._setupConn(conn);
      });
      this.peer.on('error', e => reject(e));
    });
  },

  // Client: connect to host code
  join(code) {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      this.peer.on('open', () => {
        this.isHost = false;
        const conn = this.peer.connect(code.trim().toLowerCase());
        this.conn = conn;
        conn.on('open', () => { this._setupConn(conn); resolve(); });
        conn.on('error', e => reject(e));
      });
      this.peer.on('error', e => reject(e));
    });
  },

  _setupConn(conn) {
    this.isConnected = true;
    conn.on('data', data => { if (this._onMessage) this._onMessage(data); });
    conn.on('close', () => { this.isConnected = false; if (this._onDisconnect) this._onDisconnect(); });
    if (this._onConnect) this._onConnect();
  },

  send(data) {
    if (this.conn && this.conn.open) this.conn.send(data);
  },

  disconnect() {
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
    this.conn = null; this.peer = null;
    this.isHost = false; this.isConnected = false;
  }
};
