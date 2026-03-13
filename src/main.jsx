import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';

/* ============================================================
   SUPABASE SETUP
   ============================================================ */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
console.log('SUPABASE URL:', JSON.stringify(supabaseUrl));
console.log('SUPABASE KEY START:', supabaseKey?.slice(0, 20));
const supabase = createClient(supabaseUrl || '', supabaseKey || '');

/* ============================================================
   DATABASE API
   ============================================================ */
async function getKandi(kandiId) {
  const { data, error } = await supabase.from('kandis').select('*').eq('kandi_id', kandiId).single();
  if (error) throw error;
  return data;
}

async function getAllKandis() {
  const { data, error } = await supabase.from('kandis').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getChain(kandiId) {
  const { data, error } = await supabase.from('claims').select('*').eq('kandi_id', kandiId).order('claimed_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function claimKandi({ kandiId, igHandle, eventName, city, message }) {
  const handle = igHandle.toLowerCase().replace('@', '');
  const { data: claim, error: claimError } = await supabase.from('claims').insert({
    kandi_id: kandiId, ig_handle: handle, event_name: eventName, city: city,message: message,
  }).select().single();
  if (claimError) throw claimError;

  const { data: existing } = await supabase.from('community').select('*').eq('ig_handle', handle).single();
  if (existing) {
    await supabase.from('community').update({ kandi_collected: existing.kandi_collected + 1 }).eq('ig_handle', handle);
  } else {
    await supabase.from('community').insert({ ig_handle: handle, kandi_collected: 1 });
  }
  return claim;
}

async function hasUserClaimed(kandiId, igHandle) {
  const handle = igHandle.toLowerCase().replace('@', '');
  const { data } = await supabase.from('claims').select('id').eq('kandi_id', kandiId).eq('ig_handle', handle).limit(1);
  return data && data.length > 0;
}

async function getCommunity() {
  const { data, error } = await supabase.from('community').select('*').order('kandi_collected', { ascending: false });
  if (error) throw error;
  return data;
}

async function getUserCollection(igHandle) {
  const handle = igHandle.toLowerCase().replace('@', '');
  const { data, error } = await supabase.from('claims').select('*, kandis(*)').eq('ig_handle', handle).order('claimed_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function uploadPhoto(file, claimId) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${claimId}_${Date.now()}.${fileExt}`;
  const filePath = `rave-photos/${fileName}`;
  const { error: uploadError } = await supabase.storage.from('photos').upload(filePath, file);
  if (uploadError) throw uploadError;
  const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(filePath);
  await supabase.from('claims').update({ photo_url: publicUrl }).eq('id', claimId);
  return publicUrl;
}

/* ============================================================
   SHARED COMPONENTS
   ============================================================ */
function BeadString({ colors = [], size = 10, glow = false }) {
  const beads = [...colors, ...colors, ...colors].slice(0, 7);
  return (
    <div style={{ display: 'flex', gap: size * 0.3, alignItems: 'center', justifyContent: 'center' }}>
      {beads.map((c, i) => (
        <div key={i} style={{
          width: size, height: size, borderRadius: '50%', background: c,
          boxShadow: glow ? `0 0 ${size}px ${c}80` : 'none',
          animation: glow ? `kdPulse ${1.5 + i * 0.2}s ease-in-out infinite` : 'none',
        }} />
      ))}
    </div>
  );
}

function Neon({ children, color = '#00f5d4', size = '1rem', as: Tag = 'span', style = {} }) {
  return (
    <Tag style={{
      fontFamily: "'Permanent Marker', cursive", fontSize: size, color,
      textShadow: `0 0 10px ${color}60, 0 0 30px ${color}30, 0 0 60px ${color}15`,
      margin: 0, ...style,
    }}>{children}</Tag>
  );
}

function Field({ value, onChange, placeholder, mb = '0.7rem' }) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: '100%', background: '#07070f', border: '1px solid #1a1a30',
        borderRadius: '12px', padding: '0.85rem 1rem', color: '#fff',
        fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.85rem',
        marginBottom: mb, boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s',
      }}
      onFocus={e => e.target.style.borderColor = '#7b2ff7'}
      onBlur={e => e.target.style.borderColor = '#1a1a30'}
    />
  );
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', color: '#7b2ff7',
      fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.8rem',
      cursor: 'pointer', padding: 0, marginBottom: '1.5rem',
    }}>← back</button>
  );
}

function Loader() {
  return (
    <div style={{ textAlign: 'center', padding: '3rem' }}>
      <div style={{
        width: 30, height: 30, border: '3px solid #7b2ff730',
        borderTopColor: '#7b2ff7', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ color: '#444', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.75rem' }}>loading...</div>
    </div>
  );
}

function Avatar({ handle, size = 44, border = '2px solid #1a1a2a', glow = false, style = {} }) {
  return (
    <img src={`https://i.pravatar.cc/150?u=${handle}`} alt={`@${handle}`} style={{
      width: size, height: size, borderRadius: '50%', objectFit: 'cover',
      border, background: '#0d0d18',
      boxShadow: glow ? `0 0 15px ${border.split(' ').pop()}40` : 'none',
      ...style,
    }} />
  );
}

function Page({ children, style = {} }) {
  return (
    <div style={{ minHeight: '100vh', background: '#07070f', padding: '1.5rem', maxWidth: '430px', margin: '0 auto', ...style }}>
      {children}
    </div>
  );
}

function timeAgo(d) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}yr ago`;
}

/* ============================================================
   SPLASH
   ============================================================ */
function Splash() {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { setTimeout(() => setShow(true), 100); }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 30% 20%, #1a0030 0%, #0a0a12 50%, #000 100%)',
      padding: '2rem', textAlign: 'center', opacity: show ? 1 : 0, transition: 'opacity 1s ease',
      position: 'relative', overflow: 'hidden',
    }}>
      {[...Array(14)].map((_, i) => (
        <div key={i} style={{
          position: 'absolute', width: 3 + (i % 5), height: 3 + (i % 5), borderRadius: '50%',
          background: ['#ff006e', '#00f5d4', '#7b2ff7', '#fee440'][i % 4], opacity: 0.35,
          left: `${10 + (i * 7) % 80}%`, top: `${5 + (i * 13) % 90}%`,
          animation: `kdFloat ${3 + (i % 4)}s ease-in-out infinite`,
          animationDelay: `${(i * 0.5) % 3}s`,
        }} />
      ))}
      <div style={{ marginBottom: '1.5rem' }}>
        <BeadString colors={['#ff006e', '#00f5d4', '#fee440', '#7b2ff7']} size={16} glow />
      </div>
      <Neon color="#ff006e" size="3.2rem" as="h1" style={{ margin: '0 0 0.2rem 0', letterSpacing: '-1px' }}>KandiDrop</Neon>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#666', fontSize: '0.8rem', marginBottom: '0.3rem', letterSpacing: '3px', textTransform: 'uppercase' }}>
        every bead has a story
      </p>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#3a3a4a', fontSize: '0.72rem', marginBottom: '3rem', maxWidth: '260px', lineHeight: 1.6 }}>
        scan kandi · see its journey<br />connect with the last soul who wore it
      </p>
      <button onClick={() => navigate('/browse')} style={{
        background: 'transparent', border: '2px solid #ff006e', borderRadius: '60px', padding: '1rem 3rem',
        color: '#ff006e', fontSize: '1rem', fontFamily: "'Permanent Marker', cursive", cursor: 'pointer',
        boxShadow: '0 0 20px #ff006e30, inset 0 0 20px #ff006e10', transition: 'all 0.3s', letterSpacing: '1px',
      }}
        onMouseEnter={e => { e.currentTarget.style.background = '#ff006e15'; e.currentTarget.style.boxShadow = '0 0 40px #ff006e40, inset 0 0 30px #ff006e15'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = '0 0 20px #ff006e30, inset 0 0 20px #ff006e10'; }}
      >SCAN KANDI →</button>
    </div>
  );
}

/* ============================================================
   BROWSE
   ============================================================ */
function Browse() {
  const [kandis, setKandis] = useState([]);
  const [chains, setChains] = useState({});
  const [loading, setLoading] = useState(true);
   const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const currentUser = window.__kd_user || null;

  useEffect(() => { loadKandis(); }, []);

  async function loadKandis() {
    try {
      const data = await getAllKandis();
      setKandis(data || []);
      const cd = {};
      for (const k of (data || [])) {
        try { cd[k.kandi_id] = await getChain(k.kandi_id) || []; } catch { cd[k.kandi_id] = []; }
      }
      setChains(cd);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  if (loading) return <Page><Loader /></Page>;

  return (
    <Page>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <Neon color="#ff006e" size="1.5rem">KandiDrop</Neon>
        {currentUser && <Avatar handle={currentUser} size={30} border="2px solid #7b2ff7" />}
      </div>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#444', fontSize: '0.7rem', marginBottom: '1.5rem', letterSpacing: '2px', textTransform: 'uppercase' }}>
        ⟐ scan a kandi or browse
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginBottom: '2rem' }}>
        {kandis.map((k) => {
          const chain = chains[k.kandi_id] || [];
          const n = chain.length;
          const colors = k.bead_colors || ['#ff006e', '#00f5d4', '#7b2ff7'];
          return (
            <button key={k.id} onClick={() => navigate(`/k/${k.kandi_id}`)} style={{
              background: 'linear-gradient(135deg, #0d0d18, #12121f)', border: '1px solid #18182a',
              borderRadius: '16px', padding: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.8rem',
              cursor: 'pointer', transition: 'all 0.25s', textAlign: 'left', width: '100%',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#7b2ff735'; e.currentTarget.style.boxShadow = '0 0 25px #7b2ff710'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#18182a'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ width: 46, flexShrink: 0 }}><BeadString colors={colors} size={7} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#ddd', fontFamily: "'Permanent Marker', cursive", fontSize: '0.95rem' }}>{k.name}</div>
                <div style={{ color: '#444', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem', marginTop: '3px' }}>
                  {n === 0 ? '✨ unclaimed — be the first' : `${n} soul${n > 1 ? 's' : ''} deep`}
                </div>
              </div>
              {n > 0 && (
                <div style={{ display: 'flex' }}>
                  {chain.slice(-3).map((h, i) => (
                    <Avatar key={i} handle={h.ig_handle} size={26} border="2px solid #07070f" style={{ marginLeft: i > 0 ? '-8px' : 0 }} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        {currentUser && (
          <button onClick={() => navigate('/collection')} style={{
            flex: 1, background: 'linear-gradient(135deg, #150025, #0d0d18)', border: '1px solid #7b2ff725',
            borderRadius: '14px', padding: '1rem', color: '#7b2ff7', fontFamily: "'Permanent Marker', cursive", fontSize: '0.85rem', cursor: 'pointer',
          }}>🎒 My Kandi</button>
        )}
        <button onClick={() => navigate('/community')} style={{
          flex: 1, background: 'linear-gradient(135deg, #001515, #0d0d18)', border: '1px solid #00f5d425',
          borderRadius: '14px', padding: '1rem', color: '#00f5d4', fontFamily: "'Permanent Marker', cursive", fontSize: '0.85rem', cursor: 'pointer',
        }}>👥 The Fam</button>
      </div>
    </Page>
  );
}

/* ============================================================
   JOURNEY (QR code lands here!)
   ============================================================ */
function Journey() {
  const { kandiId } = useParams();
  const navigate = useNavigate();
  const [kandi, setKandi] = useState(null);
  const [chain, setChain] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [ig, setIg] = useState('');
  const [ev, setEv] = useState('');
  const [city, setCity] = useState('');
  const [message, setMessage] = useState('');
   const [photoFile, setPhotoFile] = useState(null);
  const [copied, setCopied] = useState(false); 
  const [error, setError] = useState(null);
  const currentUser = window.__kd_user || null;

  useEffect(() => { loadData(); }, [kandiId]);

  async function loadData() {
    try {
      setLoading(true);
      const [kd, ch] = await Promise.all([getKandi(kandiId), getChain(kandiId)]);
      setKandi(kd); setChain(ch || []);
      if (currentUser) setAlreadyClaimed(await hasUserClaimed(kandiId, currentUser));
    } catch (err) {   console.error(err);   setError(err?.message || JSON.stringify(err) || 'Kandi not found'); } finally {   setLoading(false); }
  }

  async function handleClaim() {
    if (!ig.trim()) return;
    setClaiming(true);
    try {
      await claimKandi({
  kandiId,
  igHandle: ig.trim(),
  eventName: ev.trim() || 'Unknown Event',
  city: city.trim() || 'Unknown',
  message: message.trim()
});
      const handle = ig.trim().toLowerCase().replace('@', '');
      window.__kd_user = handle;
      setShowForm(false); setIg(''); setEv(''); setCity(''); setMessage('');
      await loadData();
    } catch (err) { console.error(err); setError('Failed to claim. Try again.'); } finally { setClaiming(false); }
  }

  if (loading) return <Page><Loader /></Page>;
  if (error && !kandi) return (
    <Page>
      <Neon color="#ff006e" size="1.3rem" as="h2">{error}</Neon>
      <p style={{ color: '#444', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.8rem', marginTop: '1rem' }}>This kandi ID doesn't exist yet.</p>
      <button onClick={() => navigate('/browse')} style={{ marginTop: '1rem', background: 'none', border: '1px solid #7b2ff7', borderRadius: '12px', padding: '0.7rem 1.5rem', color: '#7b2ff7', fontFamily: "'IBM Plex Mono', monospace", cursor: 'pointer' }}>Browse all kandi</button>
    </Page>
  );

  const last = chain.length > 0 ? chain[chain.length - 1] : null;
  const colors = kandi.bead_colors || ['#ff006e', '#00f5d4', '#7b2ff7'];
  const cities = [...new Set(chain.map(c => c.city).filter(Boolean))];
  const daysAlive = chain.length > 0 ? Math.ceil((Date.now() - new Date(kandi.created_at).getTime()) / 86400000) : 0;

  return (
    <Page>
      <BackBtn onClick={() => navigate('/browse')} />

      {/* Hero */}
      <div className="fade-up" style={{
        background: 'linear-gradient(145deg, #0d0d18, #1a0030)', borderRadius: '24px', padding: '2rem',
        textAlign: 'center', border: '1px solid #7b2ff718', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', background: `radial-gradient(circle at 50% 80%, ${colors[0]}08 0%, transparent 50%)`, pointerEvents: 'none' }} />
        <div style={{ marginBottom: '0.8rem' }}><BeadString colors={colors} size={14} glow /></div>
        <Neon color="#fff" size="1.6rem" as="h2" style={{ margin: '0 0 0.3rem 0' }}>{kandi.name}</Neon>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#3a3a4a', fontSize: '0.65rem' }}>{kandi.kandi_id} · dropped {timeAgo(kandi.created_at)}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2.5rem', marginTop: '1.2rem' }}>
          {[{ val: chain.length, label: 'souls', color: '#ff006e' }, { val: cities.length, label: 'cities', color: '#00f5d4' }, { val: daysAlive, label: 'days', color: '#fee440' }].map((s, i) => (
            <div key={i}><Neon color={s.color} size="1.8rem">{s.val}</Neon><div style={{ color: '#3a3a4a', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', marginTop: '2px' }}>{s.label}</div></div>
          ))}
        </div>
      </div>

      {/* Last Holder */}
      {last && (
        <div className="fade-up" style={{
          background: 'linear-gradient(135deg, #18002e, #0a1828)', borderRadius: '20px', padding: '1.5rem',
          marginBottom: '1.5rem', border: '1px solid #ff006e18', textAlign: 'center',
        }}>
          <div style={{ color: '#555', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '1rem' }}>⟐ last soul to hold this</div>
          <Avatar handle={last.ig_handle} size={88} border="3px solid #ff006e" glow style={{ marginBottom: '0.8rem' }} />
          <a href={`https://instagram.com/${last.ig_handle}`} target="_blank" rel="noopener noreferrer" style={{ color: '#ff006e', fontFamily: "'Permanent Marker', cursive", fontSize: '1.2rem', textDecoration: 'none', display: 'block' }}>@{last.ig_handle}</a>
          <div style={{ color: '#3a3a4a', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.65rem', marginTop: '4px' }}>{last.event_name} · {last.city} · {timeAgo(last.claimed_at)}</div>
          <a href={`https://instagram.com/${last.ig_handle}`} target="_blank" rel="noopener noreferrer" style={{
            display: 'inline-block', marginTop: '0.8rem', background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)',
            borderRadius: '10px', padding: '0.5rem 1.5rem', color: '#fff', fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 700, fontSize: '0.72rem', textDecoration: 'none', letterSpacing: '1px',
         }}}>CONNECT ON IG →</a>
<button
  onClick={async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }}
  style={{
    marginTop: '0.6rem',
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: '12px',
    padding: '0.5rem 0.8rem',
    color: '#aaa',
    fontSize: '0.7rem',
    cursor: 'pointer'
  }}
>
  {copied ? 'Copied!' : 'Copy kandi link'}
</button>
        </div>
      )}

      {/* Map */}
      {chain.length > 1 && (
        <>
          <button onClick={() => setShowMap(!showMap)} style={{
            width: '100%', background: 'linear-gradient(135deg, #0d0d18, #0a1515)', border: '1px solid #00f5d418',
            borderRadius: '14px', padding: '0.9rem', color: '#00f5d4', fontFamily: "'Permanent Marker', cursive",
            fontSize: '0.85rem', cursor: 'pointer', marginBottom: '1.5rem',
          }}>{showMap ? '▾' : '▸'} JOURNEY MAP — {cities.length} cit{cities.length === 1 ? 'y' : 'ies'}</button>
          {showMap && (
            <div style={{ background: '#0a0a14', borderRadius: '16px', padding: '1.2rem', border: '1px solid #18182a', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                {chain.map((stop, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ background: '#0d0d18', border: `2px solid ${colors[i % colors.length]}`, borderRadius: '12px', padding: '0.5rem 0.7rem', textAlign: 'center', boxShadow: `0 0 12px ${colors[i % colors.length]}15` }}>
                      <Avatar handle={stop.ig_handle} size={30} border={`2px solid ${colors[i % colors.length]}`} style={{ display: 'block', margin: '0 auto 0.25rem' }} />
                      <div style={{ color: '#ccc', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.55rem', fontWeight: 700 }}>{stop.city}</div>
                      <div style={{ color: '#3a3a4a', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.45rem' }}>{stop.event_name}</div>
                    </div>
                    {i < chain.length - 1 && <div style={{ color: colors[(i + 1) % colors.length], fontSize: '1rem', opacity: 0.4 }}>→</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Timeline */}
      {chain.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ color: '#444', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '1rem' }}>⟐ full journey</div>
          {[...chain].reverse().map((h, i) => (
            <div key={h.id || i} style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', opacity: 1 - i * 0.07 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '48px', flexShrink: 0 }}>
                <Avatar handle={h.ig_handle} size={42} border={i === 0 ? '2px solid #ff006e' : '2px solid #1a1a2a'} glow={i === 0} />
                {i < chain.length - 1 && <div style={{ width: 2, flex: 1, background: '#15152a', minHeight: '18px' }} />}
              </div>
              <div style={{ paddingBottom: '1.1rem', paddingTop: '0.2rem' }}>
                <a href={`https://instagram.com/${h.ig_handle}`} target="_blank" rel="noopener noreferrer" style={{ color: '#bbb', fontFamily: "'Permanent Marker', cursive", fontSize: '0.88rem', textDecoration: 'none' }}>@{h.ig_handle}</a>
                <div style={{ color: '#3a3a4a', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', marginTop: '3px' }}>{h.event_name} · {h.city} · {timeAgo(h.claimed_at)}</div>
                 {h.message && (
  <div style={{
    marginTop: '4px',
    fontSize: '0.75rem',
    opacity: 0.85,
    fontStyle: 'italic'
  }}>
    “{h.message}”
  </div>
)}
                {h.photo_url && <img src={h.photo_url} alt="" style={{ width: '100%', maxWidth: '250px', height: '120px', objectFit: 'cover', borderRadius: '10px', marginTop: '0.5rem', border: '1px solid #1a1a2a' }} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Claim */}
      {!showForm ? (
        <button onClick={() => !alreadyClaimed && setShowForm(true)} disabled={alreadyClaimed} style={{
          width: '100%', background: alreadyClaimed ? '#0d0d18' : 'transparent',
          border: alreadyClaimed ? '1px solid #18182a' : '2px solid #ff006e', borderRadius: '16px', padding: '1.1rem',
          color: alreadyClaimed ? '#333' : '#ff006e', fontFamily: "'Permanent Marker', cursive", fontSize: '1rem',
          cursor: alreadyClaimed ? 'default' : 'pointer', boxShadow: alreadyClaimed ? 'none' : '0 0 20px #ff006e18', letterSpacing: '1px',
        }}>
          {alreadyClaimed ? "✓ you've held this kandi" : chain.length === 0 ? '✨ BE THE FIRST SOUL' : '🤝 CLAIM THIS KANDI'}
        </button>
      ) : (
        <div style={{ background: '#0a0a14', borderRadius: '20px', padding: '1.5rem', border: '1px solid #7b2ff725' }}>
          <Neon color="#7b2ff7" size="1rem" style={{ display: 'block', marginBottom: '1rem' }}>claim this kandi</Neon>
          <Field value={ig} onChange={setIg} placeholder="@your_instagram" />
          <Field value={ev} onChange={setEv} placeholder="Event (e.g. EDC, Coachella)" />
          <Field value={city} onChange={setCity} placeholder="City" mb="1rem" />
          <Field value={message} onChange={setMessage} placeholder="Drop your message 💜" mb="1rem" />
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <button onClick={() => setShowForm(false)} style={{ flex: 1, background: '#0d0d18', border: '1px solid #18182a', borderRadius: '12px', padding: '0.8rem', color: '#444', fontFamily: "'IBM Plex Mono', monospace", cursor: 'pointer' }}>cancel</button>
            <button onClick={handleClaim} disabled={claiming} style={{
              flex: 2, background: 'transparent', border: '2px solid #ff006e', borderRadius: '12px', padding: '0.8rem',
              color: '#ff006e', fontFamily: "'Permanent Marker', cursive", fontSize: '1rem', cursor: 'pointer',
              boxShadow: '0 0 12px #ff006e18', opacity: claiming ? 0.5 : 1,
            }}>{claiming ? 'DROPPING...' : 'DROP IT 🔥'}</button>
          </div>
        </div>
      )}
    </Page>
  );
}

/* ============================================================
   COLLECTION
   ============================================================ */
function Collection() {
  const navigate = useNavigate();
  const currentUser = window.__kd_user || null;
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState(null);

  useEffect(() => {
    if (!currentUser) { navigate('/browse'); return; }
    loadCollection();
  }, [currentUser]);

  async function loadCollection() {
    try { setClaims(await getUserCollection(currentUser) || []); } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  async function handlePhoto(claimId, file) {
    try { setUploadingFor(claimId); await uploadPhoto(file, claimId); await loadCollection(); } catch (err) { console.error(err); } finally { setUploadingFor(null); }
  }

  if (loading) return <Page><Loader /></Page>;

  return (
    <Page>
      <BackBtn onClick={() => navigate('/browse')} />
      <Neon color="#7b2ff7" size="1.5rem" as="h2" style={{ margin: '0 0 0.3rem 0' }}>My Kandi</Neon>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#3a3a4a', fontSize: '0.7rem', marginBottom: '2rem' }}>@{currentUser} · {claims.length} kandi collected</p>

      {claims.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', border: '1px dashed #18182a', borderRadius: '20px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤲</div>
          <Neon color="#444" size="1rem">no kandi yet</Neon>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#2a2a3a', fontSize: '0.7rem', marginTop: '0.5rem' }}>scan your first QR code at a rave!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {claims.map((claim) => {
            const k = claim.kandis;
            const colors = k?.bead_colors || ['#ff006e', '#00f5d4', '#7b2ff7'];
            return (
              <div key={claim.id} style={{ background: 'linear-gradient(135deg, #0d0d18, #150025)', borderRadius: '20px', overflow: 'hidden', border: '1px solid #7b2ff712', cursor: 'pointer' }}
                onClick={() => navigate(`/k/${claim.kandi_id}`)}>
                {claim.photo_url ? (
                  <div style={{ position: 'relative' }}>
                    <img src={claim.photo_url} alt="" style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, #0d0d18ee)', padding: '2rem 1rem 0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <BeadString colors={colors} size={6} />
                        <span style={{ color: '#ddd', fontFamily: "'Permanent Marker', cursive", fontSize: '1rem' }}>{k?.name || claim.kandi_id}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '1.2rem 1.2rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
                      <BeadString colors={colors} size={8} />
                      <div style={{ flex: 1 }}><div style={{ color: '#ddd', fontFamily: "'Permanent Marker', cursive", fontSize: '1rem' }}>{k?.name || claim.kandi_id}</div></div>
                    </div>
                  </div>
                )}
                <div style={{ padding: '0.8rem 1.2rem 1.2rem' }}>
                  <div style={{ color: '#3a3a4a', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.62rem', marginBottom: '0.7rem' }}>{claim.event_name} · {claim.city} · {timeAgo(claim.claimed_at)}</div>
                  {!claim.photo_url && (
                    <button onClick={(e) => {
                      e.stopPropagation();
                      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
                      input.onchange = (ev) => { if (ev.target.files[0]) handlePhoto(claim.id, ev.target.files[0]); };
                      input.click();
                    }} style={{
                      width: '100%', background: '#07070f', border: '1px dashed #7b2ff725', borderRadius: '12px',
                      padding: '1rem', color: '#7b2ff7', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.72rem',
                      cursor: 'pointer', marginBottom: '0.7rem', opacity: uploadingFor === claim.id ? 0.5 : 1,
                    }}>{uploadingFor === claim.id ? 'uploading...' : '📸 add your rave moment'}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

/* ============================================================
   COMMUNITY
   ============================================================ */
function CommunityPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadCommunity(); }, []);
  async function loadCommunity() {
    try { setMembers(await getCommunity() || []); } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  if (loading) return <Page><Loader /></Page>;

  return (
    <Page>
      <BackBtn onClick={() => navigate('/browse')} />
      <Neon color="#00f5d4" size="1.5rem" as="h2" style={{ margin: '0 0 0.3rem 0' }}>The Fam</Neon>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#3a3a4a', fontSize: '0.7rem', marginBottom: '2rem' }}>{members.length} souls connected through kandi</p>

      {members.map((m, i) => (
        <div key={m.ig_handle} style={{
          display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.85rem', borderRadius: '14px', marginBottom: '0.35rem',
          background: i < 3 ? 'linear-gradient(135deg, #0d0d18, #12121f)' : 'transparent',
          border: i < 3 ? '1px solid #18182a' : '1px solid transparent',
        }}>
          <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '0.85rem', width: '26px', textAlign: 'center', color: i === 0 ? '#fee440' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#1a1a2a' }}>
            {i < 3 ? ['👑', '🥈', '🥉'][i] : `${i + 1}`}
          </div>
          <Avatar handle={m.ig_handle} size={48} border={i === 0 ? '2px solid #fee440' : '2px solid #15152a'} glow={i === 0} />
          <div style={{ flex: 1 }}>
            <a href={`https://instagram.com/${m.ig_handle}`} target="_blank" rel="noopener noreferrer" style={{ color: '#ccc', fontFamily: "'Permanent Marker', cursive", fontSize: '0.88rem', textDecoration: 'none' }}>@{m.ig_handle}</a>
            <div style={{ color: '#2a2a3a', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.58rem', marginTop: '2px' }}>joined {timeAgo(m.created_at)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Neon color="#ff006e" size="1.1rem">{m.kandi_collected}</Neon>
            <div style={{ color: '#2a2a3a', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.5rem' }}>kandi</div>
          </div>
        </div>
      ))}
    </Page>
  );
}

/* ============================================================
   QR SCANNER
   ============================================================ */
function QRScanner() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState(null);
  const [manualId, setManualId] = useState('');
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        streamRef.current = stream;
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          requestAnimationFrame(scanFrame);
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError('Camera access denied or unavailable. You can enter a kandi ID manually below.');
        setScanning(false);
      }
    }

    function scanFrame() {
      if (!active || !videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // Use BarcodeDetector API if available (Chrome, Edge, Android)
          if ('BarcodeDetector' in window) {
            const detector = new BarcodeDetector({ formats: ['qr_code'] });
            detector.detect(video).then(barcodes => {
              if (barcodes.length > 0 && active) {
                const url = barcodes[0].rawValue;
                handleScanResult(url);
                return;
              }
              if (active) animFrameRef.current = requestAnimationFrame(scanFrame);
            }).catch(() => {
              if (active) animFrameRef.current = requestAnimationFrame(scanFrame);
            });
          } else {
            // Fallback: check every 500ms with BarcodeDetector not available message
            setError('Your browser doesn\'t support camera scanning. Enter a kandi ID manually below, or try opening this page in Chrome.');
            setScanning(false);
          }
        } catch (e) {
          if (active) animFrameRef.current = requestAnimationFrame(scanFrame);
        }
      } else {
        if (active) animFrameRef.current = requestAnimationFrame(scanFrame);
      }
    }

    startCamera();

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  function handleScanResult(url) {
    setScanning(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    // Extract kandi ID from URL
    const match = url.match(/\/k\/(KD-\d+)/i) || url.match(/(KD-\d+)/i);
    if (match) {
      navigate(`/k/${match[1].toUpperCase()}`);
    } else {
      // Try to open the URL directly if it's a KandiDrop link
      if (url.includes('kandidrop')) {
        const parts = url.split('/k/');
        if (parts[1]) {
          navigate(`/k/${parts[1].split('/')[0].split('?')[0].toUpperCase()}`);
          return;
        }
      }
      setError(`Scanned: "${url}" — doesn't look like a KandiDrop code. Try another one.`);
      setScanning(true);
    }
  }

  function handleManualSubmit() {
    const id = manualId.trim().toUpperCase();
    if (id) {
      const formatted = id.startsWith('KD-') ? id : `KD-${id.replace(/\D/g, '').padStart(4, '0')}`;
      navigate(`/k/${formatted}`);
    }
  }

  return (
    <Page style={{ padding: 0, position: 'relative' }}>
      {/* Back button */}
      <button onClick={() => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        navigate('/browse');
      }} style={{
        position: 'absolute', top: '1rem', left: '1rem', zIndex: 20,
        background: '#0007', border: 'none', color: '#fff', borderRadius: '50%',
        width: 40, height: 40, fontSize: '1.2rem', cursor: 'pointer',
        backdropFilter: 'blur(10px)',
      }}>✕</button>

      {/* Camera view */}
      {scanning && (
        <div style={{ position: 'relative', width: '100%', height: '60vh', overflow: 'hidden', background: '#000' }}>
          <video ref={videoRef} style={{
            width: '100%', height: '100%', objectFit: 'cover',
          }} playsInline muted />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Scan overlay */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: '220px', height: '220px', position: 'relative',
            }}>
              {/* Corner brackets */}
              {[[0,0],[1,0],[0,1],[1,1]].map(([x,y], i) => (
                <div key={i} style={{
                  position: 'absolute',
                  [y === 0 ? 'top' : 'bottom']: -2,
                  [x === 0 ? 'left' : 'right']: -2,
                  width: 30, height: 30,
                  borderTop: y === 0 ? '3px solid #ff006e' : 'none',
                  borderBottom: y === 1 ? '3px solid #ff006e' : 'none',
                  borderLeft: x === 0 ? '3px solid #ff006e' : 'none',
                  borderRight: x === 1 ? '3px solid #ff006e' : 'none',
                  boxShadow: '0 0 15px #ff006e40',
                }} />
              ))}
              {/* Scanning line animation */}
              <div style={{
                position: 'absolute', left: 0, right: 0, height: '2px',
                background: 'linear-gradient(90deg, transparent, #ff006e, transparent)',
                boxShadow: '0 0 10px #ff006e',
                animation: 'scanLine 2s ease-in-out infinite',
              }} />
            </div>
          </div>

          {/* Label */}
          <div style={{
            position: 'absolute', bottom: '1.5rem', left: 0, right: 0, textAlign: 'center',
          }}>
            <div style={{
              display: 'inline-block', background: '#000a', backdropFilter: 'blur(10px)',
              borderRadius: '12px', padding: '0.6rem 1.2rem',
              color: '#fff', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.75rem',
            }}>
              Point camera at a KandiDrop QR code
            </div>
          </div>
        </div>
      )}

      {/* Bottom section */}
      <div style={{ padding: '1.5rem', background: '#07070f' }}>
        {error && (
          <div style={{
            background: '#1a0020', borderRadius: '12px', padding: '1rem',
            border: '1px solid #ff006e20', marginBottom: '1rem',
          }}>
            <p style={{ color: '#ff006e', fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.75rem', margin: 0 }}>
              {error}
            </p>
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <Neon color="#7b2ff7" size="0.9rem" style={{ display: 'block', marginBottom: '0.8rem' }}>
            or enter kandi ID manually
          </Neon>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <Field value={manualId} onChange={setManualId} placeholder="KD-0001" mb="0" />
            <button onClick={handleManualSubmit} style={{
              background: 'transparent', border: '2px solid #ff006e', borderRadius: '12px',
              padding: '0 1.2rem', color: '#ff006e', fontFamily: "'Permanent Marker', cursive",
              fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>GO</button>
          </div>
        </div>

        <button onClick={() => {
          if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
          navigate('/browse');
        }} style={{
          width: '100%', background: 'linear-gradient(135deg, #0d0d18, #12121f)',
          border: '1px solid #18182a', borderRadius: '14px', padding: '1rem',
          color: '#00f5d4', fontFamily: "'Permanent Marker', cursive", fontSize: '0.85rem', cursor: 'pointer',
        }}>📋 Browse all kandi instead</button>
      </div>

      <style>{`
        @keyframes scanLine {
          0% { top: 0; }
          50% { top: calc(100% - 2px); }
          100% { top: 0; }
        }
      `}</style>
    </Page>
  );
}

/* ============================================================
   APP + RENDER
   ============================================================ */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/scan" element={<QRScanner />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/k/:kandiId" element={<Journey />} />
        <Route path="/collection" element={<Collection />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

// Global user state (simple, no localStorage needed)
window.__kd_user = null;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
