import { useEffect, useRef, useState } from 'react';
import { PrinterCanvas, type PrinterCanvasHandle } from '../printer3d/PrinterCanvas';
import { usePrinterSocket } from '../socket/usePrinterSocket';
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

    const { isConnected, currentSheet, status } = usePrinterSocket({
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

