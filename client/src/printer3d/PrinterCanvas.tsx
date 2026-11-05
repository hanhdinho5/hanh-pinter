import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { PrinterWorkshopScene } from './PrinterWorkshopScene';
import type { Sheet, SheetEntry, PrinterStatus } from '../types';

export interface PrinterCanvasHandle {
    printSlot: (entry: SheetEntry, durationSeconds?: number, onComplete?: () => void) => void;
    printSpecial: (entry: SheetEntry, durationSeconds?: number, onComplete?: () => void) => void;
    ejectSheet: (nextSheet: Sheet, onComplete?: () => void) => void;
    setCameraPreset: (preset: 'stream' | 'closeup' | 'overview') => void;
    setBackground: (presetId: string) => void;
    setBackgroundMode: (mode: 'image' | 'video') => void;
    setBackgroundVideo: (videoId: string) => void;
    applyCustomVideo: (fileOrUrl: File | string) => void;
    applyCustomBackground: (dataUrl: string) => void;
    setAutoRotate: (enabled: boolean, intervalMinutes?: number) => void;
    setCreaturesVisible: (butterflies: boolean, birds: boolean, leaves?: boolean) => void;
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
            setCreaturesVisible(butterflies, birds, leaves) {
                sceneRef.current?.setCreaturesVisible(butterflies, birds, leaves);
            },
            triggerBirdFlock() {
                sceneRef.current?.triggerBirdFlock();
            },
        }));

        useEffect(() => {
            if (!containerRef.current) return;

            const scene = new PrinterWorkshopScene(containerRef.current);
            sceneRef.current = scene;

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
            <div
                ref={containerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            />
        );
    }
);
