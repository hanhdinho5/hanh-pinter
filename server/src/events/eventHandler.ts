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
        private readonly sheets: SheetManager,
        private readonly engine: PrinterEngine,
        private readonly bus: Bus,
        private readonly giftConfig: AppConfig['gift'],
        private readonly maxFreeQueue: number = Infinity,
        /** Một người chỉ được in miễn phí lại sau khoảng này (ms); 0 = chỉ chặn trùng trong 1 tờ */
        private readonly freeCooldownMs: number = 0,
    ) {}

    private readonly lastFreePrint = new Map<string, number>();
    private readonly commentQuota = new Map<string, { count: number; blockedUntil: number }>();
    private readonly commentCooldownMs = 5 * 60_000;

    private inCooldown(userId: string, now: number): boolean {
        if (this.freeCooldownMs <= 0) return false;
        const last = this.lastFreePrint.get(userId);
        return last !== undefined && now - last < this.freeCooldownMs;
    }

    private markFreePrint(userId: string, now: number): void {
        if (this.freeCooldownMs <= 0) return;
        if (this.lastFreePrint.size > 5000) {
            for (const [id, t] of this.lastFreePrint) if (now - t >= this.freeCooldownMs) this.lastFreePrint.delete(id);
        }
        this.lastFreePrint.set(userId, now);
    }

    handle(input: NewEventInput): HandleResult {
        const event = normalizeEvent(input);
        this.bus.emit('event', event);

        const rule = classifyEvent(event, this.giftConfig);

        // Comment: 5 lượt được nhận, rồi nghỉ 5 phút tính từ lượt thứ 5.
        const quota = this.commentQuota.get(event.userId);
        if (event.type === 'COMMENT' && quota && quota.blockedUntil > event.timestamp) {
            return { accepted: false, reason: 'duplicate', event };
        }
        // Follow vẫn chống trùng như trước; quà không bị giới hạn.
        if (
            event.type === 'FOLLOW' &&
            (this.sheets.hasUser(event.userId) ||
                this.queue.hasFreeJobFor(event.userId) ||
                this.inCooldown(event.userId, event.timestamp))
        ) {
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
        if (event.type === 'COMMENT') {
            // Dọn các đợt chờ đã hết hạn; comment bị từ chối không kéo dài thời gian chờ.
            for (const [id, state] of this.commentQuota) {
                if (state.blockedUntil > 0 && state.blockedUntil <= event.timestamp) this.commentQuota.delete(id);
            }
            const previous = this.commentQuota.get(event.userId);
            const count = (previous?.count ?? 0) + 1;
            this.commentQuota.set(event.userId, {
                count,
                blockedUntil: count >= 5 ? event.timestamp + this.commentCooldownMs : 0,
            });
        }
        if (event.type === 'FOLLOW') this.markFreePrint(event.userId, event.timestamp);
        this.queue.enqueue(job);
        this.engine.kick();
        return { accepted: true, job, event };
    }
}
