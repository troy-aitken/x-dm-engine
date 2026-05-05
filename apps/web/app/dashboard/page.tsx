'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type Campaign } from '../../lib/api';

function statusPill(status: Campaign['status']) {
  const base = 'inline-block rounded-full px-2 py-0.5 text-xs font-semibold';
  if (status === 'Active') return `${base} bg-green-500/20 text-green-300`;
  if (status === 'Paused') return `${base} bg-yellow-500/20 text-yellow-300`;
  return `${base} bg-zinc-500/20 text-zinc-300`;
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function daysUntil(s: string | null) {
  if (!s) return null;
  const delta = new Date(s).getTime() - Date.now();
  if (delta <= 0) return 'expired';
  const hrs = delta / (1000 * 60 * 60);
  if (hrs < 24) return `${Math.round(hrs)}h left`;
  return `${Math.round(hrs / 24)}d left`;
}

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);

  const [campaignName, setCampaignName] = useState('');
  const [tweetUrl, setTweetUrl] = useState('');
  const [dmMessage, setDmMessage] = useState('');
  const [owner, setOwner] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { campaigns } = await api.listCampaigns();
      setCampaigns(campaigns);
    } catch (err) {
      console.error('listCampaigns failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!campaignName.trim() || !tweetUrl.trim() || !dmMessage.trim() || !owner.trim()) {
      setFormError('All fields required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.startCampaign({
        campaignName: campaignName.trim(),
        tweetUrl: tweetUrl.trim(),
        dmMessage: dmMessage.trim(),
        owner: owner.trim(),
        durationDays,
      });
      setCampaignName('');
      setTweetUrl('');
      setDmMessage('');
      setDurationDays(7);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to start');
    } finally {
      setSubmitting(false);
    }
  }

  const sorted = [...campaigns].sort((a, b) => {
    const order = { Active: 0, Paused: 1, Done: 2 } as const;
    const s = order[a.status] - order[b.status];
    if (s !== 0) return s;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl gradient-text">x-dm-engine</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Drop a tweet URL + DM body. Auto-DMs new likers and repliers, dedup'd, with UTM-tagged links.
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('xdm_token');
            localStorage.removeItem('xdm_api');
            window.location.href = '/';
          }}
          className="text-xs text-zinc-500 hover:text-white"
        >
          Disconnect
        </button>
      </header>

      <section className="glass p-6 mb-8">
        <h2 className="text-lg mb-4 font-semibold">Start a new campaign</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Campaign name</label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Playbook Launch Wk1"
                className="w-full px-3 py-2 bg-black/40 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-zinc-500"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Owner (X account label)
              </label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="buzzlead_io"
                className="w-full px-3 py-2 bg-black/40 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-zinc-500"
                disabled={submitting}
              />
              <p className="text-xs text-zinc-500 mt-1">
                Must match an account you've connected via <code>npm run oauth</code>.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Tweet URL</label>
            <input
              type="url"
              value={tweetUrl}
              onChange={(e) => setTweetUrl(e.target.value)}
              placeholder="https://x.com/yourhandle/status/18020..."
              className="w-full px-3 py-2 bg-black/40 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-zinc-500"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">DM body</label>
            <textarea
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              rows={6}
              placeholder={
                'Hey! Saw you engaged with the post — here\'s the thing I promised:\n\nhttps://your-site.com/playbook'
              }
              className="w-full px-3 py-2 bg-black/40 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-zinc-500 font-mono"
              disabled={submitting}
            />
            <p className="text-xs text-zinc-500 mt-1">
              Any http(s) URL gets UTM-tagged automatically. Max 1000 chars.
            </p>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Duration</label>
            <select
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-full px-3 py-2 bg-black/40 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-zinc-500"
              disabled={submitting}
            >
              <option value={3}>3 days</option>
              <option value={7}>7 days (default)</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>

          {formError && <p className="text-sm text-red-400">{formError}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-50">
            {submitting ? 'Starting…' : `Start ${durationDays}-day campaign`}
          </button>
        </form>
      </section>

      <section className="glass p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Campaigns</h2>
          <button onClick={load} disabled={loading} className="text-sm text-zinc-400 hover:text-white">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="text-zinc-500 text-sm">No campaigns yet. Start one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-800">
                  <th className="py-2 px-2">Name</th>
                  <th className="py-2 px-2">Status</th>
                  <th className="py-2 px-2">Tweet</th>
                  <th className="py-2 px-2 text-right">DMs sent</th>
                  <th className="py-2 px-2">Expires</th>
                  <th className="py-2 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-900 hover:bg-white/5">
                    <td className="py-2 px-2 font-medium">{c.name}</td>
                    <td className="py-2 px-2">
                      <span className={statusPill(c.status)}>{c.status}</span>
                    </td>
                    <td className="py-2 px-2">
                      <a
                        href={c.tweetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        tweet ↗
                      </a>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{c.totalDMsSent}</td>
                    <td className="py-2 px-2">
                      <div>{fmtDate(c.expiresAt)}</div>
                      <div className="text-xs text-zinc-500">{daysUntil(c.expiresAt)}</div>
                    </td>
                    <td className="py-2 px-2 text-right space-x-3">
                      {c.status === 'Active' && (
                        <button
                          onClick={async () => {
                            if (!confirm('Stop this campaign?')) return;
                            await api.stopCampaign(c.id);
                            load();
                          }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Stop
                        </button>
                      )}
                      {c.status === 'Paused' && (
                        <button
                          onClick={async () => {
                            await api.resumeCampaign(c.id);
                            load();
                          }}
                          className="text-xs text-green-400 hover:text-green-300"
                        >
                          Resume
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
