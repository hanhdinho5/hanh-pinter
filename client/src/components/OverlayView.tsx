import { useEffect, useRef, useState } from 'react';
import { PrinterCanvas, type PrinterCanvasHandle } from '../printer3d/PrinterCanvas';
import { usePrinterSocket } from '../socket/usePrinterSocket';
import { soundManager } from '../audio/SoundManager';
import { QuickBackgroundBar } from './QuickBackgroundBar';
import { api } from '../socket/socketClient';
import type { Sheet, SheetEntry, PrintJob } from '../types';

export function OverlayView() {
    const printerRef = useRef<PrinterCanvasHandle | null>(null);

    const [activeSheet, setActiveSheet] = useState<Sheet>({
        id: 1,
        kind: 'standard',
        capacity: 6,
        entries: [],
        completed: false,
    });

    const isPrintingRef = useRef(false);

    // Xử lý tham số URL: ?bgm=1 (tự bật BGM), ?mute=1 (tắt âm), ?vol=50
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mute') === '1' || params.get('muted') === '1') {
            soundManager.toggleMute();
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
        onJobStarted: (job: PrintJob, durationSeconds: number) => {
            isPrintingRef.current = true;

            const entry: SheetEntry = {
                slot: job.slot ?? 0,
                jobId: job.id,
                userId: job.userId,
                username: job.username,
                avatarUrl: job.avatarUrl,
                frame: job.frame,
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
                capacity: 6,
                entries: [],
                completed: false,
            };

            printerRef.current?.ejectSheet(nextSheet, () => {
                setActiveSheet(nextSheet);
            });
        },
        onSheetUpdate: (sheet: Sheet) => {
            // Nếu không đang trong hoạt ảnh quét in thì đồng bộ dữ liệu tĩnh
            if (!isPrintingRef.current) {
                setActiveSheet(sheet);
            }
        },
        onBackgroundSync: (config) => {
            if (printerRef.current) {
                printerRef.current.setBackground(config.presetId);
                printerRef.current.setAutoRotate(config.autoRotate, config.intervalMinutes);
                printerRef.current.setCreaturesVisible(config.showButterflies, config.showBirds);
            }
        },
    });

    // Đồng bộ ban đầu khi nhận được snapshot từ backend
    useEffect(() => {
        if (currentSheet && !isPrintingRef.current) {
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

            {/* Thanh điều khiển chọn Background nhanh (luôn có sẵn để đổi ảnh) */}
            <QuickBackgroundBar
                currentPresetId={backgroundConfig?.presetId ?? 'mountain-mist'}
                onSelectPreset={(presetId) => {
                    printerRef.current?.setBackground(presetId);
                    void api.setBackgroundConfig({ presetId });
                }}
                onUploadCustomImage={(dataUrl) => {
                    printerRef.current?.applyCustomBackground(dataUrl);
                }}
                autoRotate={backgroundConfig?.autoRotate ?? false}
                onToggleAutoRotate={(enabled) => {
                    printerRef.current?.setAutoRotate(enabled, 5);
                    void api.setBackgroundConfig({ autoRotate: enabled });
                }}
                showButterflies={backgroundConfig?.showButterflies ?? true}
                onToggleButterflies={(enabled) => {
                    printerRef.current?.setCreaturesVisible(enabled, backgroundConfig?.showBirds ?? true);
                    void api.setBackgroundConfig({ showButterflies: enabled });
                }}
                showBirds={backgroundConfig?.showBirds ?? true}
                onToggleBirds={(enabled) => {
                    printerRef.current?.setCreaturesVisible(backgroundConfig?.showButterflies ?? true, enabled);
                    void api.setBackgroundConfig({ showBirds: enabled });
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
                        top: '16px',
                        left: '16px',
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
    );
}

