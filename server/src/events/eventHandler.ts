import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config.js';
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
    // Quà VIP: chiếm 1 hàng như khung vàng nhưng khung vương miện đẹp hơn (không in nguyên trang nữa)
    if (totalDiamonds >= gift.fullPageDiamonds) return { lane: 'priority', kind: 'single', frame: 'vip' };
    const giftName = event.giftName?.trim().toLocaleLowerCase();
    const isRose = event.giftId === '5655' || giftName === 'rose' || giftName === 'hoa hồng';
    if (totalDiamonds >= gift.goldDiamonds) return { lane: 'priority', kind: 'single', frame: 'gold' };
    if (isRose) return { lane: 'priority', kind: 'single', frame: 'rose' };
    return { lane: 'priority', kind: 'single', frame: 'normal' };
};

export class EventHandler {
    constructor(
        private readonly queue: PrintQueue,
        private readonly engine: PrinterEngine,
        private readonly bus: Bus,
        private readonly giftConfig: AppConfig['gift'],
        private readonly maxFreeQueue: number = Infinity,
    ) {}

    private readonly followedUsers = new Set<string>();
    private readonly commentProgress = new Map<string, { count: number; expiresAt: number; blocked: boolean }>();
    private readonly commentResetMs = 7 * 60_000;
    private commentCleanupTimer: ReturnType<typeof setInterval> | null = null;

    private cleanComments(now: number): void {
        for (const [id, state] of this.commentProgress) {
            if (state.expiresAt <= now) this.commentProgress.delete(id);
        }
        if (this.commentProgress.size === 0 && this.commentCleanupTimer) {
            clearInterval(this.commentCleanupTimer);
            this.commentCleanupTimer = null;
        }
    }

    private scheduleCommentCleanup(): void {
        if (this.commentCleanupTimer) return;
        // Một timer dùng chung; không giữ avatar/nội dung comment trong bộ đếm.
        this.commentCleanupTimer = setInterval(() => this.cleanComments(Date.now()), 1000);
        this.commentCleanupTimer.unref();
    }
    handle(input: NewEventInput): HandleResult {
        const event = normalizeEvent(input);
        this.bus.emit('event', event);

        const rule = classifyEvent(event, this.giftConfig);

        this.cleanComments(event.timestamp);
        if (event.type === 'FOLLOW' && this.followedUsers.has(event.userId)) {
            return { accepted: false, reason: 'duplicate', event };
        }
        if (event.type === 'COMMENT') {
            const state = this.commentProgress.get(event.userId);
            if (state?.blocked) return { accepted: false, reason: 'duplicate', event };
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
        if (event.type === 'COMMENT') {
            const count = (this.commentProgress.get(event.userId)?.count ?? 0) + 1;
            this.commentProgress.set(event.userId, { count, blocked: count >= 5, expiresAt: event.timestamp + this.commentResetMs });
            this.scheduleCommentCleanup();
        }
        if (event.type === 'FOLLOW') this.followedUsers.add(event.userId);
        this.queue.enqueue(job);
        this.engine.kick();
        return { accepted: true, job, event };
    }
}
