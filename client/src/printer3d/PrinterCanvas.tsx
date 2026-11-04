import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { PrinterWorkshopScene } from './PrinterWorkshopScene';
import type { Sheet, SheetEntry, PrinterStatus } from '../types';

export interface PrinterCanvasHandle {
    printSlot: (entry: SheetEntry, durationSeconds?: number, onComplete?: () => void) => void;
    printSpecial: (entry: SheetEntry, durationSeconds?: number, onComplete?: () => void) => void;
    ejectSheet: (nextSheet: Sheet, onComplete?: () => void) => void;
    setCameraPreset: (preset: 'stream' | 'closeup' | 'overview') => void;
}

interface PrinterCanvasProps {
    sheet: Sheet;
    status: PrinterStatus;
    currentSlot?: number;
    cameraPreset?: 'stream' | 'closeup' | 'overview';
}

export const PrinterCanvas = forwardRef<PrinterCanvasHandle, PrinterCanvasProps>(
    function PrinterCanvas({ sheet, status, currentSlot, cameraPreset = 'stream' }, ref) {
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
        }));

        useEffect(() => {
            if (!containerRef.current) return;

            const scene = new PrinterWorkshopScene(containerRef.current);
            sceneRef.current = scene;

            scene.updateSheet(sheet);
            scene.setPrinterStatus(status, currentSlot);

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
