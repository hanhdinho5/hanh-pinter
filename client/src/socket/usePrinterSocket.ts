import { useEffect, useState, useRef } from 'react';
import { getSocket } from './socketClient';
import { soundManager } from '../audio/SoundManager';
import type {
    PrinterState,
    Sheet,
    QueueState,
    PrintJob,
    ViewerEvent,
    PrinterStatus,
    BackgroundConfig,
    AudioConfig,
} from '../types';

export interface UsePrinterSocketOptions {
    onJobStarted?: (job: PrintJob, durationSeconds: number) => void;
    onJobCompleted?: (job: PrintJob) => void;
    onSheetCompleted?: (sheet: Sheet) => void;
    onSheetUpdate?: (sheet: Sheet) => void;
    onBackgroundSync?: (config: BackgroundConfig) => void;
    /** Mặc định chỉ áp âm lượng; overlay truyền vào để áp cả bật nhạc / tắt tiếng */
    onAudioSync?: (config: AudioConfig) => void;
    onAudioNext?: () => void;
    /** Gọi mỗi lần (re)connect tới server, trước khi nhận lại trạng thái */
    onConnect?: () => void;
}

export function usePrinterSocket(options: UsePrinterSocketOptions = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const [printerState, setPrinterState] = useState<PrinterState | null>(null);
    const [currentSheet, setCurrentSheet] = useState<Sheet | null>(null);
    const [queueState, setQueueState] = useState<QueueState | null>(null);
    const [status, setStatus] = useState<PrinterStatus>('idle');
    const [recentEvents, setRecentEvents] = useState<ViewerEvent[]>([]);
    const [tiktokStatus, setTiktokStatus] = useState<import('../types').TikTokStatus | null>(null);
    const [backgroundConfig, setBackgroundConfig] = useState<BackgroundConfig | null>(null);

    const optionsRef = useRef(options);
    optionsRef.current = options;

    const printerStateRef = useRef<PrinterState | null>(null);
    printerStateRef.current = printerState;

    useEffect(() => {
        const socket = getSocket();

        const onConnect = () => {
            console.log('[Socket.IO] Connected to backend printer server');
            setIsConnected(true);
            optionsRef.current.onConnect?.();
        };

        const onDisconnect = () => {
            console.log('[Socket.IO] Disconnected from backend printer server');
            setIsConnected(false);
        };

        const onPrinterState = (state: PrinterState) => {
            setPrinterState(state);
            setStatus(state.status);
            setCurrentSheet(state.sheet);
        };

        const onPrinterSheet = (sheet: Sheet) => {
            setCurrentSheet(sheet);
            optionsRef.current.onSheetUpdate?.(sheet);
        };

        const onQueue = (queue: QueueState) => {
            setQueueState(queue);
        };

        const onEvent = (ev: ViewerEvent) => {
            setRecentEvents((prev) => [ev, ...prev].slice(0, 20));
        };

        const onJobStarted = (job: PrintJob) => {
            const currentSpeed = printerStateRef.current?.speed ?? 1;
            const factor = job.kind === 'fullPage' || job.frame === 'vip' ? 2 : 1;
            // Server gửi kèm thời gian in thật; bản server cũ thì tự tính 2.5s * hệ số / tốc độ
            const durationSec = job.durationMs ? job.durationMs / 1000 : (2.5 * factor) / currentSpeed;

            setStatus('printing');
            optionsRef.current.onJobStarted?.(job, durationSec);
        };

        const onJobCompleted = (job: PrintJob) => {
            optionsRef.current.onJobCompleted?.(job);
        };

        const onSheetCompleted = (sheet: Sheet) => {
            optionsRef.current.onSheetCompleted?.(sheet);
        };

        const onTikTokStatus = (status: import('../types').TikTokStatus) => {
            setTiktokStatus(status);
        };

        const onBackgroundSync = (config: BackgroundConfig) => {
            setBackgroundConfig(config);
            optionsRef.current.onBackgroundSync?.(config);
        };

        // Âm lượng chỉnh ở trang Admin -> áp dụng ngay cho overlay OBS / dashboard
        const onAudioSync = (cfg: AudioConfig) => {
            soundManager.setSfxVolume(cfg.sfxVolume);
            soundManager.setBgmVolume(cfg.bgmVolume);
            optionsRef.current.onAudioSync?.(cfg);
        };
        const onAudioNext = () => optionsRef.current.onAudioNext?.();

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        // Cast event handlers through socket's on method
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawSocket = socket as any;
        rawSocket.on('printer:state', onPrinterState);
        rawSocket.on('printer:sheet', onPrinterSheet);
        rawSocket.on('queue', onQueue);
        rawSocket.on('event', onEvent);
        rawSocket.on('printer:job:started', onJobStarted);
        rawSocket.on('printer:job:completed', onJobCompleted);
        rawSocket.on('printer:sheet:completed', onSheetCompleted);
        rawSocket.on('tiktok:status', onTikTokStatus);
        rawSocket.on('background:sync', onBackgroundSync);
        rawSocket.on('audio:sync', onAudioSync);
        rawSocket.on('audio:next', onAudioNext);

        if (socket.connected) {
            setIsConnected(true);
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            rawSocket.off('printer:state', onPrinterState);
            rawSocket.off('printer:sheet', onPrinterSheet);
            rawSocket.off('queue', onQueue);
            rawSocket.off('event', onEvent);
            rawSocket.off('printer:job:started', onJobStarted);
            rawSocket.off('printer:job:completed', onJobCompleted);
            rawSocket.off('printer:sheet:completed', onSheetCompleted);
            rawSocket.off('tiktok:status', onTikTokStatus);
            rawSocket.off('background:sync', onBackgroundSync);
            rawSocket.off('audio:sync', onAudioSync);
            rawSocket.off('audio:next', onAudioNext);
        };
    }, []);

    return {
        isConnected,
        printerState,
        currentSheet,
        queueState,
        status,
        setStatus,
        recentEvents,
        tiktokStatus,
        backgroundConfig,
    };
}
