import { useState } from 'react';
import type { Sheet, PrinterStatus, SheetEntry, QueueState, TikTokStatus } from '../types';
import type { PrinterCanvasHandle } from '../printer3d/PrinterCanvas';
import { api } from '../socket/socketClient';
import { soundManager } from '../audio/SoundManager';
import { BACKGROUND_PRESETS, VIDEO_PRESETS } from '../printer3d/backgroundManager';

interface DevControlsProps {
    sheet: Sheet;
    setSheet: (sheet: Sheet) => void;
    status: PrinterStatus;
    setStatus: (status: PrinterStatus) => void;
    cameraPreset: 'stream' | 'closeup' | 'overview';
    setCameraPreset: (preset: 'stream' | 'closeup' | 'overview') => void;
    obsMode: boolean;
    setObsMode: (val: boolean) => void;
    printerRef: React.RefObject<PrinterCanvasHandle | null>;
    isConnected: boolean;
    queueState: QueueState | null;
    tiktokStatus: TikTokStatus | null;
}

export function DevControls({
    sheet,
    setSheet,
    status,
    setStatus,
    cameraPreset,
    setCameraPreset,
    obsMode,
    setObsMode,
    printerRef,
    isConnected,
    queueState,
    tiktokStatus,
}: DevControlsProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [tiktokInput, setTiktokInput] = useState('');
    const [isConnectingTikTok, setIsConnectingTikTok] = useState(false);

    // Trạng thái Âm thanh & Nhạc nền
    const [bgmPlaying, setBgmPlaying] = useState(soundManager.getBgmPlaying());
    const [isMuted, setIsMuted] = useState(soundManager.isSoundMuted());
    const [bgmVol, setBgmVol] = useState(Math.round(soundManager.getBgmVolume() * 100));
    const [sfxVol, setSfxVol] = useState(Math.round(soundManager.getSfxVolume() * 100));

    const handleToggleBgm = () => {
        if (bgmPlaying) {
            soundManager.stopBgm();
            setBgmPlaying(false);
        } else {
            soundManager.startBgm();
            setBgmPlaying(true);
        }
    };

    const handleToggleMute = () => {
        const muted = soundManager.toggleMute();
        setIsMuted(muted);
    };

    const handleChangeBgmVol = (val: number) => {
        setBgmVol(val);
        soundManager.setBgmVolume(val / 100);
    };

    const handleChangeSfxVol = (val: number) => {
        setSfxVol(val);
        soundManager.setSfxVolume(val / 100);
    };

    const handleTestSfx = (type: 'printer' | 'gold' | 'eject') => {
        soundManager.unlockAudio();
        if (type === 'printer') {
            soundManager.startPrintSound(false);
            setTimeout(() => soundManager.stopPrintSound(), 1800);
        } else if (type === 'gold') {
            soundManager.playGoldChime();
        } else if (type === 'eject') {
            soundManager.playPaperRoll();
        }
    };

    // Trạng thái Cảnh nền (Video Động hoặc Ảnh Tĩnh) & Sinh vật bay
    const [bgMode, setBgMode] = useState<'video' | 'image'>('video');
    const [currentVideo, setCurrentVideo] = useState<string>('vd1');
    const [currentBg, setCurrentBg] = useState('mountain-mist');
    const [autoRotate, setAutoRotate] = useState(false);
    const [showButterflies, setShowButterflies] = useState(true);
    const [showBirds, setShowBirds] = useState(true);

    const handleSwitchBgMode = (mode: 'video' | 'image') => {
        setBgMode(mode);
        printerRef.current?.setBackgroundMode(mode);
    };

    const handleSelectVideo = (videoId: string) => {
        setCurrentVideo(videoId);
        setBgMode('video');
        printerRef.current?.setBackgroundVideo(videoId);
        printerRef.current?.setBackgroundMode('video');
    };

    const handleUploadVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBgMode('video');
        printerRef.current?.applyCustomVideo(file);
        printerRef.current?.setBackgroundMode('video');
    };

    const handleSelectBg = (presetId: string) => {
        setCurrentBg(presetId);
        setBgMode('image');
        printerRef.current?.setBackground(presetId);
        printerRef.current?.setBackgroundMode('image');
        void api.setBackgroundConfig({ presetId }).catch(() => undefined);
    };

    const handleToggleAutoRotate = (enabled: boolean) => {
        setAutoRotate(enabled);
        printerRef.current?.setAutoRotate(enabled, 5);
        void api.setBackgroundConfig({ autoRotate: enabled }).catch(() => undefined);
    };

    const handleToggleButterflies = (enabled: boolean) => {
        setShowButterflies(enabled);
        printerRef.current?.setCreaturesVisible(enabled, showBirds);
        void api.setBackgroundConfig({ showButterflies: enabled }).catch(() => undefined);
    };

    const handleToggleBirds = (enabled: boolean) => {
        setShowBirds(enabled);
        printerRef.current?.setCreaturesVisible(showButterflies, enabled);
        void api.setBackgroundConfig({ showBirds: enabled }).catch(() => undefined);
    };

    const handleTriggerBirdFlight = () => {
        printerRef.current?.triggerBirdFlock();
    };

    // Kết nối TikTok LIVE thật
    const handleConnectTikTok = async () => {
        if (!tiktokInput.trim()) return;
        setIsConnectingTikTok(true);
        try {
            const res = await api.connectTikTok(tiktokInput.trim());
            if (!res.success && res.message) {
                alert(`Không thể kết nối TikTok LIVE: ${res.message}`);
            }
        } catch (err) {
            console.error('Lỗi khi gọi API kết nối TikTok:', err);
            alert('Lỗi kết nối tới backend server');
        } finally {
            setIsConnectingTikTok(false);
        }
    };

    // Ngắt kết nối TikTok LIVE
    const handleDisconnectTikTok = async () => {
        try {
            await api.disconnectTikTok();
        } catch (err) {
            console.error('Lỗi khi ngắt kết nối TikTok:', err);
        }
    };

    // Gửi sự kiện giả lập tới REST API của Backend Server
    const handleSendRealEvent = async (type: 'COMMENT' | 'FOLLOW' | 'GIFT', isVip = false) => {
        const randomNames = [
            'alex_tiktok',
            'cyber_kitty',
            'hoang_anh_99',
            'linh_dan_live',
            'panda_bamboo',
            'dragon_lord',
            'phoenix_fire',
            'tokyo_stream',
        ];
        const randomUser = randomNames[Math.floor(Math.random() * randomNames.length)];

        try {
            if (type === 'COMMENT') {
                await api.sendMockComment(randomUser);
            } else if (type === 'FOLLOW') {
                await api.sendMockFollow(randomUser);
            } else if (type === 'GIFT') {
                if (isVip) {
                    // Quà 1200 kim cương -> Full Page VIP
                    await api.sendMockGift(randomUser, 'Lion_King', 1200);
                } else {
                    // Quà 150 kim cương -> Khung vàng
                    await api.sendMockGift(randomUser, 'Rose_Bouquet', 150);
                }
            }
        } catch (err) {
            console.error('Failed to send mock event to server:', err);
            alert('Không thể kết nối đến server backend (:3001). Bạn hãy đảm bảo server backend đang chạy!');
        }
    };

    // Điều khiển Pause / Resume Backend Engine
    const handleTogglePause = async () => {
        try {
            if (status === 'paused') {
                await api.resume();
            } else {
                await api.pause();
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Điều khiển Tốc độ Backend Engine
    const handleChangeSpeed = async (speed: number) => {
        try {
            await api.setSpeed(speed);
        } catch (err) {
            console.error(err);
        }
    };

    // Copy link OBS Browser Source
    const handleCopyObsLink = () => {
        const url = `${window.location.origin}/overlay`;
        navigator.clipboard.writeText(url);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    // Thử nghiệm hoạt ảnh Offline (không phụ thuộc server)
    const handleTriggerOfflinePrint = (isGold = false) => {
        if (isAnimating || sheet.kind === 'special') return;

        const row0Entries = sheet.entries.filter((e) => e.slot === 0 || e.slot === 1);
        const row1Entries = sheet.entries.filter((e) => e.slot === 2 || e.slot === 3);
        const row0HasWide = row0Entries.some((e) => e.isWide);
        const row1HasWide = row1Entries.some((e) => e.isWide);
        const row0Full = row0HasWide || row0Entries.length >= 2;
        const row1Full = row1HasWide || row1Entries.length >= 2;

        let nextSlot = -1;
        const isWide = isGold;

        if (isWide) {
            if (row0Entries.length === 0) nextSlot = 0;
            else if (row1Entries.length === 0) nextSlot = 2;
        } else {
            if (!row0Full) {
                nextSlot = row0Entries.some((e) => e.slot === 0) ? 1 : 0;
            } else if (!row1Full) {
                nextSlot = row1Entries.some((e) => e.slot === 2) ? 3 : 2;
            }
        }

        if (nextSlot === -1 || (row0Full && row1Full)) {
            alert('Tờ in hiện tại đã đủ 4 ô hoặc không còn hàng trống cho quà to! Bấm "Cuộn tờ mới" để sang tờ tiếp theo.');
            return;
        }

        const newEntry: SheetEntry = {
            slot: nextSlot,
            jobId: `job-offline-${Date.now()}`,
            userId: `user-${Date.now()}`,
            username: isGold ? 'golden_fan_vip' : 'stream_viewer',
            avatarUrl: null,
            frame: isGold ? 'gold' : 'normal',
            isWide,
        };

        setIsAnimating(true);
        setStatus('printing');

        printerRef.current?.printSlot(newEntry, 2.3, () => {
            setIsAnimating(false);
            setStatus('idle');
            const newEntries = [...sheet.entries, newEntry].sort((a, b) => a.slot - b.slot);
            const r0 = newEntries.filter((e) => e.slot === 0 || e.slot === 1);
            const r1 = newEntries.filter((e) => e.slot === 2 || e.slot === 3);
            const isFull = (r0.some((e) => e.isWide) || r0.length >= 2) && (r1.some((e) => e.isWide) || r1.length >= 2);
            setSheet({
                ...sheet,
                entries: newEntries,
                completed: isFull,
            });
        });
    };

    if (collapsed) {
        return (
            <button
                onClick={() => setCollapsed(false)}
                style={{
                    position: 'fixed',
                    bottom: '16px',
                    right: '16px',
                    padding: '10px 16px',
                    background: '#0f172a',
                    color: '#38bdf8',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    zIndex: 9999,
                }}
            >
                ⚙ Bảng điều khiển (Phase 4: Realtime)
            </button>
        );
    }

    return (
        <aside
            style={{
                position: 'fixed',
                top: '16px',
                right: '16px',
                width: '340px',
                maxHeight: 'calc(100vh - 32px)',
                overflowY: 'auto',
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(14px)',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '16px',
                color: '#e2e8f0',
                fontSize: '13px',
                boxShadow: '0 12px 36px rgba(0,0,0,0.7)',
                zIndex: 9999,
            }}
        >
            {/* Header & Trạng thái kết nối */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #334155',
                }}
            >
                <div>
                    <h3 style={{ margin: 0, fontSize: '15px', color: '#38bdf8' }}>
                        ⚡ Phase 4: Realtime Engine
                    </h3>
                    <div style={{ fontSize: '11px', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                            style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: isConnected ? '#10b981' : '#ef4444',
                                display: 'inline-block',
                            }}
                        />
                        <span style={{ color: isConnected ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                            {isConnected ? 'Đã kết nối Socket.IO (:3001)' : 'Mất kết nối server (:3001)'}
                        </span>
                    </div>
                </div>
                <button
                    onClick={() => setCollapsed(true)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '16px',
                    }}
                >
                    ✕
                </button>
            </div>

            {/* Trạng thái Queue thời gian thực từ Backend */}
            <div
                style={{
                    marginBottom: '14px',
                    padding: '8px 10px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                }}
            >
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                    📊 Hàng đợi Backend (Queue):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                    <div>
                        Ưu tiên (Gift): <strong style={{ color: '#fbbf24' }}>{queueState?.pendingPriority.length ?? 0}</strong>
                    </div>
                    <div>
                        Miễn phí: <strong style={{ color: '#38bdf8' }}>{queueState?.pendingFree.length ?? 0}</strong>
                    </div>
                </div>
            </div>

            {/* MỤC: KẾT NỐI TIKTOK LIVE TRỰC TIẾP (PHASE 5) */}
            <div
                style={{
                    marginBottom: '16px',
                    background: 'rgba(236, 72, 153, 0.1)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(236, 72, 153, 0.3)',
                }}
            >
                <div
                    style={{
                        fontWeight: 600,
                        marginBottom: '8px',
                        color: '#f43f5e',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <span>🔴 Kết Nối TikTok LIVE:</span>
                    <span
                        style={{
                            fontSize: '11px',
                            color:
                                tiktokStatus?.status === 'connected'
                                    ? '#10b981'
                                    : tiktokStatus?.status === 'connecting'
                                    ? '#fbbf24'
                                    : '#94a3b8',
                            fontWeight: 600,
                        }}
                    >
                        {tiktokStatus?.status === 'connected'
                            ? '● ĐANG LIVE'
                            : tiktokStatus?.status === 'connecting'
                            ? '⏳ ĐANG KẾT NỐI...'
                            : tiktokStatus?.status === 'reconnecting'
                            ? `🔄 THỬ LẠI (${tiktokStatus.reconnectAttempts})...`
                            : '⚪ CHƯA KẾT NỐI'}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <input
                        type="text"
                        placeholder="@username tiktok"
                        value={tiktokInput}
                        onChange={(e) => setTiktokInput(e.target.value)}
                        disabled={tiktokStatus?.status === 'connected'}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleConnectTikTok();
                        }}
                        style={{
                            flex: 1,
                            padding: '6px 10px',
                            background: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '6px',
                            color: '#ffffff',
                            fontSize: '12px',
                        }}
                    />
                    {tiktokStatus?.status === 'connected' ? (
                        <button
                            onClick={handleDisconnectTikTok}
                            style={{
                                ...actionBtnStyle('#ef4444', '#dc2626'),
                                padding: '6px 12px',
                            }}
                        >
                            Ngắt
                        </button>
                    ) : (
                        <button
                            onClick={handleConnectTikTok}
                            disabled={isConnectingTikTok || !tiktokInput.trim()}
                            style={{
                                ...actionBtnStyle('#e11d48', '#be123c'),
                                padding: '6px 12px',
                                opacity: isConnectingTikTok || !tiktokInput.trim() ? 0.6 : 1,
                            }}
                        >
                            {isConnectingTikTok ? '...' : 'Kết nối'}
                        </button>
                    )}
                </div>
                {tiktokStatus?.error && (
                    <div style={{ fontSize: '11px', color: '#f87171', marginTop: '4px' }}>
                        ⚠️ {tiktokStatus.error}
                    </div>
                )}
                {tiktokStatus?.status === 'connected' && (
                    <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>
                        ✓ Đang nhận live từ @{tiktokStatus.username}
                        {tiktokStatus.roomId ? ` (Room: ${tiktokStatus.roomId})` : ''}
                    </div>
                )}
            </div>

            {/* MỤC 1: BẮN SỰ KIỆN THẬT QUA REST API VÀO BACKEND */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#38bdf8' }}>
                    🚀 Bắn Sự Kiện Khán Giả Thật (REST API):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button
                            onClick={() => handleSendRealEvent('COMMENT')}
                            style={actionBtnStyle('#0284c7', '#0369a1')}
                        >
                            💬 Giả lập Comment
                        </button>
                        <button
                            onClick={() => handleSendRealEvent('FOLLOW')}
                            style={actionBtnStyle('#7c3aed', '#6d28d9')}
                        >
                            ✨ Giả lập Follow
                        </button>
                    </div>
                    <button
                        onClick={() => handleSendRealEvent('GIFT', false)}
                        style={actionBtnStyle('#d97706', '#b45309')}
                    >
                        🎁 Tặng Quà 150 Diamond (Khung vàng)
                    </button>
                    <button
                        onClick={() => handleSendRealEvent('GIFT', true)}
                        style={actionBtnStyle('#9333ea', '#7e22ce')}
                    >
                        👑 Tặng Quà 1200 Diamond (Full Page VIP)
                    </button>
                </div>
            </div>

            {/* MỤC 2: ĐIỀU KHIỂN ENGINE MÁY IN (PAUSE / SPEED) */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                    ⚙ Điều khiển Máy In:
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <button
                        onClick={handleTogglePause}
                        style={{
                            ...btnStyle(status === 'paused'),
                            flex: 1,
                            background: status === 'paused' ? '#10b981' : '#d97706',
                            color: '#ffffff',
                            fontWeight: 'bold',
                        }}
                    >
                        {status === 'paused' ? '▶ Tiếp tục (Resume)' : '⏸ Tạm dừng (Pause)'}
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleChangeSpeed(1)} style={speedBtnStyle}>
                        Tốc độ 1x
                    </button>
                    <button onClick={() => handleChangeSpeed(2)} style={speedBtnStyle}>
                        Tốc độ 2x
                    </button>
                    <button onClick={() => handleChangeSpeed(4)} style={speedBtnStyle}>
                        Tốc độ 4x
                    </button>
                </div>
            </div>

            {/* MỤC 3: ÂM THANH & NHẠC NỀN */}
            <div style={{ marginBottom: '16px', background: 'rgba(56, 189, 248, 0.08)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, color: '#38bdf8' }}>🎵 Âm Thanh & Nhạc Nền:</span>
                    <button
                        onClick={handleToggleMute}
                        style={{
                            background: isMuted ? '#ef4444' : '#1e293b',
                            color: '#ffffff',
                            border: '1px solid #475569',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                        }}
                    >
                        {isMuted ? '🔇 Đang Tắt Âm' : '🔊 Đang Mở Âm'}
                    </button>
                </div>

                {/* BGM Toggle & Playlist */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <button
                        onClick={handleToggleBgm}
                        style={{
                            ...actionBtnStyle(bgmPlaying ? '#0284c7' : '#334155', bgmPlaying ? '#0369a1' : '#475569'),
                            flex: 1,
                        }}
                    >
                        {bgmPlaying ? '⏸ Tạm dừng BGM' : '▶ Bật Nhạc BGM'}
                    </button>
                    <button
                        onClick={() => {
                            soundManager.nextTrack();
                            setBgmPlaying(true);
                        }}
                        style={{
                            ...actionBtnStyle('#475569', '#334155'),
                            padding: '4px 10px',
                            fontSize: '11px',
                        }}
                        title="Chuyển sang bài nhạc lofi tiếp theo"
                    >
                        ⏭️ Bài Kế
                    </button>
                </div>

                {/* Thanh trượt âm lượng */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px', fontSize: '11px' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '2px' }}>
                            <span>Âm lượng Nhạc BGM:</span>
                            <span>{bgmVol}%</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={bgmVol}
                            onChange={(e) => handleChangeBgmVol(Number(e.target.value))}
                            style={{ width: '100%', accentColor: '#38bdf8' }}
                        />
                    </div>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '2px' }}>
                            <span>Âm lượng Máy In (SFX):</span>
                            <span>{sfxVol}%</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={sfxVol}
                            onChange={(e) => handleChangeSfxVol(Number(e.target.value))}
                            style={{ width: '100%', accentColor: '#fbbf24' }}
                        />
                    </div>
                </div>

                {/* Thử nhanh hiệu ứng âm thanh */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                    <button
                        onClick={() => handleTestSfx('printer')}
                        style={{ ...speedBtnStyle, fontSize: '10px' }}
                    >
                        ✏️ Thử Tiếng Cọ Giấy
                    </button>
                    <button
                        onClick={() => handleTestSfx('gold')}
                        style={{ ...speedBtnStyle, fontSize: '10px' }}
                    >
                        ✨ Thử Chuông VIP
                    </button>
                    <button
                        onClick={() => handleTestSfx('eject')}
                        style={{ ...speedBtnStyle, fontSize: '10px' }}
                    >
                        📄 Thử Cuộn Giấy
                    </button>
                </div>

                <div style={{ fontSize: '10px', color: '#64748b' }}>
                    📁 Nhạc: <code>client/public/music/</code> · SFX: <code>client/public/sounds/</code>
                </div>
            </div>

            {/* MỤC 4: CẢNH NỀN & SINH VẬT TỰ NHIÊN */}
            <div style={{ marginBottom: '16px', background: 'rgba(168, 85, 247, 0.08)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(168, 85, 247, 0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, color: '#c084fc' }}>🏞️ Cảnh Nền & Sinh Vật:</span>
                    <span style={{ fontSize: '10px', color: '#a855f7', fontWeight: 'bold' }}>
                        {bgMode === 'video' ? '🎬 Đang dùng VIDEO' : '🖼️ Đang dùng ẢNH'}
                    </span>
                </div>

                {/* Tab chuyển đổi giữa Video 9:16 và Ảnh tĩnh */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    <button
                        onClick={() => handleSwitchBgMode('video')}
                        style={{
                            ...btnStyle(bgMode === 'video'),
                            flex: 1,
                            padding: '5px',
                            fontSize: '11px',
                            background: bgMode === 'video' ? '#059669' : '#1e293b',
                            border: `1px solid ${bgMode === 'video' ? '#34d399' : '#334155'}`,
                        }}
                    >
                        🎬 Video Động (9:16)
                    </button>
                    <button
                        onClick={() => handleSwitchBgMode('image')}
                        style={{
                            ...btnStyle(bgMode === 'image'),
                            flex: 1,
                            padding: '5px',
                            fontSize: '11px',
                            background: bgMode === 'image' ? '#7e22ce' : '#1e293b',
                            border: `1px solid ${bgMode === 'image' ? '#c084fc' : '#334155'}`,
                        }}
                    >
                        🖼️ Ảnh Tĩnh
                    </button>
                </div>

                {/* Giao diện Video Động */}
                {bgMode === 'video' && (
                    <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>
                            Danh sách Video 9:16 (Lặp vô tận - Hardware Decode):
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px' }}>
                            {VIDEO_PRESETS.map((v) => {
                                const active = currentVideo === v.id;
                                return (
                                    <button
                                        key={v.id}
                                        onClick={() => handleSelectVideo(v.id)}
                                        style={{
                                            ...btnStyle(active),
                                            padding: '6px 8px',
                                            fontSize: '11px',
                                            textAlign: 'left',
                                            background: active ? '#047857' : '#1e293b',
                                            border: `1px solid ${active ? '#34d399' : '#334155'}`,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <span>{v.badge}</span>
                                        <span style={{ fontSize: '10px', opacity: 0.7 }}>{v.id === 'vd1' ? 'Mặc định (User Video)' : v.id}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <label
                            style={{
                                display: 'block',
                                textAlign: 'center',
                                padding: '5px 8px',
                                background: '#1e293b',
                                border: '1px dashed #64748b',
                                borderRadius: '4px',
                                fontSize: '11px',
                                color: '#cbd5e1',
                                cursor: 'pointer',
                            }}
                        >
                            📤 Nạp video khác từ máy tính (.mp4, .webm)
                            <input
                                type="file"
                                accept="video/mp4,video/webm"
                                onChange={handleUploadVideo}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </div>
                )}

                {/* Giao diện Ảnh Tĩnh */}
                {bgMode === 'image' && (
                    <div style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '6px' }}>
                            {BACKGROUND_PRESETS.map((p) => {
                                const active = currentBg === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => handleSelectBg(p.id)}
                                        style={{
                                            ...btnStyle(active),
                                            padding: '6px 4px',
                                            fontSize: '11px',
                                            background: active ? '#7e22ce' : '#1e293b',
                                            border: `1px solid ${active ? '#c084fc' : '#334155'}`,
                                        }}
                                    >
                                        {p.badge}
                                    </button>
                                );
                            })}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#cbd5e1' }}>
                            <input
                                type="checkbox"
                                checked={autoRotate}
                                onChange={(e) => handleToggleAutoRotate(e.target.checked)}
                            />
                            <span>Tự động đổi cảnh (Auto-Rotate)</span>
                        </label>
                    </div>
                )}

                {/* Bướm và Chim */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: '#cbd5e1', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={showButterflies}
                                onChange={(e) => handleToggleButterflies(e.target.checked)}
                            />
                            <span>🦋 Đàn bướm</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={showBirds}
                                onChange={(e) => handleToggleBirds(e.target.checked)}
                            />
                            <span>🦅 Đàn chim</span>
                        </label>
                    </div>
                </div>

                <button
                    onClick={handleTriggerBirdFlight}
                    style={{
                        ...speedBtnStyle,
                        width: '100%',
                        padding: '5px',
                        background: '#334155',
                        fontSize: '11px',
                    }}
                >
                    🦅 Cho đàn chim bay qua ngay
                </button>
            </div>

            {/* MỤC 5: OBS BROWSER SOURCE OVERLAY */}
            <div style={{ marginBottom: '16px', background: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#10b981' }}>
                    🎥 Nguồn OBS Browser Source (/overlay):
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <a
                        href="/overlay"
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            ...actionBtnStyle('#059669', '#047857'),
                            textDecoration: 'none',
                            textAlign: 'center',
                            flex: 1,
                        }}
                    >
                        🔗 Mở trang /overlay
                    </a>
                    <button
                        onClick={handleCopyObsLink}
                        style={{
                            ...actionBtnStyle('#0f766e', '#115e59'),
                            flex: 1,
                        }}
                    >
                        {copySuccess ? '✓ Đã copy!' : '📋 Copy URL OBS'}
                    </button>
                </div>
            </div>

            {/* MỤC 4: THỬ NGHIỆM HOẠT ẢNH OFFLINE */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                    🎬 Hoạt ảnh thử nghiệm Offline:
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                        disabled={isAnimating}
                        onClick={() => handleTriggerOfflinePrint(false)}
                        style={btnStyle(false)}
                    >
                        In thường
                    </button>
                    <button
                        disabled={isAnimating}
                        onClick={() => handleTriggerOfflinePrint(true)}
                        style={btnStyle(false)}
                    >
                        In vàng (VIP)
                    </button>
                </div>
            </div>

            {/* MỤC 5: GÓC NHÌN CAMERA */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                    🎥 Góc nhìn Camera:
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                        onClick={() => setCameraPreset('stream')}
                        style={btnStyle(cameraPreset === 'stream')}
                    >
                        9:16 Livecade
                    </button>
                    <button
                        onClick={() => setCameraPreset('closeup')}
                        style={btnStyle(cameraPreset === 'closeup')}
                    >
                        Cận cảnh
                    </button>
                    <button
                        onClick={() => setCameraPreset('overview')}
                        style={btnStyle(cameraPreset === 'overview')}
                    >
                        Nghiêng xưởng
                    </button>
                </div>
            </div>

            {/* MỤC 6: CHẾ ĐỘ HIỂN THỊ */}
            <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
                <label
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        color: '#94a3b8',
                    }}
                >
                    <input
                        type="checkbox"
                        checked={obsMode}
                        onChange={(e) => setObsMode(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                    />
                    <span>Chế độ toàn màn hình xem trước (1080×1920)</span>
                </label>
            </div>
        </aside>
    );
}

const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 10px',
    background: active ? '#0284c7' : '#1e293b',
    color: active ? '#ffffff' : '#cbd5e1',
    border: `1px solid ${active ? '#38bdf8' : '#334155'}`,
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    textAlign: 'center',
    flex: 1,
});

const actionBtnStyle = (bg: string, hoverBg: string): React.CSSProperties => ({
    padding: '8px 10px',
    background: bg,
    color: '#ffffff',
    border: `1px solid ${hoverBg}`,
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
});

const speedBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: '6px',
    background: '#1e293b',
    color: '#cbd5e1',
    border: '1px solid #334155',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
};
