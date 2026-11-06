import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { PrinterWorkshopScene } from './PrinterWorkshopScene';
import type { Sheet, SheetEntry, PrinterStatus } from '../types';
import { api } from '../socket/socketClient';

export interface PrinterCanvasHandle {
    printSlot: (entry: SheetEntry, durationSeconds?: number, onComplete?: () => void) => void;
    printSpecial: (entry: SheetEntry, durationSeconds?: number, onComplete?: () => void) => void;
    ejectSheet: (nextSheet: Sheet, onComplete?: () => void) => void;
    /** Đồng bộ lại hoàn toàn với server (sau khi kết nối lại) */
    resetSheet: (sheet: Sheet) => void;
    setCameraPreset: (preset: 'stream' | 'closeup' | 'overview') => void;
    setBackground: (presetId: string) => void;
    setBackgroundMode: (mode: 'image' | 'video') => void;
    setBackgroundVideo: (videoId: string) => void;
    applyCustomVideo: (fileOrUrl: File | string) => void;
    applyCustomBackground: (dataUrl: string) => void;
    setAutoRotate: (enabled: boolean, intervalMinutes?: number) => void;
    setCreaturesVisible: (butterflies: boolean, birds: boolean) => void;
    triggerBirdFlock: () => void;
}

interface PrinterCanvasProps {
    sheet: Sheet;
    status: PrinterStatus;
    currentSlot?: number;
    cameraPreset?: 'stream' | 'closeup' | 'overview';
    backgroundPreset?: string;
    autoRotate?: boolean;
    rotateIntervalMinutes?: number;
    showButterflies?: boolean;
    showBirds?: boolean;
}

export const PrinterCanvas = forwardRef<PrinterCanvasHandle, PrinterCanvasProps>(
    function PrinterCanvas(
        {
            sheet,
            status,
            currentSlot,
            cameraPreset = 'stream',
            backgroundPreset,
            autoRotate,
            rotateIntervalMinutes,
            showButterflies = true,
            showBirds = true,
        },
        ref
    ) {
        const containerRef = useRef<HTMLDivElement>(null);
        const sceneRef = useRef<PrinterWorkshopScene | null>(null);
        const outerRef = useRef<HTMLDivElement>(null);
        const [frameWidth, setFrameWidth] = useState(540);

        useEffect(() => {
            const el = outerRef.current;
            if (!el) return;
            const ro = new ResizeObserver(() => setFrameWidth(el.clientWidth || 540));
            ro.observe(el);
            return () => ro.disconnect();
        }, []);

        useImperativeHandle(ref, () => ({
            printSlot(entry, durationSeconds, onComplete) {
                sceneRef.current?.startPrintSlotAnimation(entry, durationSeconds, onComplete);
            },
            printSpecial(entry, durationSeconds, onComplete) {
                sceneRef.current?.startPrintSpecialAnimation(entry, durationSeconds, onComplete);
            },
            ejectSheet(nextSheet, onComplete) {
                sceneRef.current?.startEjectSheetAnimation(nextSheet, onComplete);
            },
            resetSheet(sheet) {
                sceneRef.current?.resetSheet(sheet);
            },
            setCameraPreset(preset) {
                sceneRef.current?.setCameraPreset(preset);
            },
            setBackground(presetId) {
                sceneRef.current?.setBackground(presetId);
            },
            setBackgroundMode(mode) {
                sceneRef.current?.setBackgroundMode(mode);
            },
            setBackgroundVideo(videoId) {
                sceneRef.current?.setBackgroundVideo(videoId);
            },
            applyCustomVideo(fileOrUrl) {
                sceneRef.current?.applyCustomVideo(fileOrUrl);
            },
            applyCustomBackground(dataUrl) {
                sceneRef.current?.applyCustomBackground(dataUrl);
            },
            setAutoRotate(enabled, intervalMinutes) {
                sceneRef.current?.setAutoRotate(enabled, intervalMinutes);
            },
            setCreaturesVisible(butterflies, birds) {
                sceneRef.current?.setCreaturesVisible(butterflies, birds);
            },
            triggerBirdFlock() {
                sceneRef.current?.triggerBirdFlock();
            },
        }));

        useEffect(() => {
            if (!containerRef.current) return;

            const scene = new PrinterWorkshopScene(containerRef.current);
            sceneRef.current = scene;
            if (import.meta.env.DEV) {
                // Móc debug khi phát triển (không có trong bản build)
                (window as unknown as { __printerScene?: PrinterWorkshopScene }).__printerScene = scene;
            }

            scene.updateSheet(sheet);
            scene.setPrinterStatus(status, currentSlot);

            if (backgroundPreset) {
                scene.setBackground(backgroundPreset);
            }
            if (autoRotate !== undefined) {
                scene.setAutoRotate(autoRotate, rotateIntervalMinutes);
            }
            scene.setCreaturesVisible(showButterflies, showBirds);

            return () => {
                scene.dispose();
                sceneRef.current = null;
            };
        }, []);

        useEffect(() => {
            if (sceneRef.current) {
                sceneRef.current.updateSheet(sheet);
            }
        }, [sheet]);

        useEffect(() => {
            if (sceneRef.current) {
                sceneRef.current.setPrinterStatus(status, currentSlot);
            }
        }, [status, currentSlot]);

        useEffect(() => {
            if (sceneRef.current) {
                sceneRef.current.setCameraPreset(cameraPreset);
            }
        }, [cameraPreset]);

        useEffect(() => {
            if (sceneRef.current && backgroundPreset) {
                sceneRef.current.setBackground(backgroundPreset);
            }
        }, [backgroundPreset]);

        useEffect(() => {
            if (sceneRef.current && autoRotate !== undefined) {
                sceneRef.current.setAutoRotate(autoRotate, rotateIntervalMinutes);
            }
        }, [autoRotate, rotateIntervalMinutes]);

        useEffect(() => {
            if (sceneRef.current) {
                sceneRef.current.setCreaturesVisible(showButterflies, showBirds);
            }
        }, [showButterflies, showBirds]);

        return (
            <div ref={outerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                <div
                    ref={containerRef}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        overflow: 'hidden',
                    }}
                />
                <ActionBadges frameWidth={frameWidth} />
            </div>
        );
    }
);

/** Đọc ngưỡng xu của khung vàng / VIP từ server (đổi trong trang admin thì tối đa 30s sau badge cập nhật) */
function useGiftThresholds(): { gold: number; vip: number } {
    const [t, setT] = useState({ gold: 100, vip: 1000 });
    useEffect(() => {
        let alive = true;
        const load = () =>
            api
                .getGiftConfig()
                .then((c) => {
                    if (alive && c?.goldDiamonds && c?.fullPageDiamonds) setT({ gold: c.goldDiamonds, vip: c.fullPageDiamonds });
                })
                .catch(() => undefined);
        void load();
        const id = window.setInterval(load, 30_000);
        return () => {
            alive = false;
            window.clearInterval(id);
        };
    }, []);
    return t;
}

const fmtXu = (n: number) => `${n.toLocaleString('vi-VN')} xu`;

/**
 * Dải hướng dẫn cho người xem: làm gì -> được in thế nào.
 * Icon dùng emoji gần giống quà TikTok tương ứng: 🌹 Hoa hồng (1 xu), 🎊 Pháo giấy (100 xu), 🌌 Thiên hà (1.000 xu).
 */
function ActionBadges({ frameWidth }: { frameWidth: number }) {
    const { gold, vip } = useGiftThresholds();
    const badges = [
        { icon: '💬', title: 'Bình luận', sub: 'In ảnh', color: '#7dd3fc' },
        { icon: '➕', title: 'Follow', sub: 'In ảnh', color: '#86efac' },
        { icon: '🌹', title: 'Tặng quà', sub: 'In ưu tiên', color: '#fda4af' },
        { icon: '🎊', title: `Từ ${fmtXu(gold)}`, sub: 'Khung vàng', color: '#fcd34d' },
        { icon: '🌌', title: `Từ ${fmtXu(vip)}`, sub: 'Khung VIP 👑', color: '#f0abfc' },
    ];
    // Khung 9:16 rộng ~540px -> chữ ~10px; khung OBS 1080px -> ~20px
    const fontSize = Math.max(8, Math.min(20, frameWidth * 0.019));
    return (
        <div
            style={{
                position: 'absolute',
                top: `${fontSize * 1.4}px`,
                left: 0,
                right: 0,
                zIndex: 20,
                display: 'flex',
                justifyContent: 'center',
                gap: `${fontSize * 0.45}px`,
                padding: `0 ${fontSize * 0.8}px`,
                pointerEvents: 'none',
                fontFamily: '"Segoe UI", system-ui, sans-serif',
            }}
        >
            {badges.map((b) => (
                <div
                    key={b.title}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: `${fontSize * 0.4}px`,
                        padding: `${fontSize * 0.35}px ${fontSize * 0.65}px`,
                        borderRadius: `${fontSize * 0.9}px`,
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: `1px solid ${b.color}77`,
                        backdropFilter: 'blur(6px)',
                        whiteSpace: 'nowrap',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    }}
                >
                    <span style={{ fontSize: `${fontSize * 1.7}px`, lineHeight: 1 }}>{b.icon}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                        <span style={{ color: '#f8fafc', fontSize: `${fontSize}px`, fontWeight: 700 }}>{b.title}</span>
                        <span style={{ color: b.color, fontSize: `${fontSize * 0.92}px`, fontWeight: 800 }}>{b.sub}</span>
                    </span>
                </div>
            ))}
        </div>
    );
}
