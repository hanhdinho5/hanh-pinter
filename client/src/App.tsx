import { useState, useRef, useEffect } from 'react';
import { PrinterCanvas, type PrinterCanvasHandle } from './printer3d/PrinterCanvas';
import { DevControls } from './components/DevControls';
import { OverlayView } from './components/OverlayView';
import { AdminView } from './components/AdminView';
import { QuickBackgroundBar } from './components/QuickBackgroundBar';
import { usePrinterSocket } from './socket/usePrinterSocket';
import { api } from './socket/socketClient';
import { mockPartialSheet } from './printer3d/mockData';
import { soundManager } from './audio/SoundManager';
import type { Sheet, SheetEntry, PrintJob } from './types';

export function App() {
    // 1. Kiểm tra xem người dùng đang mở trang OBS Overlay (/overlay) hay trang Dashboard (/)
    const isOverlayRoute =
        window.location.pathname === '/overlay' ||
        window.location.search.includes('overlay=true');

    if (window.location.pathname === '/admin') {
        return <AdminView />;
    }

    if (isOverlayRoute) {
        return <OverlayView />;
    }

    return <DashboardView />;
}

function DashboardView() {
    const [sheet, setSheet] = useState<Sheet>(mockPartialSheet);
    const [cameraPreset, setCameraPreset] = useState<'stream' | 'closeup' | 'overview'>('stream');
    const [obsMode, setObsMode] = useState<boolean>(false);
    const [bgMode, setBgMode] = useState<'image' | 'video'>('image');
    const [currentVideoId, setCurrentVideoId] = useState<string>('vd1');

    const printerRef = useRef<PrinterCanvasHandle | null>(null);
    /** true = tờ giấy kế tiếp server gửi sẽ đặt lại toàn bộ cảnh in */
    const resyncRef = useRef(true);
    const isPrintingRef = useRef(false);

    // 2. Kết nối Socket.IO thời gian thực với Server (:3001)
    const { isConnected, currentSheet, queueState, status, setStatus, tiktokStatus, backgroundConfig } = usePrinterSocket({
        onAudioSelect: (index) => soundManager.selectBgmTrack(index),
        onAudioNext: () => {
            if (soundManager.isBgmWanted()) soundManager.nextTrack();
        },
        onConnect: () => {
            resyncRef.current = true;
        },
        onJobStarted: (job: PrintJob, durationSeconds: number) => {
            isPrintingRef.current = true;

            const entry: SheetEntry = {
                slot: job.slot ?? 0,
                jobId: job.id,
                userId: job.userId,
                username: job.username,
                avatarUrl: job.avatarUrl,
                frame: job.frame,
                // Server xếp quà vàng chiếm nguyên 1 hàng -> client vẽ đúng như vậy ngay từ đầu
                isWide: job.frame === 'gold' || job.frame === 'vip',
                sheetId: job.sheetId ?? undefined,
            };

            if (job.kind === 'fullPage') {
                printerRef.current?.printSpecial(entry, durationSeconds, () => {
                    isPrintingRef.current = false;
                });
            } else {
                printerRef.current?.printSlot(entry, durationSeconds, () => {
                    isPrintingRef.current = false;
                });
            }
        },
        onSheetCompleted: (completedSheet: Sheet) => {
            const nextSheet: Sheet = {
                id: completedSheet.id + 1,
                kind: 'standard',
                capacity: 4,
                entries: [],
                completed: false,
            };

            // Tờ mới thật (kể cả trang đặc biệt) do server gửi ngay sau qua onSheetUpdate;
            // nextSheet ở đây chỉ để tờ bên dưới có sẵn nội dung trong lúc chờ.
            printerRef.current?.ejectSheet(nextSheet);
        },
        onSheetUpdate: (updatedSheet: Sheet) => {
            // Scene tự giữ avatar đang/vừa in, nên luôn nhận dữ liệu mới (trước đây bỏ qua khi đang in -> hình trước bị mất)
            if (resyncRef.current) {
                // Lần đầu / vừa kết nối lại (server có thể đã khởi động lại): đặt lại tờ, không ghép avatar cũ
                resyncRef.current = false;
                printerRef.current?.resetSheet(updatedSheet);
            }
            setSheet(updatedSheet);
        },
        onBackgroundSync: (config) => {
            if (printerRef.current) {
                printerRef.current.setBackground(config.presetId);
                printerRef.current.setAutoRotate(config.autoRotate, config.intervalMinutes);
                printerRef.current.setCreaturesVisible(config.showButterflies, config.showBirds);
            }
        },
    });

    // Đồng bộ snapshot ban đầu từ backend
    useEffect(() => {
        if (currentSheet) {
            setSheet(currentSheet);
        }
    }, [currentSheet]);

    return (
        <main
            style={{
                width: '100vw',
                height: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: '#0a0c10',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Vùng hiển thị Workshop 3D Máy In (tỷ lệ 9:16) */}
            <div
                style={
                    obsMode
                        ? {
                              width: '100vw',
                              height: '100vh',
                              position: 'relative',
                          }
                        : {
                              height: 'min(96vh, 920px)',
                              aspectRatio: '9 / 16',
                              maxHeight: 'calc(100vh - 32px)',
                              borderRadius: '16px',
                              overflow: 'hidden',
                              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                              position: 'relative',
                              backgroundColor: '#0e0a07',
                          }
                }
            >
                <PrinterCanvas
                    ref={printerRef}
                    sheet={sheet}
                    status={status}
                    currentSlot={sheet.entries.length}
                    cameraPreset={cameraPreset}
                    backgroundPreset={backgroundConfig?.presetId ?? 'mountain-mist'}
                    autoRotate={backgroundConfig?.autoRotate ?? false}
                    rotateIntervalMinutes={backgroundConfig?.intervalMinutes ?? 5}
                    showButterflies={backgroundConfig?.showButterflies ?? true}
                    showBirds={backgroundConfig?.showBirds ?? true}
                />

                {/* Thanh điều khiển chọn Background nhanh trực tiếp trên màn hình */}
                <QuickBackgroundBar
                    bgMode={bgMode}
                    onToggleBgMode={(mode) => {
                        setBgMode(mode);
                        printerRef.current?.setBackgroundMode(mode);
                    }}
                    currentVideoId={currentVideoId}
                    onSelectVideo={(videoId) => {
                        setCurrentVideoId(videoId);
                        printerRef.current?.setBackgroundVideo(videoId);
                        printerRef.current?.setBackgroundMode('video');
                        setBgMode('video');
                    }}
                    onUploadCustomVideo={(file) => {
                        printerRef.current?.applyCustomVideo(file);
                        printerRef.current?.setBackgroundMode('video');
                        setBgMode('video');
                    }}
                    currentPresetId={backgroundConfig?.presetId ?? 'mountain-mist'}
                    onSelectPreset={(presetId) => {
                        printerRef.current?.setBackground(presetId);
                        printerRef.current?.setBackgroundMode('image');
                        setBgMode('image');
                        api.setBackgroundConfig({ presetId }).catch(() => undefined);
                    }}
                    onUploadCustomImage={(dataUrl) => {
                        printerRef.current?.applyCustomBackground(dataUrl);
                        printerRef.current?.setBackgroundMode('image');
                        setBgMode('image');
                    }}
                    autoRotate={backgroundConfig?.autoRotate ?? false}
                    onToggleAutoRotate={(enabled) => {
                        printerRef.current?.setAutoRotate(enabled, 5);
                        api.setBackgroundConfig({ autoRotate: enabled }).catch(() => undefined);
                    }}
                    showButterflies={backgroundConfig?.showButterflies ?? true}
                    onToggleButterflies={(enabled) => {
                        printerRef.current?.setCreaturesVisible(enabled, backgroundConfig?.showBirds ?? true);
                        api.setBackgroundConfig({ showButterflies: enabled }).catch(() => undefined);
                    }}
                    showBirds={backgroundConfig?.showBirds ?? true}
                    onToggleBirds={(enabled) => {
                        printerRef.current?.setCreaturesVisible(backgroundConfig?.showButterflies ?? true, enabled);
                        api.setBackgroundConfig({ showBirds: enabled }).catch(() => undefined);
                    }}
                    onTriggerBirds={() => {
                        printerRef.current?.triggerBirdFlock();
                    }}
                />

                {/* Badge Overlay góc trên hiển thị trạng thái */}
                {!obsMode && (
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '12px',
                            left: '12px',
                            zIndex: 30,
                            padding: '4px 10px',
                            background: 'rgba(15, 23, 42, 0.85)',
                            backdropFilter: 'blur(8px)',
                            border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            letterSpacing: '0.5px',
                            color: isConnected ? '#10b981' : '#f87171',
                            pointerEvents: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                    >
                        <span
                            style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: isConnected ? '#10b981' : '#ef4444',
                            }}
                        />
                        {isConnected ? 'LIVE SYNC :3001' : 'OFFLINE MODE'}
                    </div>
                )}
            </div>

            {/* Bảng điều khiển thử nghiệm Giai đoạn 4 */}
            <DevControls
                sheet={sheet}
                setSheet={setSheet}
                status={status}
                setStatus={setStatus ?? (() => {})}
                cameraPreset={cameraPreset}
                setCameraPreset={setCameraPreset}
                obsMode={obsMode}
                setObsMode={setObsMode}
                printerRef={printerRef}
                isConnected={isConnected}
                queueState={queueState}
                tiktokStatus={tiktokStatus}
            />
        </main>
    );
}

export default App;
