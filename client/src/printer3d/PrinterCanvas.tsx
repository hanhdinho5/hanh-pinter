import { useEffect, useRef } from 'react';
import { PrinterWorkshopScene } from './PrinterWorkshopScene';
import type { Sheet, PrinterStatus } from '../types';

interface PrinterCanvasProps {
    sheet: Sheet;
    status: PrinterStatus;
    currentSlot?: number;
    cameraPreset?: 'stream' | 'closeup' | 'overview';
}

export function PrinterCanvas({
    sheet,
    status,
    currentSlot,
    cameraPreset = 'stream',
}: PrinterCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<PrinterWorkshopScene | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Khởi tạo Three.js scene
        const scene = new PrinterWorkshopScene(containerRef.current);
        sceneRef.current = scene;

        // Render sheet ban đầu
        scene.updateSheet(sheet);
        scene.setPrinterStatus(status, currentSlot);

        return () => {
            scene.dispose();
            sceneRef.current = null;
        };
    }, []);

    // Cập nhật khi sheet thay đổi
    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.updateSheet(sheet);
        }
    }, [sheet]);

    // Cập nhật khi status thay đổi
    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.setPrinterStatus(status, currentSlot);
        }
    }, [status, currentSlot]);

    // Cập nhật khi camera preset thay đổi
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
