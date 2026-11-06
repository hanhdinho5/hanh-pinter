import type { FrameType, Sheet, SheetEntry } from '../types/index.js';

export interface EntryInput {
    jobId: string;
    userId: string;
    username: string;
    avatarUrl: string | null;
    frame: FrameType;
    isWide?: boolean;
}

/** Quản lý tờ giấy hiện tại và các vị trí avatar (mặc định 4 avatar = 2 hàng x 2 cột; quà to chiếm nguyên 1 hàng). */
export class SheetManager {
    private nextId = 1;
    private sheet: Sheet;
    completedCount = 0;

    constructor(private readonly capacity: number = 4) {
        this.sheet = this.createSheet('standard');
    }

    get current(): Sheet {
        return this.sheet;
    }

    /** Trạng thái chiếm chỗ của 2 hàng trên tờ hiện tại (Hàng 0: slot 0, 1; Hàng 1: slot 2, 3) */
    public getRowStatus(sheet: Sheet = this.sheet) {
        const row0Entries = sheet.entries.filter((e) => e.slot === 0 || e.slot === 1);
        const row1Entries = sheet.entries.filter((e) => e.slot === 2 || e.slot === 3);

        const row0HasWide = row0Entries.some((e) => e.isWide);
        const row1HasWide = row1Entries.some((e) => e.isWide);

        // Hàng 0 đầy nếu có quà to chiếm nguyên hàng hoặc đã đủ 2 avatar
        const row0Full = row0HasWide || row0Entries.length >= 2;
        // Hàng 1 đầy nếu có quà to chiếm nguyên hàng hoặc đã đủ 2 avatar
        const row1Full = row1HasWide || row1Entries.length >= 2;

        return {
            row0Entries,
            row1Entries,
            row0HasWide,
            row1HasWide,
            row0Full,
            row1Full,
            isSheetFull: row0Full && row1Full,
        };
    }

    /** Vị trí slot tiếp theo dự kiến */
    public getNextSlot(isWide = false): number {
        const status = this.getRowStatus();

        if (isWide) {
            // Quà to cần một hàng hoàn toàn trống
            if (status.row0Entries.length === 0) return 0;
            if (status.row1Entries.length === 0) return 2;
            // Cả 2 hàng đều có người -> sẽ sang trang mới ở hàng 0
            return 0;
        }

        // Quà bé / avatar thường: ưu tiên điền nốt hàng 0 rồi đến hàng 1
        if (!status.row0Full) {
            return status.row0Entries.some((e) => e.slot === 0) ? 1 : 0;
        }
        if (!status.row1Full) {
            return status.row1Entries.some((e) => e.slot === 2) ? 3 : 2;
        }
        return 0;
    }

    get nextSlot(): number {
        return this.getNextSlot(false);
    }

    hasUser(userId: string): boolean {
        return this.sheet.entries.some((e) => e.userId === userId);
    }

    /**
     * Chuẩn bị tờ TRƯỚC khi in một avatar: nếu tờ hiện tại không còn chỗ (quà to cần 1 hàng trống,
     * hoặc tờ đã đầy) thì đổi sang tờ mới ngay. Nhờ vậy client vẽ đúng tờ, đúng ô ngay từ đầu.
     * Trả về các tờ vừa hoàn tất (để báo cho client trước khi bắt đầu in).
     */
    prepareEntry(isWide: boolean): Sheet[] {
        const status = this.getRowStatus();
        const noRowForWide = isWide && status.row0Entries.length > 0 && status.row1Entries.length > 0;
        if (this.sheet.kind === 'special' || noRowForWide || status.isSheetFull) {
            return [this.rotate()];
        }
        return [];
    }

    /** Chuẩn bị trang đặc biệt TRƯỚC khi in: đẩy tờ đang dở đi rồi đặt trang đặc biệt (trống) làm tờ hiện tại. */
    prepareFullPage(): Sheet[] {
        if (this.sheet.kind === 'special' && this.sheet.entries.length === 0) return [];
        const completed: Sheet[] = [];
        if (this.sheet.entries.length > 0) {
            const done = this.sheet;
            done.completed = true;
            this.completedCount += 1;
            completed.push(done);
        }
        this.sheet = this.createSheet('special', 1);
        return completed;
    }

    /** Thêm avatar vào tờ hiện tại. Hỗ trợ avatar quà to chiếm nguyên một hàng. */
    addEntry(input: EntryInput): { sheet: Sheet; completed: Sheet | null } {
        const isWide = Boolean(input.isWide ?? (input.frame !== 'normal'));
        let status = this.getRowStatus();
        let earlyCompletedSheet: Sheet | null = null;

        // Nếu là quà to mà không có hàng nào trống hoàn toàn, hoặc tờ đã đầy:
        if ((isWide && status.row0Entries.length > 0 && status.row1Entries.length > 0) || status.isSheetFull) {
            earlyCompletedSheet = this.rotate();
            status = this.getRowStatus();
        }

        let slot: number;
        if (isWide) {
            slot = status.row0Entries.length === 0 ? 0 : 2;
        } else {
            if (!status.row0Full) {
                slot = status.row0Entries.some((e) => e.slot === 0) ? 1 : 0;
            } else {
                slot = status.row1Entries.some((e) => e.slot === 2) ? 3 : 2;
            }
        }

        const entry: SheetEntry = {
            slot,
            isWide,
            ...input,
        };
        this.sheet.entries.push(entry);

        // Sau khi thêm, kiểm tra tờ có đầy hoàn toàn không
        const afterStatus = this.getRowStatus();
        if (afterStatus.isSheetFull) {
            const rotated = this.rotate();
            return { sheet: this.sheet, completed: earlyCompletedSheet ?? rotated };
        }

        return { sheet: this.sheet, completed: earlyCompletedSheet };
    }

    /**
     * In nguyên một trang (Full Page Special): tờ đang dở (nếu có) được đẩy đi trước,
     * rồi tạo tờ đặc biệt chỉ có 1 avatar và hoàn tất ngay.
     */
    addFullPage(input: EntryInput): Sheet[] {
        const completed = this.prepareFullPage(); // rỗng nếu đã chuẩn bị trước khi in
        this.sheet.entries.push({ slot: 0, isWide: true, ...input });
        completed.push(this.rotate()); // trang đặc biệt hoàn tất, sang tờ thường mới
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
