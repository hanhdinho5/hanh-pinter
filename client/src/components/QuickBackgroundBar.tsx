import { useState, useRef, useEffect } from 'react';
import { BACKGROUND_PRESETS } from '../printer3d/backgroundManager';
import { useAvailableVideos } from './useAvailableVideos';

interface QuickBackgroundBarProps {
    currentPresetId: string;
    onSelectPreset: (presetId: string) => void;
    onUploadCustomImage: (dataUrl: string) => void;
    bgMode?: 'image' | 'video';
    onToggleBgMode?: (mode: 'image' | 'video') => void;
    currentVideoId?: string;
    onSelectVideo?: (videoId: string) => void;
    onUploadCustomVideo?: (file: File) => void;
    autoRotate: boolean;
    onToggleAutoRotate: (enabled: boolean) => void;
    showButterflies: boolean;
    onToggleButterflies: (enabled: boolean) => void;
    showBirds: boolean;
    onToggleBirds: (enabled: boolean) => void;
    onTriggerBirds: () => void;
    /** Trang OBS: ẩn nút khi không rê chuột để không lộ lên sóng livestream */
    autoHide?: boolean;
}

export function QuickBackgroundBar({
    currentPresetId,
    onSelectPreset,
    onUploadCustomImage,
    bgMode = 'image',
    onToggleBgMode,
    currentVideoId = 'vd1',
    onSelectVideo,
    onUploadCustomVideo,
    autoRotate,
    onToggleAutoRotate,
    showButterflies,
    onToggleButterflies,
    showBirds,
    onToggleBirds,
    onTriggerBirds,
    autoHide = false,
}: QuickBackgroundBarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'video' | 'image'>(bgMode);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const availableVideos = useAvailableVideos();
    const [pointerActive, setPointerActive] = useState(!autoHide);

    // Đồng bộ tab khi chế độ nền đổi từ nơi khác (DevControls, server)
    useEffect(() => {
        setActiveTab(bgMode);
    }, [bgMode]);

    useEffect(() => {
        if (!autoHide) return;
        let timer: number | undefined;
        const wake = () => {
            setPointerActive(true);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => setPointerActive(false), 3000);
        };
        window.addEventListener('mousemove', wake);
        window.addEventListener('touchstart', wake);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('mousemove', wake);
            window.removeEventListener('touchstart', wake);
        };
    }, [autoHide]);

    const hidden = autoHide && !pointerActive && !isOpen;

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result;
            if (typeof dataUrl === 'string') {
                onUploadCustomImage(dataUrl);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        onUploadCustomVideo?.(file);
    };

    const handleSwitchTab = (tab: 'video' | 'image') => {
        setActiveTab(tab);
        onToggleBgMode?.(tab);
    };

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                pointerEvents: hidden ? 'none' : 'auto',
                opacity: hidden ? 0 : 1,
                transition: 'opacity 0.4s ease',
            }}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageChange}
            />
            <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/*"
                style={{ display: 'none' }}
                onChange={handleVideoChange}
            />

            {/* Menu mở rộng khi bấm vào nút */}
            {isOpen && (
                <div
                    style={{
                        background: 'rgba(15, 23, 42, 0.94)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        borderRadius: '14px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
                        maxWidth: '92vw',
                        width: '390px',
                        animation: 'fadeIn 0.2s ease',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
                            🏞️ CHỌN CẢNH NỀN (BACKGROUND)
                        </span>
                        <button
                            onClick={() => setIsOpen(false)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                fontSize: '16px',
                                cursor: 'pointer',
                                padding: '0 4px',
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Bộ chuyển đổi Tab: Video Động vs Ảnh Tĩnh */}
                    <div
                        style={{
                            display: 'flex',
                            gap: '4px',
                            background: '#0f172a',
                            padding: '3px',
                            borderRadius: '8px',
                            border: '1px solid #334155',
                        }}
                    >
                        <button
                            onClick={() => handleSwitchTab('video')}
                            style={{
                                flex: 1,
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: 'none',
                                background: activeTab === 'video' ? '#0284c7' : 'transparent',
                                color: activeTab === 'video' ? '#ffffff' : '#94a3b8',
                                fontWeight: 700,
                                fontSize: '11px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            🎬 Video Động (9:16)
                        </button>
                        <button
                            onClick={() => handleSwitchTab('image')}
                            style={{
                                flex: 1,
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: 'none',
                                background: activeTab === 'image' ? '#0284c7' : 'transparent',
                                color: activeTab === 'image' ? '#ffffff' : '#94a3b8',
                                fontWeight: 700,
                                fontSize: '11px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            🌄 Cảnh Sống (vô tận)
                        </button>
                    </div>

                    {/* NỘI DUNG TAB VIDEO */}
                    {activeTab === 'video' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                            {availableVideos.map((v) => {
                                const active = currentVideoId === v.id;
                                return (
                                    <button
                                        key={v.id}
                                        onClick={() => onSelectVideo?.(v.id)}
                                        style={{
                                            background: active ? '#0284c7' : '#1e293b',
                                            color: active ? '#ffffff' : '#cbd5e1',
                                            border: `1px solid ${active ? '#38bdf8' : '#334155'}`,
                                            borderRadius: '8px',
                                            padding: '8px 6px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            boxShadow: active ? '0 0 10px rgba(56, 189, 248, 0.4)' : 'none',
                                        }}
                                    >
                                        {v.badge}
                                    </button>
                                );
                            })}

                            {/* Nút upload file video MP4 của riêng bạn */}
                            <button
                                onClick={() => videoInputRef.current?.click()}
                                style={{
                                    background: '#3b0764',
                                    color: '#f3e8ff',
                                    border: '1px dashed #c084fc',
                                    borderRadius: '8px',
                                    padding: '8px 6px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                }}
                            >
                                📁 Tải Video Lên (.mp4)
                            </button>
                        </div>
                    )}

                    {/* NỘI DUNG TAB ẢNH TĨNH */}
                    {activeTab === 'image' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px' }}>
                            {BACKGROUND_PRESETS.map((p) => {
                                const active = currentPresetId === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => onSelectPreset(p.id)}
                                        style={{
                                            background: active ? '#0284c7' : '#1e293b',
                                            color: active ? '#ffffff' : '#cbd5e1',
                                            border: `1px solid ${active ? '#38bdf8' : '#334155'}`,
                                            borderRadius: '8px',
                                            padding: '7px 4px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            boxShadow: active ? '0 0 10px rgba(56, 189, 248, 0.4)' : 'none',
                                        }}
                                    >
                                        {p.badge}
                                    </button>
                                );
                            })}

                            {/* Nút upload ảnh của riêng bạn */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    background: '#3b0764',
                                    color: '#f3e8ff',
                                    border: '1px dashed #c084fc',
                                    borderRadius: '8px',
                                    padding: '7px 4px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                }}
                            >
                                📁 Tải Ảnh Lên
                            </button>
                        </div>
                    )}

                    {/* Điều khiển bổ sung: Tự động đổi cảnh, Đàn bướm, Đàn chim */}
                    <div
                        style={{
                            borderTop: '1px solid #334155',
                            paddingTop: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '11px',
                            color: '#e2e8f0',
                        }}
                    >
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={autoRotate}
                                onChange={(e) => onToggleAutoRotate(e.target.checked)}
                            />
                            <span>Tự động đổi</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={showButterflies}
                                onChange={(e) => onToggleButterflies(e.target.checked)}
                            />
                            <span>🦋 Bướm</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={showBirds}
                                onChange={(e) => onToggleBirds(e.target.checked)}
                            />
                            <span>🦅 Chim</span>
                        </label>

                        <button
                            onClick={onTriggerBirds}
                            style={{
                                background: '#1e293b',
                                border: '1px solid #475569',
                                color: '#e2e8f0',
                                borderRadius: '4px',
                                padding: '3px 6px',
                                fontSize: '10px',
                                cursor: 'pointer',
                            }}
                        >
                            Bay ngay
                        </button>
                    </div>
                </div>
            )}

            {/* Nút Pill nổi luôn hiển thị để mở menu */}
            <button
                onClick={() => setIsOpen((prev) => !prev)}
                style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    borderRadius: '24px',
                    padding: '8px 18px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 12px rgba(56, 189, 248, 0.3)',
                    transition: 'all 0.2s ease',
                }}
            >
                <span>🎬</span>
                <span>{isOpen ? 'Đóng Tùy Chọn' : 'Đổi Cảnh Nền'}</span>
            </button>
        </div>
    );
}

