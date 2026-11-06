import { useEffect, useRef, useState } from 'react';
import { PrinterCanvas, type PrinterCanvasHandle } from '../printer3d/PrinterCanvas';
import { usePrinterSocket } from '../socket/usePrinterSocket';
import { soundManager } from '../audio/SoundManager';
import { QuickBackgroundBar } from './QuickBackgroundBar';
import { api } from '../socket/socketClient';
import type { Sheet, SheetEntry, PrintJob } from '../types';

export function OverlayView() {
    const printerRef = useRef<PrinterCanvasHandle | null>(null);
    /** true = tờ giấy kế tiếp server gửi sẽ đặt lại toàn bộ cảnh in */
    const resyncRef = useRef(true);

    const [activeSheet, setActiveSheet] = useState<Sheet>({
        id: 1,
        kind: 'standard',
        capacity: 6,
        entries: [],
        completed: false,
    });

    const isPrintingRef = useRef(false);
    const [bgMode, setBgMode] = useState<'image' | 'video'>('image');
    const [currentVideoId, setCurrentVideoId] = useState('vd1');

    // Tham số URL (ưu tiên hơn cài đặt trong Admin): ?bgm=1|0, ?mute=1, ?sfxVol=0.8, ?bgmVol=0.5
    const urlAudio = useRef(new URLSearchParams(window.location.search));
    useEffect(() => {
        const params = urlAudio.current;
        if (params.get('mute') === '1' || params.get('muted') === '1') {
            soundManager.setMuted(true);
        }
        if (params.has('sfxVol')) {
            soundManager.setSfxVolume(Number(params.get('sfxVol')));
        }
        if (params.has('bgmVol')) {
            soundManager.setBgmVolume(Number(params.get('bgmVol')));
        }
        if (params.get('bgm') === '1') {
            soundManager.startBgm();
        }

        const handleInteraction = () => {
            soundManager.unlockAudio();
        };
        window.addEventListener('click', handleInteraction, { once: true });
        window.addEventListener('keydown', handleInteraction, { once: true });
        return () => {
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
        };
    }, []);

    const { isConnected, currentSheet, status, backgroundConfig } = usePrinterSocket({
        onConnect: () => {
            resyncRef.current = true;
        },
        onAudioNext: () => {
            if (soundManager.isBgmWanted()) soundManager.nextTrack();
        },
        // Nhạc nền / tắt tiếng / âm lượng điều khiển từ trang Admin
        onAudioSync: (cfg) => {
            const params = urlAudio.current;
            if (params.has('sfxVol')) soundManager.setSfxVolume(Number(params.get('sfxVol')));
            if (params.has('bgmVol')) soundManager.setBgmVolume(Number(params.get('bgmVol')));
            if (!params.has('mute') && !params.has('muted')) soundManager.setMuted(cfg.muted);
            if (!params.has('bgm')) {
                if (cfg.bgmEnabled) soundManager.startBgm();
                else soundManager.stopBgm();
            }
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
                isWide: job.frame !== 'normal',
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
            // Khi tờ giấy hoàn tất, kích hoạt hoạt ảnh cuộn tờ cũ ra ngoài
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
        onSheetUpdate: (sheet: Sheet) => {
            // Nếu không đang trong hoạt ảnh quét in thì đồng bộ dữ liệu tĩnh
            // Scene tự giữ avatar đang/vừa in, nên luôn nhận dữ liệu mới (trước đây bỏ qua khi đang in -> hình trước bị mất)
            if (resyncRef.current) {
                // Lần đầu / vừa kết nối lại (server có thể đã khởi động lại): đặt lại tờ, không ghép avatar cũ
                resyncRef.current = false;
                printerRef.current?.resetSheet(sheet);
            }
            setActiveSheet(sheet);
        },
        onBackgroundSync: (config) => {
            if (printerRef.current) {
                printerRef.current.setBackground(config.presetId);
                printerRef.current.setAutoRotate(config.autoRotate, config.intervalMinutes);
                printerRef.current.setCreaturesVisible(config.showButterflies, config.showBirds);
                // Chế độ nền đã lưu (ảnh động / video) -> giữ nguyên kể cả khi LIVE Studio tải lại trang
                if (config.videoId && config.videoId !== 'custom') {
                    printerRef.current.setBackgroundVideo(config.videoId);
                    setCurrentVideoId(config.videoId);
                }
                if (config.mode) {
                    printerRef.current.setBackgroundMode(config.mode);
                    setBgMode(config.mode);
                }
            }
        },
    });

    // Áp lại chế độ nền đã lưu sau khi cảnh 3D sẵn sàng (phòng khi tín hiệu đồng bộ đến trước lúc cảnh khởi tạo)
    useEffect(() => {
        if (!backgroundConfig || !printerRef.current) return;
        if (backgroundConfig.videoId && backgroundConfig.videoId !== 'custom') {
            printerRef.current.setBackgroundVideo(backgroundConfig.videoId);
            setCurrentVideoId(backgroundConfig.videoId);
        }
        if (backgroundConfig.mode) {
            printerRef.current.setBackgroundMode(backgroundConfig.mode);
            setBgMode(backgroundConfig.mode);
        }
    }, [backgroundConfig]);

    // Đồng bộ ban đầu khi nhận được snapshot từ backend
    useEffect(() => {
        if (currentSheet) {
            setActiveSheet(currentSheet);
        }
    }, [currentSheet]);

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                position: 'fixed',
                top: 0,
                left: 0,
                overflow: 'hidden',
                backgroundColor: '#000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
          {/* Khung 9:16 cố định ở giữa: cửa sổ 1080x1920 thì lấp kín, cửa sổ khác tỉ lệ thì có viền đen */}
          <div
            style={{
                position: 'relative',
                width: 'min(100vw, calc(100vh * 9 / 16))',
                height: 'min(100vh, calc(100vw * 16 / 9))',
                overflow: 'hidden',
                backgroundColor: '#0e0a07',
            }}
          >
            <PrinterCanvas
                ref={printerRef}
                sheet={activeSheet}
                status={status}
                currentSlot={activeSheet.entries.length}
                cameraPreset="stream"
                backgroundPreset={backgroundConfig?.presetId ?? 'mountain-mist'}
                autoRotate={backgroundConfig?.autoRotate ?? false}
                rotateIntervalMinutes={backgroundConfig?.intervalMinutes ?? 5}
                showButterflies={backgroundConfig?.showButterflies ?? true}
                showBirds={backgroundConfig?.showBirds ?? true}
            />

            {/* Thanh điều khiển chọn Background nhanh (luôn có sẵn để đổi video / ảnh) */}
            <QuickBackgroundBar
                autoHide
                currentPresetId={backgroundConfig?.presetId ?? 'mountain-mist'}
                bgMode={bgMode}
                onToggleBgMode={(mode) => {
                    setBgMode(mode);
                    printerRef.current?.setBackgroundMode(mode);
                    api.setBackgroundConfig({ mode }).catch(() => undefined);
                }}
                currentVideoId={currentVideoId}
                onSelectVideo={(videoId) => {
                    setCurrentVideoId(videoId);
                    printerRef.current?.setBackgroundVideo(videoId);
                    printerRef.current?.setBackgroundMode('video');
                    setBgMode('video');
                    api.setBackgroundConfig({ mode: 'video', videoId }).catch(() => undefined);
                }}
                onUploadCustomVideo={(file) => {
                    printerRef.current?.applyCustomVideo(file);
                    setBgMode('video');
                }}
                onSelectPreset={(presetId) => {
                    printerRef.current?.setBackground(presetId);
                    printerRef.current?.setBackgroundMode('image');
                    setBgMode('image');
                    api.setBackgroundConfig({ presetId, mode: 'image' }).catch(() => undefined);
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

            {/* Trạng thái kết nối nhỏ ở góc trên cho streamer kiểm tra */}
            {!isConnected && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '16px',
                        left: '16px',
                        zIndex: 30,
                        padding: '6px 12px',
                        background: 'rgba(239, 68, 68, 0.85)',
                        color: '#ffffff',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        letterSpacing: '0.5px',
                    }}
                >
                    ⚠️ MẤT KẾT NỐI SERVER (:3001)
                </div>
            )}
          </div>
        </div>
    );
}

