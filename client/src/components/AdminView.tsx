import { useEffect, useState } from 'react';
import { api } from '../socket/socketClient';
import { usePrinterSocket } from '../socket/usePrinterSocket';
import { soundManager } from '../audio/SoundManager';
import { BACKGROUND_PRESETS } from '../printer3d/backgroundManager';
import type { BackgroundConfig } from '../types';

const STATUS_LABEL = {
    disconnected: ['Chưa kết nối', '#94a3b8'],
    connecting: ['Đang kết nối…', '#fbbf24'],
    connected: ['Đã kết nối LIVE', '#10b981'],
    reconnecting: ['Đang nối lại…', '#fb923c'],
} as const;

const card: React.CSSProperties = {
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
};
const input: React.CSSProperties = {
    background: '#0b1220',
    border: '1px solid #334155',
    borderRadius: 8,
    color: '#e2e8f0',
    padding: '8px 10px',
    fontSize: 14,
    minWidth: 0,
};
const btn = (bg = '#2563eb'): React.CSSProperties => ({
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontWeight: 600,
    cursor: 'pointer',
});

const sim = (body: Record<string, unknown>) =>
    fetch(`${window.location.protocol}//${window.location.hostname}:3001/api/dev/tiktok/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
const rid = () => `viewer${Math.floor(Math.random() * 9999)}`;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AdminView() {
    const { isConnected, printerState, queueState, tiktokStatus, recentEvents } = usePrinterSocket();
    const [username, setUsername] = useState('');
    const [msg, setMsg] = useState('');
    const [gold, setGold] = useState(100);
    const [full, setFull] = useState(1000);
    const [giftMsg, setGiftMsg] = useState('');
    const [speed, setSpeed] = useState(1);

    const [bgmPlaying, setBgmPlaying] = useState(soundManager.getBgmPlaying());
    const [muted, setMuted] = useState(soundManager.isSoundMuted());
    const [bgmVol, setBgmVol] = useState(Math.round(soundManager.getBgmVolume() * 100));
    const [sfxVol, setSfxVol] = useState(Math.round(soundManager.getSfxVolume() * 100));

    // Cảnh nền & Sinh vật bay
    const [bgPreset, setBgPreset] = useState('mountain-mist');
    const [autoRotate, setAutoRotate] = useState(false);
    const [rotateInterval, setRotateInterval] = useState(5);
    const [showButterflies, setShowButterflies] = useState(true);
    const [showBirds, setShowBirds] = useState(true);
    const [bgMsg, setBgMsg] = useState('');

    useEffect(() => {
        api.getGiftConfig().then((c) => {
            setGold(c.goldDiamonds);
            setFull(c.fullPageDiamonds);
        }).catch(() => undefined);

        api.getBackgroundConfig().then((cfg) => {
            setBgPreset(cfg.presetId);
            setAutoRotate(cfg.autoRotate);
            setRotateInterval(cfg.intervalMinutes);
            setShowButterflies(cfg.showButterflies);
            setShowBirds(cfg.showBirds);
        }).catch(() => undefined);
    }, []);

    const updateBgConfig = async (patch: Partial<BackgroundConfig>) => {
        try {
            const res = await api.setBackgroundConfig(patch);
            setBgPreset(res.presetId);
            setAutoRotate(res.autoRotate);
            setRotateInterval(res.intervalMinutes);
            setShowButterflies(res.showButterflies);
            setShowBirds(res.showBirds);
            setBgMsg('Đã lưu & đồng bộ OBS ✔');
            setTimeout(() => setBgMsg(''), 2500);
        } catch (err) {
            setBgMsg(err instanceof Error ? err.message : 'Lỗi');
        }
    };

    useEffect(() => {
        if (tiktokStatus?.username && !username) setUsername(tiktokStatus.username);
    }, [tiktokStatus, username]);

    useEffect(() => {
        if (printerState) setSpeed(printerState.speed);
    }, [printerState?.speed]); // eslint-disable-line react-hooks/exhaustive-deps

    const [label, color] = STATUS_LABEL[tiktokStatus?.status ?? 'disconnected'];
    const paused = printerState?.paused ?? false;
    const overlayUrl = `${window.location.origin}/overlay`;

    const connect = async () => {
        setMsg('Đang kết nối…');
        const r = await api.connectTikTok(username.trim());
        setMsg(r.message ?? '');
    };
    const saveGift = async () => {
        try {
            await api.setGiftConfig(gold, full);
            setGiftMsg('Đã lưu ✔');
        } catch (e) {
            setGiftMsg(e instanceof Error ? e.message : 'Lỗi');
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: '#0a0c10', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', padding: 20 }}>
            <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                <h1 style={{ gridColumn: '1 / -1', margin: 0, fontSize: 22 }}>
                    PTP Printer · Bảng điều khiển{' '}
                    <span style={{ fontSize: 13, color: isConnected ? '#10b981' : '#f87171' }}>
                        {isConnected ? '● server OK' : '● mất kết nối server'}
                    </span>
                </h1>

                <section style={card}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>TikTok LIVE</h2>
                    <div style={{ color, fontWeight: 700 }}>
                        ● {label}
                        {tiktokStatus?.username ? ` @${tiktokStatus.username}` : ''}
                        {tiktokStatus?.status === 'reconnecting' ? ` (lần ${tiktokStatus.reconnectAttempts})` : ''}
                    </div>
                    {tiktokStatus?.error && <div style={{ color: '#f87171', fontSize: 13 }}>{tiktokStatus.error}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input style={{ ...input, flex: 1 }} placeholder="username TikTok (không cần @)" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && username.trim() && void connect()} />
                        <button style={btn('#10b981')} disabled={!username.trim()} onClick={() => void connect()}>Kết nối</button>
                        <button style={btn('#ef4444')} onClick={() => void api.disconnectTikTok().then(() => setMsg(''))}>Ngắt</button>
                    </div>
                    {msg && <div style={{ fontSize: 13, color: '#94a3b8' }}>{msg}</div>}
                    <div style={{ fontSize: 12, color: '#64748b' }}>Tài khoản phải đang LIVE. Server tự nhớ username và tự nối lại khi rớt mạng hoặc bật lại.</div>
                </section>

                <section style={card}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Máy in</h2>
                    <div>Trạng thái: <b>{printerState?.status ?? '—'}</b> · Tờ đã in: <b>{printerState?.sheetsCompleted ?? 0}</b></div>
                    <div>Hàng đợi: ưu tiên <b>{queueState?.pendingPriority.length ?? 0}</b> · thường <b>{queueState?.pendingFree.length ?? 0}</b></div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button style={btn(paused ? '#10b981' : '#f59e0b')} onClick={() => void (paused ? api.resume() : api.pause())}>
                            {paused ? '▶ Tiếp tục' : '⏸ Tạm dừng'}
                        </button>
                    </div>
                    <label style={{ fontSize: 13 }}>
                        Tốc độ in: <b>x{speed}</b>
                        <input type="range" min={0.25} max={4} step={0.25} value={speed} style={{ width: '100%' }}
                            onChange={(e) => setSpeed(Number(e.target.value))}
                            onMouseUp={() => void api.setSpeed(speed)} onTouchEnd={() => void api.setSpeed(speed)} onKeyUp={() => void api.setSpeed(speed)} />
                    </label>
                </section>

                <section style={card}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Ngưỡng quà (kim cương)</h2>
                    <label style={{ fontSize: 13 }}>Khung vàng từ <input style={{ ...input, width: 90 }} type="number" min={1} value={gold} onChange={(e) => setGold(Number(e.target.value))} /></label>
                    <label style={{ fontSize: 13 }}>In nguyên trang từ <input style={{ ...input, width: 90 }} type="number" min={2} value={full} onChange={(e) => setFull(Number(e.target.value))} /></label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button style={btn()} onClick={() => void saveGift()}>Lưu</button>
                        <span style={{ fontSize: 13, color: '#94a3b8' }}>{giftMsg}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Tính theo tổng = kim cương × số lượng quà. Áp dụng ngay, được lưu lại.</div>
                </section>

                <section style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: 16 }}>Âm thanh & Nhạc nền (BGM)</h2>
                        <button
                            style={btn(muted ? '#ef4444' : '#1e293b')}
                            onClick={() => setMuted(soundManager.toggleMute())}
                        >
                            {muted ? '🔇 Đang tắt âm' : '🔊 Đang mở âm'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            style={btn(bgmPlaying ? '#0284c7' : '#334155')}
                            onClick={() => {
                                if (bgmPlaying) {
                                    soundManager.stopBgm();
                                    setBgmPlaying(false);
                                } else {
                                    soundManager.startBgm();
                                    setBgmPlaying(true);
                                }
                            }}
                        >
                            {bgmPlaying ? '⏸ Tạm dừng BGM' : '▶ Bật Nhạc BGM'}
                        </button>
                    </div>
                    <label style={{ fontSize: 13 }}>
                        Âm lượng BGM: <b>{bgmVol}%</b>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={bgmVol}
                            style={{ width: '100%', accentColor: '#38bdf8' }}
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                setBgmVol(v);
                                soundManager.setBgmVolume(v / 100);
                            }}
                        />
                    </label>
                    <label style={{ fontSize: 13 }}>
                        Âm lượng Máy in (SFX): <b>{sfxVol}%</b>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={sfxVol}
                            style={{ width: '100%', accentColor: '#fbbf24' }}
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                setSfxVol(v);
                                soundManager.setSfxVolume(v / 100);
                            }}
                        />
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                            style={btn('#475569')}
                            onClick={() => {
                                soundManager.unlockAudio();
                                soundManager.startPrintSound(false);
                                setTimeout(() => soundManager.stopPrintSound(), 1800);
                            }}
                        >
                            ✏️ Thử tiếng cọ giấy
                        </button>
                        <button
                            style={btn('#475569')}
                            onClick={() => {
                                soundManager.unlockAudio();
                                soundManager.playGoldChime();
                            }}
                        >
                            ✨ Thử chuông VIP
                        </button>
                        <button
                            style={btn('#475569')}
                            onClick={() => {
                                soundManager.unlockAudio();
                                soundManager.playPaperRoll();
                            }}
                        >
                            📄 Thử cuộn giấy
                        </button>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        Thư mục: <code>client/public/music/</code> (lofi-1.mp3, lofi-2.mp3) và <code>client/public/sounds/</code>
                    </div>
                </section>

                <section style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: 16 }}>Cảnh Nền & Sinh Vật Tự Nhiên</h2>
                        {bgMsg && <span style={{ fontSize: 13, color: '#10b981' }}>{bgMsg}</span>}
                    </div>

                    <div style={{ fontSize: 13, color: '#94a3b8' }}>Chọn cảnh nền (áp dụng ngay & đồng bộ OBS):</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 6 }}>
                        {BACKGROUND_PRESETS.map((p) => {
                            const active = bgPreset === p.id;
                            return (
                                <button
                                    key={p.id}
                                    style={{
                                        ...btn(active ? '#0284c7' : '#1e293b'),
                                        border: `1px solid ${active ? '#38bdf8' : '#334155'}`,
                                        padding: '8px 6px',
                                        fontSize: 12,
                                        textAlign: 'center',
                                    }}
                                    onClick={() => void updateBgConfig({ presetId: p.id })}
                                >
                                    {p.badge}
                                    <div style={{ fontSize: 10, color: active ? '#e0f2fe' : '#94a3b8', marginTop: 2 }}>
                                        {p.name}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ borderTop: '1px solid #1f2937', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={autoRotate}
                                onChange={(e) => void updateBgConfig({ autoRotate: e.target.checked })}
                            />
                            <span><b>Tự động đổi cảnh (Auto-Rotate)</b></span>
                        </label>

                        {autoRotate && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, paddingLeft: 24 }}>
                                <span>Đổi sau mỗi:</span>
                                {[1, 3, 5, 10].map((mins) => (
                                    <button
                                        key={mins}
                                        style={{
                                            ...btn(rotateInterval === mins ? '#0284c7' : '#334155'),
                                            padding: '4px 8px',
                                            fontSize: 11,
                                        }}
                                        onClick={() => void updateBgConfig({ intervalMinutes: mins })}
                                    >
                                        {mins} phút
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ borderTop: '1px solid #1f2937', paddingTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={showButterflies}
                                onChange={(e) => void updateBgConfig({ showButterflies: e.target.checked })}
                            />
                            <span>🦋 Đàn bướm 3D</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={showBirds}
                                onChange={(e) => void updateBgConfig({ showBirds: e.target.checked })}
                            />
                            <span>🦅 Đàn chim bay trời xa</span>
                        </label>
                    </div>

                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        Thư mục ảnh: <code>client/public/backgrounds/</code> (có thể thả thêm ảnh vào đây).
                    </div>
                </section>

                <section style={card}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>OBS</h2>
                    <div style={{ fontSize: 13 }}>Browser Source: <code>{overlayUrl}</code> · rộng 1080 · cao 1920</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button style={btn('#6366f1')} onClick={() => void navigator.clipboard.writeText(overlayUrl)}>Sao chép link</button>
                        <button style={btn('#475569')} onClick={() => window.open('/overlay', '_blank')}>Xem overlay</button>
                        <button style={btn('#475569')} onClick={() => window.open('/', '_blank')}>Trang thử (dev)</button>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Thử nhanh:</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Giả lập TikTok (đi qua adapter thật, không cần live):</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button style={btn('#7c3aed')} onClick={() => void sim({ kind: 'chat', uniqueId: rid() })}>Chat</button>
                        <button style={btn('#7c3aed')} onClick={() => void sim({ kind: 'follow', uniqueId: rid() })}>Follow</button>
                        <button style={btn('#7c3aed')} onClick={() => void (async () => { for (let i = 0; i < 10; i++) { await sim({ kind: 'chat', uniqueId: rid() }); await delay(150); } })()}>10 người chat</button>
                        <button style={btn('#7c3aed')} onClick={() => void sim({ kind: 'gift', uniqueId: rid(), giftName: 'Galaxy', diamondCount: 1000 })}>Quà 1000💎</button>
                        <button style={btn('#7c3aed')} onClick={() => void (async () => { const u = rid(); for (let n = 20; n <= 100; n += 20) { await sim({ kind: 'gift', uniqueId: u, giftName: 'Rose', diamondCount: 1, streakable: true, repeatCount: n }); await delay(400); } await sim({ kind: 'gift', uniqueId: u, giftName: 'Rose', diamondCount: 1, streakable: true, repeatCount: 100, repeatEnd: true }); })()}>Combo Rose ×100</button>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Thử nhanh (bỏ qua adapter):</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button style={btn('#334155')} onClick={() => void api.sendMockComment(`test${Math.floor(Math.random() * 999)}`)}>Comment</button>
                        <button style={btn('#334155')} onClick={() => void api.sendMockGift(`vip${Math.floor(Math.random() * 999)}`, 'Rose', gold)}>Quà vàng</button>
                        <button style={btn('#334155')} onClick={() => void api.sendMockGift(`vip${Math.floor(Math.random() * 999)}`, 'Lion', full)}>Quà nguyên trang</button>
                    </div>
                </section>

                <section style={{ ...card, gridColumn: '1 / -1' }}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Sự kiện gần đây</h2>
                    {recentEvents.length === 0 && <div style={{ color: '#64748b', fontSize: 13 }}>Chưa có sự kiện nào.</div>}
                    {recentEvents.slice(0, 12).map((e) => (
                        <div key={e.id} style={{ fontSize: 13, display: 'flex', gap: 8 }}>
                            <span style={{ width: 70, color: e.type === 'GIFT' ? '#fbbf24' : e.type === 'FOLLOW' ? '#34d399' : '#94a3b8' }}>{e.type}</span>
                            <span>@{e.username}</span>
                            {e.type === 'GIFT' && <span style={{ color: '#fbbf24' }}>{e.giftName} ×{e.giftCount} ({e.diamondCount * e.giftCount}💎)</span>}
                        </div>
                    ))}
                </section>
            </div>
        </div>
    );
}
