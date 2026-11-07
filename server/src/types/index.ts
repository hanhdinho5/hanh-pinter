export type EventType = 'COMMENT' | 'FOLLOW' | 'LIKE' | 'SHARE' | 'GIFT';

/** Sự kiện chuẩn hóa, độc lập với TikTok. */
export interface ViewerEvent {
    id: string;
    type: EventType;
    userId: string;
    username: string;
    avatarUrl: string | null;
    timestamp: number;
    giftId: string | null;
    giftName: string | null;
    giftCount: number;
    diamondCount: number;
}

/** gold: quà ≥ ngưỡng vàng; vip: quà ≥ ngưỡng VIP (khung vương miện). Cả hai đều chiếm nguyên 1 hàng. */
export type FrameType = 'normal' | 'rose' | 'gold' | 'vip';
export type JobKind = 'single' | 'fullPage';
export type JobLane = 'free' | 'priority';
export type JobStatus = 'pending' | 'printing' | 'completed' | 'failed';

export interface PrintJob {
    id: string;
    kind: JobKind;
    frame: FrameType;
    lane: JobLane;
    status: JobStatus;
    source: EventType;
    userId: string;
    username: string;
    avatarUrl: string | null;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    sheetId: number | null;
    slot: number | null;
    /** Thời gian in thực tế (ms) server dùng cho job này */
    durationMs?: number;
}

export interface SheetEntry {
    slot: number;
    jobId: string;
    userId: string;
    username: string;
    avatarUrl: string | null;
    frame: FrameType;
    isWide?: boolean;
}

export interface Sheet {
    id: number;
    kind: 'standard' | 'special';
    capacity: number;
    entries: SheetEntry[];
    completed: boolean;
}

export type PrinterStatus = 'idle' | 'printing' | 'paused';

export interface PrinterState {
    status: PrinterStatus;
    paused: boolean;
    speed: number;
    currentJob: PrintJob | null;
    sheet: Sheet;
    sheetsCompleted: number;
}

export interface QueueState {
    pendingPriority: PrintJob[];
    pendingFree: PrintJob[];
    printing: PrintJob | null;
    recentCompleted: PrintJob[];
}

export type TikTokConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface TikTokStatus {
    status: TikTokConnectionStatus;
    username: string | null;
    roomId: string | null;
    error: string | null;
    reconnectAttempts: number;
}

export interface BackgroundConfig {
    presetId: string;
    autoRotate: boolean;
    intervalMinutes: number;
    showButterflies: boolean;
    showBirds: boolean;
    mode?: 'image' | 'video';
    videoId?: string;
}

export interface AudioConfig {
    sfxVolume: number;
    bgmVolume: number;
    bgmEnabled: boolean;
    muted: boolean;
}

/** Nguồn sự thật duy nhất cho tên + payload của các sự kiện realtime. */
export interface RealtimeEventMap {
    'printer:state': [PrinterState];
    'printer:job:started': [PrintJob];
    'printer:job:completed': [PrintJob];
    'printer:job:failed': [PrintJob];
    'printer:sheet': [Sheet];
    'printer:sheet:completed': [Sheet];
    queue: [QueueState];
    event: [ViewerEvent];
    'tiktok:status': [TikTokStatus];
    'background:sync': [BackgroundConfig];
    'audio:sync': [AudioConfig];
    /** Admin bấm "Bài kế": overlay chuyển bài nhạc nền */
    'audio:next': [];
    'audio:select': [number];
}

export type ServerToClientEvents = {
    [K in keyof RealtimeEventMap]: (...args: RealtimeEventMap[K]) => void;
};
