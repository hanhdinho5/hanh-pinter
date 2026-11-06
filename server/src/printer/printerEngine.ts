import type { Bus } from '../events/bus.js';
import type { PrintQueue } from '../queue/printQueue.js';
import type { PrintJob, PrinterState } from '../types/index.js';
import type { SheetManager } from './sheetManager.js';

export interface EngineOptions {
    basePrintMs: number;
    fullPageTimeFactor: number;
    minSpeed: number;
    maxSpeed: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Xử lý tuần tự từng job: lấy từ queue → in → đặt vào tờ giấy. */
export class PrinterEngine {
    private paused = false;
    private running = false;
    private speed = 1;
    private currentJob: PrintJob | null = null;

    constructor(
        private readonly queue: PrintQueue,
        private readonly sheets: SheetManager,
        private readonly bus: Bus,
        private readonly options: EngineOptions,
    ) {}

    /** Gọi mỗi khi có job mới hoặc khi resume. An toàn khi gọi nhiều lần. */
    kick(): void {
        if (this.running || this.paused) return;
        void this.run();
    }

    pause(): void {
        if (this.paused) return;
        this.paused = true; // job đang in vẫn được in xong
        this.emitState();
    }

    resume(): void {
        if (!this.paused) return;
        this.paused = false;
        this.emitState();
        this.kick();
    }

    setSpeed(speed: number): number {
        this.speed = Math.min(this.options.maxSpeed, Math.max(this.options.minSpeed, speed));
        this.emitState();
        return this.speed;
    }

    /** Chờ đến khi engine rảnh (dùng cho test). */
    async idle(): Promise<void> {
        while (this.running) await sleep(5);
    }

    getState(): PrinterState {
        return {
            status: this.paused ? 'paused' : this.currentJob ? 'printing' : 'idle',
            paused: this.paused,
            speed: this.speed,
            currentJob: this.currentJob,
            sheet: this.sheets.current,
            sheetsCompleted: this.sheets.completedCount,
        };
    }

    private async run(): Promise<void> {
        this.running = true;
        try {
            while (!this.paused) {
                const job = this.queue.next();
                if (!job) break;
                await this.process(job);
            }
        } finally {
            this.running = false;
            this.emitState();
        }
    }

    private async process(job: PrintJob): Promise<void> {
        this.currentJob = job;
        // Mọi bước đều nằm trong try: lỗi bất kỳ chỉ làm hỏng job này, máy in không bị kẹt
        try {
            const isWide = job.frame === 'gold' || job.frame === 'vip';

            // Đổi tờ (nếu cần) TRƯỚC khi in để client vẽ lên đúng tờ, đúng ô
            const isFullPage = job.kind === 'fullPage';
            const early = isFullPage ? this.sheets.prepareFullPage() : this.sheets.prepareEntry(isWide);
            for (const sheet of early) this.bus.emit('printer:sheet:completed', sheet);
            if (early.length > 0 || isFullPage) this.bus.emit('printer:sheet', this.sheets.current);

            const factor = job.kind === 'fullPage' || job.frame === 'vip' ? this.options.fullPageTimeFactor : 1;
            const durationMs = (this.options.basePrintMs * factor) / this.speed;

            job.slot = isFullPage ? 0 : this.sheets.getNextSlot(isWide);
            job.sheetId = this.sheets.current.id;
            job.durationMs = durationMs; // client vẽ đúng nhịp với server
            this.bus.emit('printer:job:started', job);
            this.emitState();

            await sleep(durationMs);
            this.place(job);
            this.queue.finish(job, 'completed');
            this.bus.emit('printer:job:completed', job);
        } catch (error) {
            console.error('Print job failed:', job.id, error);
            this.queue.finish(job, 'failed');
            this.bus.emit('printer:job:failed', job);
        } finally {
            this.currentJob = null;
        }
    }

    private place(job: PrintJob): void {
        const input = {
            jobId: job.id,
            userId: job.userId,
            username: job.username,
            avatarUrl: job.avatarUrl,
            frame: job.frame,
            isWide: job.frame === 'gold' || job.frame === 'vip',
        };

        if (job.kind === 'fullPage') {
            const done = this.sheets.addFullPage(input);
            const special = done[done.length - 1];
            if (special) job.sheetId = special.id;
            for (const sheet of done) this.bus.emit('printer:sheet:completed', sheet);
            this.bus.emit('printer:sheet', this.sheets.current);
            return;
        }

        const { sheet, completed } = this.sheets.addEntry(input);
        this.bus.emit('printer:sheet', sheet);
        if (completed) {
            this.bus.emit('printer:sheet:completed', completed);
            this.bus.emit('printer:sheet', this.sheets.current);
        }
    }

    private emitState(): void {
        this.bus.emit('printer:state', this.getState());
    }
}
