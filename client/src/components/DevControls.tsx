import React, { useState } from 'react';
import type { Sheet, PrinterStatus, SheetEntry } from '../types';
import type { PrinterCanvasHandle } from '../printer3d/PrinterCanvas';
import {
    mockPartialSheet,
    mockFullSheet,
    mockSpecialSheet,
    mockEmptySheet,
} from '../printer3d/mockData';

interface DevControlsProps {
    sheet: Sheet;
    setSheet: React.Dispatch<React.SetStateAction<Sheet>>;
    status: PrinterStatus;
    setStatus: React.Dispatch<React.SetStateAction<PrinterStatus>>;
    cameraPreset: 'stream' | 'closeup' | 'overview';
    setCameraPreset: (preset: 'stream' | 'closeup' | 'overview') => void;
    obsMode: boolean;
    setObsMode: (val: boolean) => void;
    printerRef: React.RefObject<PrinterCanvasHandle | null>;
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
}: DevControlsProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    // Kích hoạt hoạt ảnh in thử 1 avatar vào slot trống tiếp theo
    const handleTriggerPrintAnimation = (isGold = false) => {
        if (isAnimating || sheet.kind === 'special') return;

        const occupiedSlots = new Set(sheet.entries.map((e) => e.slot));
        let nextSlot = 0;
        while (nextSlot < 6 && occupiedSlots.has(nextSlot)) {
            nextSlot++;
        }
        if (nextSlot >= 6) {
            alert('Tờ in hiện tại đã đủ 6 ô! Hãy bấm nút "Cuộn tờ mới" để đẩy tờ này đi.');
            return;
        }

        const randomNames = [
            'alex_live',
            'cyber_kitty',
            'hoang_anh_99',
            'linh_dan_live',
            'panda_bamboo',
            'dragon_lord',
            'phoenix_fire',
            'superstar_vn',
        ];
        const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];

        const newEntry: SheetEntry = {
            slot: nextSlot,
            jobId: `job-live-${Date.now()}`,
            userId: `user-${Date.now()}`,
            username: isGold ? `${randomName}_vip` : randomName,
            avatarUrl: null,
            frame: isGold ? 'gold' : 'normal',
        };

        setIsAnimating(true);
        setStatus('printing');

        printerRef.current?.printSlot(newEntry, 2.3, () => {
            setIsAnimating(false);
            setStatus('idle');
            setSheet((prev) => ({
                ...prev,
                entries: [...prev.entries, newEntry].sort((a, b) => a.slot - b.slot),
                completed: prev.entries.length + 1 >= 6,
            }));
        });
    };

    // Kích hoạt hoạt ảnh in Trang đặc biệt Full Page (VIP)
    const handleTriggerFullPageAnimation = () => {
        if (isAnimating) return;

        const specialEntry: SheetEntry = {
            slot: 0,
            jobId: `job-vip-${Date.now()}`,
            userId: `user-superstar`,
            username: 'TIKTOK_SUPERSTAR',
            avatarUrl: null,
            frame: 'gold',
        };

        const newSpecialSheet: Sheet = {
            id: sheet.id + 1,
            kind: 'special',
            capacity: 1,
            completed: false,
            entries: [],
        };

        setIsAnimating(true);
        setStatus('printing');

        // Đầu tiên cuộn tờ cũ ra và đưa tờ đặc biệt vào
        printerRef.current?.ejectSheet(newSpecialSheet, () => {
            setSheet(newSpecialSheet);

            // Bắt đầu quét in toàn trang đặc biệt
            printerRef.current?.printSpecial(specialEntry, 3.2, () => {
                setIsAnimating(false);
                setStatus('idle');
                setSheet((prev) => ({
                    ...prev,
                    entries: [specialEntry],
                    completed: true,
                }));
            });
        });
    };

    // Kích hoạt hoạt ảnh đẩy tờ cũ ra và kéo tờ mới vào
    const handleTriggerEjectSheet = () => {
        if (isAnimating) return;

        const nextFreshSheet: Sheet = {
            id: sheet.id + 1,
            kind: 'standard',
            capacity: 6,
            completed: false,
            entries: [],
        };

        setIsAnimating(true);
        printerRef.current?.ejectSheet(nextFreshSheet, () => {
            setIsAnimating(false);
            setSheet(nextFreshSheet);
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
                ⚙ Bảng điều khiển thử nghiệm (Phase 3: Hoạt ảnh)
            </button>
        );
    }

    return (
        <aside
            style={{
                position: 'fixed',
                top: '16px',
                right: '16px',
                width: '330px',
                maxHeight: 'calc(100vh - 32px)',
                overflowY: 'auto',
                background: 'rgba(15, 23, 42, 0.94)',
                backdropFilter: 'blur(12px)',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '16px',
                color: '#e2e8f0',
                fontSize: '13px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                zIndex: 9999,
            }}
        >
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
                        ⚙ Phase 3: Hoạt Ảnh Máy In
                    </h3>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Quét dòng • Cuộn giấy • Hạt vàng VIP
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

            {/* Mục 1: KÍCH HOẠT HOẠT ẢNH IN THỰC TẾ (CORE PHASE 3) */}
            <div style={{ marginBottom: '16px', background: 'rgba(30, 41, 59, 0.5)', padding: '10px', borderRadius: '8px' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#38bdf8' }}>
                    🎬 Thử nghiệm Hoạt ảnh Real-time:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                        disabled={isAnimating || sheet.kind === 'special' || sheet.entries.length >= 6}
                        onClick={() => handleTriggerPrintAnimation(false)}
                        style={{
                            ...actionBtnStyle,
                            background: isAnimating ? '#334155' : '#2563eb',
                            borderColor: '#3b82f6',
                            cursor: isAnimating ? 'not-allowed' : 'pointer',
                        }}
                    >
                        ▶ In 1 Avatar (Quét dòng laser xanh)
                    </button>
                    <button
                        disabled={isAnimating || sheet.kind === 'special' || sheet.entries.length >= 6}
                        onClick={() => handleTriggerPrintAnimation(true)}
                        style={{
                            ...actionBtnStyle,
                            background: isAnimating ? '#334155' : '#d97706',
                            borderColor: '#f59e0b',
                            cursor: isAnimating ? 'not-allowed' : 'pointer',
                        }}
                    >
                        👑 In Khung Vàng (Quét vàng + Bắn hạt VIP)
                    </button>
                    <button
                        disabled={isAnimating}
                        onClick={handleTriggerEjectSheet}
                        style={{
                            ...actionBtnStyle,
                            background: '#0d9488',
                            borderColor: '#14b8a6',
                        }}
                    >
                        📜 Cuộn tờ mới (Đẩy tờ cũ ra)
                    </button>
                    <button
                        disabled={isAnimating}
                        onClick={handleTriggerFullPageAnimation}
                        style={{
                            ...actionBtnStyle,
                            background: '#9333ea',
                            borderColor: '#a855f7',
                        }}
                    >
                        ⭐ In Trang Đặc Biệt Full Page (VIP ≥ 1k)
                    </button>
                </div>
            </div>

            {/* Mục 2: Mẫu dữ liệu tĩnh */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                    📄 Chuyển đổi mẫu dữ liệu tĩnh:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button
                        disabled={isAnimating}
                        onClick={() => setSheet(mockPartialSheet)}
                        style={btnStyle(sheet.id === mockPartialSheet.id)}
                    >
                        Tờ 4/6 ô
                    </button>
                    <button
                        disabled={isAnimating}
                        onClick={() => setSheet(mockFullSheet)}
                        style={btnStyle(sheet.id === mockFullSheet.id)}
                    >
                        Đầy đủ 6/6 ô
                    </button>
                    <button
                        disabled={isAnimating}
                        onClick={() => setSheet(mockSpecialSheet)}
                        style={btnStyle(sheet.kind === 'special')}
                    >
                        Trang VIP
                    </button>
                    <button
                        disabled={isAnimating}
                        onClick={() => setSheet(mockEmptySheet)}
                        style={btnStyle(sheet.id === mockEmptySheet.id && sheet.entries.length === 0)}
                    >
                        Tờ trắng 0/6
                    </button>
                </div>
            </div>

            {/* Mục 3: Trạng thái máy in */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                    🚥 Đèn chiếu đầu in:
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                        disabled={isAnimating}
                        onClick={() => setStatus('idle')}
                        style={statusBtnStyle(status === 'idle', '#10b981')}
                    >
                        Sẵn sàng
                    </button>
                    <button
                        disabled={isAnimating}
                        onClick={() => setStatus('printing')}
                        style={statusBtnStyle(status === 'printing', '#38bdf8')}
                    >
                        Đang in
                    </button>
                    <button
                        disabled={isAnimating}
                        onClick={() => setStatus('paused')}
                        style={statusBtnStyle(status === 'paused', '#f59e0b')}
                    >
                        Tạm dừng
                    </button>
                </div>
            </div>

            {/* Mục 4: Góc nhìn Camera */}
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

            {/* Mục 5: Chế độ hiển thị OBS */}
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
                    <span>Chế độ toàn màn hình OBS (1080×1920)</span>
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
});

const actionBtnStyle: React.CSSProperties = {
    padding: '9px 12px',
    color: '#ffffff',
    border: '1px solid transparent',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
};

const statusBtnStyle = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1,
    padding: '7px 8px',
    background: active ? color : '#1e293b',
    color: active ? '#0f172a' : '#cbd5e1',
    border: `1px solid ${active ? color : '#334155'}`,
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
});
