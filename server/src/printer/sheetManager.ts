import type { FrameType, Sheet, SheetEntry } from '../types/index.js';

export interface EntryInput {
    jobId: string;
    userId: string;
    username: string;
    avatarUrl: string | null;
    frame: FrameType;
}

/** Quản lý tờ giấy hiện tại và các vị trí avatar. Không biết gì về queue hay socket. */
export class SheetManager {
    private nextId = 1;
    private sheet: Sheet;
    completedCount = 0;

    constructor(private readonly capacity: number) {
        this.sheet = this.createSheet('standard');
    }

    get current(): Sheet {
        return this.sheet;
    }

    /** Vị trí sẽ được in tiếp theo trên tờ hiện tại. */
    get nextSlot(): number {
        return this.sheet.entries.length;
    }

    hasUser(userId: string): boolean {
        return this.sheet.entries.some((e) => e.userId === userId);
    }

    /** Thêm avatar vào tờ hiện tại. Nếu đủ ô thì hoàn tất tờ và trả về tờ đã hoàn tất. */
    addEntry(input: EntryInput): { sheet: Sheet; completed: Sheet | null } {
        const entry: SheetEntry = { slot: this.nextSlot, ...input };
        this.sheet.entries.push(entry);
        if (this.sheet.entries.length >= this.sheet.capacity) {
            return { sheet: this.sheet, completed: this.rotate() };
        }
        return { sheet: this.sheet, completed: null };
    }

    /**
     * In nguyên một trang: tờ đang dở (nếu có) được đẩy đi trước,
     * rồi tạo tờ đặc biệt chỉ có 1 avatar và hoàn tất ngay.
     */
    addFullPage(input: EntryInput): Sheet[] {
        const completed: Sheet[] = [];
        if (this.sheet.entries.length > 0) completed.push(this.rotate());
        const special = this.createSheet('special', 1);
        special.entries.push({ slot: 0, ...input });
        special.completed = true;
        this.completedCount += 1;
        completed.push(special);
        return completed;
    }

    private rotate(): Sheet {
        const done = this.sheet;
        done.completed = true;
        this.completedCount += 1;
        this.sheet = this.createSheet('standard');
        return done;
    }

    private createSheet(kind: Sheet['kind'], capacity = this.capacity): Sheet {
        return { id: this.nextId++, kind, capacity, entries: [], completed: false };
    }
}
