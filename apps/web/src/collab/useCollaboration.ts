import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface CollabUser {
  name: string;
  color: string;
}

export interface CollaboratorPresence {
  clientId: number;
  name: string;
  color: string;
  isLocal: boolean;
}

export type CollabConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export const COLLAB_COLOR_PALETTE = [
  '#2563eb', // blue
  '#dc2626', // red
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // violet
  '#db2777', // pink
  '#0891b2', // cyan
  '#4f46e5', // indigo
];

export function pickRandomCollabColor(): string {
  return COLLAB_COLOR_PALETTE[Math.floor(Math.random() * COLLAB_COLOR_PALETTE.length)];
}

export function getRoomIdFromUrl(): string {
  if (typeof window === 'undefined') return 'crystal-docpad-main';
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room')?.trim();
  return raw && raw.length > 0 ? raw : 'crystal-docpad-main';
}

function getCollabWebSocketBaseUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000/collab';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/collab`;
}

/**
 * Manages the Yjs document, WebSocket provider, and live collaborator awareness state.
 */
export function useCollaboration(roomId: string, user: CollabUser | null) {
  const [status, setStatus] = useState<CollabConnectionStatus>('connecting');
  const [syncedRoomId, setSyncedRoomId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const synced = syncedRoomId === roomId;

  const { ydoc, provider } = useMemo(() => {
    const doc = new Y.Doc();
    const wsProvider = new WebsocketProvider(getCollabWebSocketBaseUrl(), roomId, doc);
    return { ydoc: doc, provider: wsProvider };
  }, [roomId]);

  useEffect(() => {
    setStatus('connecting');
    setSyncedRoomId(null);

    const handleStatus = ({ status: nextStatus }: { status: string }) => {
      if (nextStatus === 'connected') setStatus('connected');
      else if (nextStatus === 'disconnected') setStatus('disconnected');
      else setStatus('connecting');
    };

    const handleSync = (isSynced: boolean) => {
      setSyncedRoomId(isSynced ? roomId : null);
    };

    const syncAwarenessList = () => {
      const states = provider.awareness.getStates();
      const localId = provider.awareness.clientID;
      const list: CollaboratorPresence[] = [];

      states.forEach((state, clientId) => {
        const u = state?.user as { name?: string; color?: string } | undefined;
        if (u?.name) {
          list.push({
            clientId,
            name: u.name,
            color: u.color || COLLAB_COLOR_PALETTE[0],
            isLocal: clientId === localId,
          });
        }
      });

      list.sort((a, b) => (a.isLocal === b.isLocal ? a.name.localeCompare(b.name) : a.isLocal ? -1 : 1));
      setCollaborators(list);
    };

    provider.on('status', handleStatus);
    provider.on('sync', handleSync);
    provider.awareness.on('change', syncAwarenessList);
    syncAwarenessList();

    return () => {
      provider.off('status', handleStatus);
      provider.off('sync', handleSync);
      provider.awareness.off('change', syncAwarenessList);
      provider.awareness.setLocalState(null);
      provider.destroy();
      ydoc.destroy();
    };
  }, [ydoc, provider]);

  useEffect(() => {
    if (user) {
      provider.awareness.setLocalStateField('user', {
        name: user.name,
        color: user.color,
      });
    }
  }, [provider, user]);

  return {
    ydoc,
    provider,
    status,
    synced,
    collaborators,
  };
}
