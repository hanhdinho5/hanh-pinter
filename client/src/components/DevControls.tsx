import { useState } from 'react';
import type { Sheet, PrinterStatus, SheetEntry, QueueState } from '../types';
import type { PrinterCanvasHandle } from '../printer3d/PrinterCanvas';
import { api } from '../socket/socketClient';

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
}: DevControlsProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

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

        const occupiedSlots = new Set(sheet.entries.map((e) => e.slot));
        let nextSlot = 0;
        while (nextSlot < 6 && occupiedSlots.has(nextSlot)) {
            nextSlot++;
        }
        if (nextSlot >= 6) {
            alert('Tờ in hiện tại đã đủ 6 ô! Bấm "Cuộn tờ mới" để sang tờ tiếp theo.');
            return;
        }

        const newEntry: SheetEntry = {
            slot: nextSlot,
            jobId: `job-offline-${Date.now()}`,
            userId: `user-${Date.now()}`,
            username: isGold ? 'golden_fan_vip' : 'stream_viewer',
            avatarUrl: null,
            frame: isGold ? 'gold' : 'normal',
        };

        setIsAnimating(true);
        setStatus('printing');

        printerRef.current?.printSlot(newEntry, 2.3, () => {
            setIsAnimating(false);
            setStatus('idle');
            setSheet({
                ...sheet,
                entries: [...sheet.entries, newEntry].sort((a, b) => a.slot - b.slot),
                completed: sheet.entries.length + 1 >= 6,
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

            {/* MỤC 3: OBS BROWSER SOURCE OVERLAY */}
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
