import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { SheetManager } from '../printer/sheetManager.js';
import type { PrinterEngine } from '../printer/printerEngine.js';
import type { PrintQueue } from '../queue/printQueue.js';
import type { Bus } from './bus.js';
import type { FrameType, JobKind, JobLane, PrintJob, ViewerEvent } from '../types/index.js';

export type NewEventInput = Pick<ViewerEvent, 'type' | 'userId' | 'username'> &
    Partial<Pick<ViewerEvent, 'avatarUrl' | 'giftId' | 'giftName' | 'giftCount' | 'diamondCount'>>;

export type HandleResult =
    | { accepted: true; job: PrintJob; event: ViewerEvent }
    | { accepted: false; reason: 'duplicate' | 'queue_full'; event: ViewerEvent };

interface Classification {
    lane: JobLane;
    kind: JobKind;
    frame: FrameType;
}

export const normalizeEvent = (input: NewEventInput): ViewerEvent => ({
    id: randomUUID(),
    type: input.type,
    userId: input.userId,
    username: input.username,
    avatarUrl: input.avatarUrl ?? null,
    timestamp: Date.now(),
    giftId: input.giftId ?? null,
    giftName: input.giftName ?? null,
    giftCount: input.type === 'GIFT' ? Math.max(1, input.giftCount ?? 1) : 0,
    diamondCount: input.diamondCount ?? 0,
});

/** Quy tắc gameplay: sự kiện → loại job. Hàm thuần, dễ test. */
export const classifyEvent = (event: ViewerEvent, gift: AppConfig['gift']): Classification => {
    if (event.type !== 'GIFT') return { lane: 'free', kind: 'single', frame: 'normal' };

    const totalDiamonds = event.diamondCount * event.giftCount;
    if (totalDiamonds >= gift.fullPageDiamonds) return { lane: 'priority', kind: 'fullPage', frame: 'gold' };
    if (totalDiamonds >= gift.goldDiamonds) return { lane: 'priority', kind: 'single', frame: 'gold' };
    return { lane: 'priority', kind: 'single', frame: 'normal' };
};

export class EventHandler {
    constructor(
        private readonly queue: PrintQueue,
        private readonly sheets: SheetManager,
        private readonly engine: PrinterEngine,
        private readonly bus: Bus,
        private readonly giftConfig: AppConfig['gift'],
        private readonly maxFreeQueue: number = Infinity,
    ) {}

    handle(input: NewEventInput): HandleResult {
        const event = normalizeEvent(input);
        this.bus.emit('event', event);

        const rule = classifyEvent(event, this.giftConfig);

        // Chỉ lượt in miễn phí mới bị giới hạn 1 lần/tờ; gift luôn được in.
        if (rule.lane === 'free' && (this.sheets.hasUser(event.userId) || this.queue.hasFreeJobFor(event.userId))) {
            return { accepted: false, reason: 'duplicate', event };
        }
        if (rule.lane === 'free' && this.queue.freeSize >= this.maxFreeQueue) {
            return { accepted: false, reason: 'queue_full', event };
        }

        const job: PrintJob = {
            id: randomUUID(),
            ...rule,
            status: 'pending',
            source: event.type,
            userId: event.userId,
            username: event.username,
            avatarUrl: event.avatarUrl,
            createdAt: event.timestamp,
            startedAt: null,
            completedAt: null,
            sheetId: null,
            slot: null,
        };
        this.queue.enqueue(job);
        this.engine.kick();
        return { accepted: true, job, event };
    }
}
