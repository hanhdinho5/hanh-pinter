import type { Bus } from '../events/bus.js';
import type { PrintJob, QueueState } from '../types/index.js';

/** Hàng đợi in: 2 lane (priority trước free), FIFO trong mỗi lane. */
export class PrintQueue {
    private readonly priority: PrintJob[] = [];
    private readonly free: PrintJob[] = [];
    private active: PrintJob | null = null;
    private readonly completed: PrintJob[] = [];

    constructor(
        private readonly bus: Bus,
        private readonly historyLimit: number,
    ) {}

    enqueue(job: PrintJob): void {
        (job.lane === 'priority' ? this.priority : this.free).push(job);
        this.emit();
    }

    /** Lấy job kế tiếp và đánh dấu đang in. Chỉ trả job khi không có job nào đang in. */
    next(): PrintJob | null {
        if (this.active) return null;
        const job = this.priority.shift() ?? this.free.shift() ?? null;
        if (!job) return null;
        job.status = 'printing';
        job.startedAt = Date.now();
        this.active = job;
        this.emit();
        return job;
    }

    finish(job: PrintJob, status: 'completed' | 'failed'): void {
        job.status = status;
        job.completedAt = Date.now();
        if (this.active?.id === job.id) this.active = null;
        this.completed.unshift(job);
        this.completed.length = Math.min(this.completed.length, this.historyLimit);
        this.emit();
    }

    /** User đang chờ hoặc đang in ở lane free (dùng chống trùng). */
    hasFreeJobFor(userId: string): boolean {
        return (
            this.free.some((j) => j.userId === userId) ||
            (this.active?.lane === 'free' && this.active.userId === userId)
        );
    }

    get size(): number {
        return this.priority.length + this.free.length;
    }

    snapshot(): QueueState {
        return {
            pendingPriority: [...this.priority],
            pendingFree: [...this.free],
            printing: this.active,
            recentCompleted: [...this.completed],
        };
    }

    private emit(): void {
        this.bus.emit('queue', this.snapshot());
    }
}
