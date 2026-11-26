import React, { useState } from 'react';
import { Users, Check } from 'lucide-react';
import { COLLAB_COLOR_PALETTE, type CollabUser } from '../collab/useCollaboration.ts';

export interface UsernameModalProps {
  initialUser: CollabUser | null;
  roomId: string;
  isEditing?: boolean;
  onSubmit: (user: CollabUser) => void;
  onCancel?: () => void;
}

export const UsernameModal: React.FC<UsernameModalProps> = ({
  initialUser,
  roomId,
  isEditing = false,
  onSubmit,
  onCancel,
}) => {
  const [name, setName] = useState(initialUser?.name ?? '');
  const [color, setColor] = useState(
    initialUser?.color ?? COLLAB_COLOR_PALETTE[0],
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your name to join the document.');
      return;
    }
    onSubmit({ name: trimmed.slice(0, 32), color });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="username-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-800">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="username-modal-title"
              className="font-serif text-lg font-semibold text-slate-900"
            >
              {isEditing ? 'Update Display Name' : 'Join Collaborative Document'}
            </h2>
            <p className="text-xs text-slate-500">
              Room: <span className="font-mono text-slate-700">{roomId}</span>
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          Enter your name so teammates can see your live cursor and edits in real time.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="collab-username-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Your Name
            </label>
            <input
              id="collab-username-input"
              type="text"
              autoFocus
              maxLength={32}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Alex Rivera"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
            />
            {error ? (
              <p className="mt-1 text-xs text-red-600">{error}</p>
            ) : null}
          </div>

          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">
              Cursor Color
            </span>
            <div className="flex flex-wrap gap-2">
              {COLLAB_COLOR_PALETTE.map((swatch) => {
                const selected = color === swatch;
                return (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    aria-label={`Select color ${swatch}`}
                    className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform ${
                      selected ? 'scale-110 ring-2 ring-slate-900 ring-offset-2' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: swatch }}
                  >
                    {selected ? <Check className="h-3.5 w-3.5 text-white" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {isEditing && onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              className="rounded-lg bg-blue-800 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-900 transition-colors"
            >
              {isEditing ? 'Save Name' : 'Join Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
