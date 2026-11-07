import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { PrinterWorkshopScene } from './PrinterWorkshopScene';
import type { Sheet, SheetEntry, PrinterStatus } from '../types';

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

/**
 * Dải hướng dẫn cho người xem: làm gì -> được in thế nào.
 * Hai ngưỡng cuối dùng ảnh biểu tượng quà từ mẫu người dùng cung cấp.
 */
function ActionBadges({ frameWidth }: { frameWidth: number }) {
    const badges = [
        { icon: '💬', title: 'Bình luận', sub: 'In ảnh', color: '#7dd3fc' },
        { icon: '➕', title: 'Follow', sub: 'In ảnh', color: '#86efac' },
        { icon: '🌹', title: '', sub: 'In khung', color: '#fda4af' },
        { icon: '', giftIcon: 'pig', title: '', sub: 'Khung to vàng', color: '#fcd34d' },
        { icon: '', giftIcon: 'donut', title: '', sub: 'Khung to VIP', color: '#f0abfc' },
    ];
    // Thu gọn dải hướng dẫn, vẫn tăng theo kích thước nguồn overlay.
    const fontSize = Math.max(7, Math.min(18, frameWidth * 0.017));
    return (
        <div
            style={{
                position: 'absolute',
                top: `${fontSize * 1.4}px`,
                left: '4%',
                right: '4%',
                zIndex: 20,
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                gap: `${fontSize * 0.45}px`,
                padding: `0 ${fontSize * 0.8}px`,
                pointerEvents: 'none',
                fontFamily: '"Segoe UI", system-ui, sans-serif',
            }}
        >
            {badges.map((b) => (
                <div
                    key={b.title || b.sub}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minWidth: 0,
                        gap: `${fontSize * 0.4}px`,
                        padding: `${fontSize * 0.35}px ${fontSize * 0.65}px`,
                        whiteSpace: 'nowrap',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    }}
                >
                    {b.giftIcon ? (
                        <span role="img" aria-label={b.giftIcon === 'pig' ? 'Chú heo may mắn' : 'Bánh vòng'}
                            style={{
                                display: 'inline-block',
                                width: `${fontSize * 3.8}px`,
                                height: `${fontSize * 3.8}px`,
                                flexShrink: 0,
                                backgroundImage: 'url(/gifts/tiktok-gift-icons.png)',
                                backgroundSize: '200% 100%',
                                backgroundPosition: b.giftIcon === 'pig' ? 'left center' : 'right center',
                                backgroundRepeat: 'no-repeat',
                            }} />
                    ) : (
                        <span style={{ fontSize: `${fontSize * 2.7}px`, height: `${fontSize * 3.8}px`, display: 'flex', alignItems: 'center', lineHeight: 1 }}>{b.icon}</span>
                    )}
                    <span style={{ display: 'flex', flexDirection: 'column', textAlign: 'center', lineHeight: 1.15 }}>
                        {b.title && <span style={{ color: '#f8fafc', fontSize: `${fontSize}px`, fontWeight: 700 }}>{b.title}</span>}
                        <span style={{ color: b.color, fontSize: `${fontSize * 0.92}px`, fontWeight: 800 }}>{b.sub}</span>
                    </span>
                </div>
            ))}
        </div>
    );
}
