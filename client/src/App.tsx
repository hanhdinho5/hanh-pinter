import { useState } from 'react';
import { PrinterCanvas } from './printer3d/PrinterCanvas';
import { DevControls } from './components/DevControls';
import { mockPartialSheet } from './printer3d/mockData';
import type { Sheet, PrinterStatus } from './types';

export function App() {
    const [sheet, setSheet] = useState<Sheet>(mockPartialSheet);
    const [status, setStatus] = useState<PrinterStatus>('idle');
    const [cameraPreset, setCameraPreset] = useState<'stream' | 'closeup' | 'overview'>('stream');
    const [obsMode, setObsMode] = useState<boolean>(false);

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
                              backgroundColor: '#181412',
                          }
                }
            >
                {/* Canvas Three.js */}
                <PrinterCanvas
                    sheet={sheet}
                    status={status}
                    currentSlot={sheet.entries.length}
                    cameraPreset={cameraPreset}
                />

                {/* Badge Overlay góc trên hiển thị độ phân giải / tỉ lệ */}
                {!obsMode && (
                    <div
                        style={{
                            position: 'absolute',
                            top: '12px',
                            left: '12px',
                            padding: '4px 10px',
                            background: 'rgba(15, 23, 42, 0.75)',
                            backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            letterSpacing: '0.5px',
                            color: '#38bdf8',
                            pointerEvents: 'none',
                        }}
                    >
                        ● 9:16 LIVE OVERLAY PREVIEW
                    </div>
                )}
            </div>

            {/* Bảng điều khiển thử nghiệm Giai đoạn 2 */}
            <DevControls
                sheet={sheet}
                setSheet={setSheet}
                status={status}
                setStatus={setStatus}
                cameraPreset={cameraPreset}
                setCameraPreset={setCameraPreset}
                obsMode={obsMode}
                setObsMode={setObsMode}
            />
        </main>
    );
}

export default App;
