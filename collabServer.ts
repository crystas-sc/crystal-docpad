import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocketServer, WebSocket } from 'ws';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface CollabRoom {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
}

const rooms = new Map<string, CollabRoom>();

function send(ws: WebSocket, message: Uint8Array): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(message);
  } catch {
    // Ignore send errors on closing sockets
  }
}

function getOrCreateRoom(roomName: string): CollabRoom {
  const existing = rooms.get(roomName);
  if (existing) return existing;

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const conns = new Map<WebSocket, Set<number>>();

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const payload = encoding.toUint8Array(encoder);

    for (const conn of conns.keys()) {
      if (conn !== origin) {
        send(conn, payload);
      }
    }
  });

  awareness.on(
    'update',
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      const changedClients = [...added, ...updated, ...removed];
      if (origin instanceof WebSocket) {
        const controlled = conns.get(origin);
        if (controlled) {
          for (const clientId of added) controlled.add(clientId);
          for (const clientId of removed) controlled.delete(clientId);
        }
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
      );
      const payload = encoding.toUint8Array(encoder);

      for (const conn of conns.keys()) {
        send(conn, payload);
      }
    },
  );

  const room: CollabRoom = { name: roomName, doc, awareness, conns };
  rooms.set(roomName, room);
  return room;
}

function closeConnection(room: CollabRoom, ws: WebSocket): void {
  const controlledIds = room.conns.get(ws);
  if (!controlledIds) return;
  room.conns.delete(ws);
  awarenessProtocol.removeAwarenessStates(
    room.awareness,
    Array.from(controlledIds),
    null,
  );
}

function setupConnection(ws: WebSocket, roomName: string): void {
  const room = getOrCreateRoom(roomName);
  room.conns.set(ws, new Set());

  ws.binaryType = 'arraybuffer';

  ws.on('message', (raw: ArrayBuffer | Buffer) => {
    try {
      const data = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw);
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
        if (encoding.length(encoder) > 1) {
          send(ws, encoding.toUint8Array(encoder));
        }
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          room.awareness,
          decoding.readVarUint8Array(decoder),
          ws,
        );
      }
    } catch (err) {
      console.error('[collab] Failed to process WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    closeConnection(room, ws);
  });

  ws.on('error', () => {
    closeConnection(room, ws);
  });

  // Send initial SyncStep1
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, room.doc);
  send(ws, encoding.toUint8Array(syncEncoder));

  // Send existing awareness states
  const awarenessStates = room.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        room.awareness,
        Array.from(awarenessStates.keys()),
      ),
    );
    send(ws, encoding.toUint8Array(awarenessEncoder));
  }
}

/**
 * Attaches a Yjs WebSocket collaboration server on `/collab/:room` to the HTTP server.
 */
export function attachCollabWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const parsed = new URL(request.url ?? '/', 'http://localhost');
    if (!parsed.pathname.startsWith('/collab')) {
      return;
    }

    const roomName = decodeURIComponent(parsed.pathname.replace(/^\/collab\/?/, '') || 'default');
    wss.handleUpgrade(request, socket, head, (ws) => {
      setupConnection(ws, roomName);
    });
  });

  return wss;
}
