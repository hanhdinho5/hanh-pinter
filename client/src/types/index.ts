export type EventType = 'COMMENT' | 'FOLLOW' | 'GIFT';

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

export type FrameType = 'normal' | 'gold';
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
}

export interface SheetEntry {
    slot: number;
    jobId: string;
    userId: string;
    username: string;
    avatarUrl: string | null;
    frame: FrameType;
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

export interface RealtimeEventMap {
    'printer:state': [PrinterState];
    'printer:job:started': [PrintJob];
    'printer:job:completed': [PrintJob];
    'printer:job:failed': [PrintJob];
    'printer:sheet': [Sheet];
    'printer:sheet:completed': [Sheet];
    queue: [QueueState];
    event: [ViewerEvent];
}

