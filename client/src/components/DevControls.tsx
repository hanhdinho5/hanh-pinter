import React from 'react';
import type { Sheet, PrinterStatus, SheetEntry } from '../types';
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
}: DevControlsProps) {
    const [collapsed, setCollapsed] = React.useState(false);

    // Thêm ngẫu nhiên một avatar vào slot trống tiếp theo
    const handleAddAvatar = (isGold = false) => {
        if (sheet.kind === 'special' || sheet.entries.length >= 6) return;

        // Tìm slot trống đầu tiên
        const occupiedSlots = new Set(sheet.entries.map((e) => e.slot));
        let nextSlot = 0;
        while (nextSlot < 6 && occupiedSlots.has(nextSlot)) {
            nextSlot++;
        }
        if (nextSlot >= 6) return;

        const randomNames = [
            'tokyo_drift',
            'cyber_kitty',
            'hoang_anh_99',
            'linh_dan_live',
            'panda_bamboo',
            'super_fan_vn',
            'diamond_lord',
            'phoenix_fire',
        ];
        const randomName = randomNames[Math.floor(Math.random() * randomNames.length)];

        const newEntry: SheetEntry = {
            slot: nextSlot,
            jobId: `job-mock-${Date.now()}`,
            userId: `user-${Date.now()}`,
            username: isGold ? `${randomName}_vip` : randomName,
            avatarUrl: null,
            frame: isGold ? 'gold' : 'normal',
        };

        setSheet((prev) => ({
            ...prev,
            entries: [...prev.entries, newEntry].sort((a, b) => a.slot - b.slot),
            completed: prev.entries.length + 1 >= 6,
        }));
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
                ⚙ Mở bảng điều khiển thử nghiệm (Phase 2)
            </button>
        );
    }

    return (
        <aside
            style={{
                position: 'fixed',
                top: '16px',
                right: '16px',
                width: '320px',
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
                        ⚙ Phase 2: Máy In 3D
                    </h3>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Workshop Three.js • Khung 9:16
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

            {/* Mục 1: Chọn mẫu dữ liệu Sheet */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                    📄 Mẫu Tờ Giấy In (Mock Sheet):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <button
                        onClick={() => setSheet(mockPartialSheet)}
                        style={btnStyle(sheet.id === mockPartialSheet.id)}
                    >
                        Tờ 4/6 ô (Có vàng)
                    </button>
                    <button
                        onClick={() => setSheet(mockFullSheet)}
                        style={btnStyle(sheet.id === mockFullSheet.id)}
                    >
                        Đầy đủ 6/6 ô
                    </button>
                    <button
                        onClick={() => setSheet(mockSpecialSheet)}
                        style={btnStyle(sheet.kind === 'special')}
                    >
                        👑 Trang VIP (≥1k)
                    </button>
                    <button
                        onClick={() => setSheet(mockEmptySheet)}
                        style={btnStyle(sheet.id === mockEmptySheet.id && sheet.entries.length === 0)}
                    >
                        Tờ trắng 0/6
                    </button>
                </div>
            </div>

            {/* Mục 2: Thử thêm avatar vào ô trống */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                    ➕ Giả lập in thêm Avatar ({sheet.entries.length}/6):
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                        disabled={sheet.kind === 'special' || sheet.entries.length >= 6}
                        onClick={() => handleAddAvatar(false)}
                        style={{
                            ...actionBtnStyle,
                            opacity: sheet.kind === 'special' || sheet.entries.length >= 6 ? 0.4 : 1,
                        }}
                    >
                        + Khung thường
                    </button>
                    <button
                        disabled={sheet.kind === 'special' || sheet.entries.length >= 6}
                        onClick={() => handleAddAvatar(true)}
                        style={{
                            ...actionBtnStyle,
                            background: '#d97706',
                            borderColor: '#f59e0b',
                            opacity: sheet.kind === 'special' || sheet.entries.length >= 6 ? 0.4 : 1,
                        }}
                    >
                        + Khung vàng (VIP)
                    </button>
                </div>
            </div>

            {/* Mục 3: Trạng thái máy in */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: '#cbd5e1' }}>
                    🚥 Đèn & Màn hình máy in:
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                        onClick={() => setStatus('idle')}
                        style={statusBtnStyle(status === 'idle', '#10b981')}
                    >
                        Sẵn sàng
                    </button>
                    <button
                        onClick={() => setStatus('printing')}
                        style={statusBtnStyle(status === 'printing', '#38bdf8')}
                    >
                        Đang in
                    </button>
                    <button
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
                        9:16 Chuẩn
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

            {/* Mục 5: Chế độ hiển thị */}
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
    flex: 1,
    padding: '8px 10px',
    background: '#2563eb',
    color: '#ffffff',
    border: '1px solid #3b82f6',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
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
