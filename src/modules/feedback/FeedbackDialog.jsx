import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import {
  FEEDBACK_CATEGORIES,
  createFeedbackThread,
  listAllFeedbackThreads,
  listMyFeedbackThreads,
  markFeedbackThreadRead,
  sendFeedbackMessage,
} from './feedbackApi.js';

function messageTime(ms) {
  return new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function isUnread(thread, isAdmin) {
  return isAdmin ? thread.unreadByAdmin : thread.unreadByUser;
}

/**
 * Two-way feedback conversation, reached from ProfileMenu's "שלח משוב".
 * Everyone signed in can start a thread and reply to it; an admin sees
 * every user's threads instead of just their own, and replies as "admin".
 * Real Google sign-in is already required app-wide, so unlike some other
 * apps this doesn't need its own "sign in to send feedback" gate.
 */
export default function FeedbackDialog({ onClose }) {
  const { user, isAdmin } = useAuth();
  const [view, setView] = useState('list'); // 'list' | 'new' | 'thread'
  const [threads, setThreads] = useState(null);
  const [activeThread, setActiveThread] = useState(null);

  const [category, setCategory] = useState('general');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadThreads() {
    setThreads(null);
    const data = isAdmin ? await listAllFeedbackThreads() : await listMyFeedbackThreads(user.uid);
    setThreads(data);
  }

  async function openThread(thread) {
    setActiveThread(thread);
    setView('thread');
    if (isUnread(thread, isAdmin)) {
      await markFeedbackThreadRead(thread.id, isAdmin ? 'admin' : 'user');
      setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, [isAdmin ? 'unreadByAdmin' : 'unreadByUser']: false } : t)));
    }
  }

  async function handleCreate() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await createFeedbackThread({
        userId: user.uid,
        senderName: user.displayName,
        senderEmail: user.email,
        category,
        subject: subject.trim(),
        text: text.trim(),
        currentView: window.location.pathname,
      });
      setSubject('');
      setText('');
      setCategory('general');
      setView('list');
      await loadThreads();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply() {
    if (!replyText.trim() || !activeThread) return;
    setSending(true);
    try {
      const from = isAdmin ? 'admin' : 'user';
      await sendFeedbackMessage(activeThread.id, from, replyText.trim());
      const updatedMessages = [...activeThread.messages, { from, text: replyText.trim(), timestamp: Date.now() }];
      setActiveThread({ ...activeThread, messages: updatedMessages });
      setReplyText('');
    } finally {
      setSending(false);
    }
  }

  const categoryLabel = (value) => FEEDBACK_CATEGORIES.find((c) => c.value === value)?.label || value;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
            {view === 'thread' && (
              <button type="button" onClick={() => setView('list')} className="text-slate-400">
                ›
              </button>
            )}
            <span>💬</span> {view === 'thread' ? activeThread?.subject || categoryLabel(activeThread?.category) : 'משוב'}
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-xl leading-none text-slate-400">
            ✕
          </button>
        </div>

        {view === 'list' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3">
              {threads === null && <p className="text-sm text-slate-400">טוען...</p>}
              {threads?.length === 0 && <p className="text-sm text-slate-400">אין שיחות עדיין.</p>}
              <ul className="space-y-2">
                {threads?.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openThread(t)}
                      className="flex w-full items-start gap-2 rounded-xl border border-slate-200 p-3 text-start hover:bg-slate-50"
                    >
                      <span className="shrink-0">{categoryLabel(t.category).split(' ')[0]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-700">
                          {t.subject || t.messages?.[0]?.text || '(ללא נושא)'}
                        </span>
                        {isAdmin && <span className="block truncate text-xs text-slate-400">{t.senderName || t.senderEmail}</span>}
                        <span className="block text-xs text-slate-400">{t.messages?.length || 0} הודעות</span>
                      </span>
                      {isUnread(t, isAdmin) && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {!isAdmin && (
              <div className="border-t border-slate-100 p-3">
                <button
                  type="button"
                  onClick={() => setView('new')}
                  className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white"
                >
                  ➕ שיחה חדשה
                </button>
              </div>
            )}
          </div>
        )}

        {view === 'new' && (
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="flex gap-2">
              {FEEDBACK_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${
                    category === c.value ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <input
              className="input w-full"
              placeholder="נושא"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={100}
            />
            <textarea
              className="input w-full"
              rows={6}
              placeholder="ספר/י לנו מה חשבת..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={3000}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={submitting || !text.trim()}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? 'שולח...' : '📨 שליחה'}
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                disabled={submitting}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        {view === 'thread' && activeThread && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {activeThread.messages.map((m, i) => (
                <div key={i} className={`flex ${m.from === (isAdmin ? 'admin' : 'user') ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.from === 'admin' ? 'bg-blue-100 text-slate-800' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <p className="mb-0.5 text-[10px] text-slate-400">{m.from === 'admin' ? '👑' : '👤'} {messageTime(m.timestamp)}</p>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-slate-100 p-3">
              <input
                className="input flex-1"
                placeholder="הקלד/י תגובה..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleReply();
                }}
              />
              <button
                type="button"
                onClick={handleReply}
                disabled={sending || !replyText.trim()}
                className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                שליחה
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
