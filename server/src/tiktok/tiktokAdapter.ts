import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import type { Bus } from '../events/bus.js';
import type { EventHandler, NewEventInput } from '../events/eventHandler.js';
import type { TikTokConnectionStatus, TikTokStatus } from '../types/index.js';
import { loadSettings, saveSettings } from '../settings.js';

export type { TikTokConnectionStatus, TikTokStatus };

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const extractAvatarUrl = (data: unknown): string | null => {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;

    // Ưu tiên ảnh lớn (avatarLarger/Medium) cho avatar in ra nét, ảnh thumb chỉ ~100px
    const u = d['user'] as Record<string, unknown> | undefined;
    for (const key of ['avatarLarger', 'avatarLarge', 'avatarMedium']) {
        const big = u?.[key] as Record<string, unknown> | undefined;
        if (Array.isArray(big?.['urlList']) && big['urlList'].length > 0) return String(big['urlList'][0]);
    }

    if (typeof d['profilePictureUrl'] === 'string' && d['profilePictureUrl']) {
        return d['profilePictureUrl'];
    }
    if (Array.isArray(d['profilePictureUrls']) && d['profilePictureUrls'].length > 0) {
        return String(d['profilePictureUrls'][0]);
    }

    const userDetails = d['userDetails'] as Record<string, unknown> | undefined;
    if (Array.isArray(userDetails?.['profilePictureUrls']) && userDetails['profilePictureUrls'].length > 0) {
        return String(userDetails['profilePictureUrls'][0]);
    }

    const user = d['user'] as Record<string, unknown> | undefined;
    const pic = user?.['profilePicture'] as Record<string, unknown> | undefined;
    if (Array.isArray(pic?.['urls']) && pic['urls'].length > 0) return String(pic['urls'][0]);
    const thumb = user?.['avatarThumb'] as Record<string, unknown> | undefined;
    if (Array.isArray(thumb?.['urlList']) && thumb['urlList'].length > 0) {
        return String(thumb['urlList'][0]);
    }

    const medium = user?.['avatarMedium'] as Record<string, unknown> | undefined;
    if (Array.isArray(medium?.['urlList']) && medium['urlList'].length > 0) {
        return String(medium['urlList'][0]);
    }

    return null;
};

export const extractUser = (data: unknown): { userId: string; username: string } => {
    if (!data || typeof data !== 'object') return { userId: 'anonymous', username: 'Viewer' };
    const d = data as Record<string, unknown>;
    const user = d['user'] as Record<string, unknown> | undefined;

    const rawId = d['userId'] ?? user?.['userId'] ?? user?.['id'] ?? user?.['uniqueId'] ?? d['uniqueId'] ?? 'anonymous';
    const rawName =
        user?.['uniqueId'] ?? user?.['displayId'] ?? d['uniqueId'] ?? user?.['nickname'] ?? d['nickname'] ?? 'Viewer';

    return {
        userId: String(rawId),
        username: String(rawName),
    };
};

export const extractGift = (data: Loose): { giftId: string; giftName: string; diamondCount: number; streakable: boolean } => ({
    giftId: String(data?.giftId ?? data?.gift?.id ?? 'gift'),
    giftName: String(data?.giftName ?? data?.giftDetails?.giftName ?? data?.gift?.name ?? 'TikTok Gift'),
    diamondCount: Math.max(
        1,
        Number(data?.diamondCount ?? data?.giftDetails?.diamondCount ?? data?.gift?.diamondCount ?? 1) || 1,
    ),
    streakable: (data?.giftType ?? data?.giftDetails?.giftType ?? data?.gift?.type) === 1,
});

export class TikTokAdapter {
    private connection: TikTokLiveConnection | null = null;
    private currentUsername: string | null = null;
    private roomId: string | null = null;
    private status: TikTokConnectionStatus = 'disconnected';
    private lastError: string | null = null;
    private reconnectAttempts = 0;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private shouldReconnect = false;

    constructor(
        private readonly handler: EventHandler,
        private readonly bus?: Bus,
    ) {}

    public getStatus(): TikTokStatus {
        return {
            status: this.status,
            username: this.currentUsername,
            roomId: this.roomId,
            error: this.lastError,
            reconnectAttempts: this.reconnectAttempts,
        };
    }

    /** Khởi động server: tự nối lại tài khoản đã lưu lần trước. */
    public autoConnectFromSettings(): void {
        const user = loadSettings().tiktokUser;
        if (user) {
            console.log(`[TikTok] Tự kết nối lại @${user} (đã lưu từ lần trước)`);
            void this.connect(user);
        }
    }

    public async connect(username: string): Promise<{ success: boolean; message?: string }> {
        const cleanUsername = username.replace(/^@/, '').trim();
        if (!cleanUsername) return { success: false, message: 'Tên người dùng TikTok không hợp lệ' };

        if (this.connection && this.currentUsername === cleanUsername && this.status === 'connected') {
            return { success: true, message: 'Đã kết nối với phiên live này' };
        }

        await this.teardown();
        this.currentUsername = cleanUsername;
        this.shouldReconnect = true;
        this.lastError = null;
        this.reconnectAttempts = 0;
        saveSettings({ tiktokUser: cleanUsername });
        this.setStatus('connecting');
        return this.initiateConnection();
    }

    /** Chủ động ngắt: không tự nối lại, lần bật server sau cũng không tự nối. */
    public async disconnect(): Promise<void> {
        await this.teardown();
        saveSettings({ tiktokUser: '' });
        this.setStatus('disconnected');
    }

    private async teardown(): Promise<void> {
        this.shouldReconnect = false;
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
        this.dropConnection();
        this.roomId = null;
    }

    private dropConnection(): void {
        const conn = this.connection;
        this.connection = null; // đặt trước để listener của kết nối cũ biết mình đã "lỗi thời"
        if (conn) {
            try {
                conn.disconnect();
            } catch (err) {
                console.error('[TikTok] Lỗi khi ngắt kết nối cũ:', err);
            }
        }
    }

    private async initiateConnection(): Promise<{ success: boolean; message?: string }> {
        const username = this.currentUsername;
        if (!username) return { success: false, message: 'Chưa có username TikTok' };

        this.dropConnection();
        const conn = new TikTokLiveConnection(username, {
            processInitialData: false,
            enableExtendedGiftInfo: false, // cần gói trả phí; sự kiện quà đã có tên và kim cương
        });
        this.connection = conn;
        this.setupEventListeners(conn);

        try {
            const live = await conn.fetchIsLive().catch(() => true); // hỏi lỗi thì cứ thử kết nối
            if (!live) throw new Error('Tài khoản này CHƯA LIVE. Hãy bấm Phát trực tiếp trước rồi kết nối');
            const state = await Promise.race([
                conn.connect(),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Quá 30 giây không vào được phòng live')), 30_000)),
            ]);
            if (this.connection !== conn) return { success: false, message: 'Đã bị thay bằng kết nối khác' };

            this.roomId = state?.roomId ? String(state.roomId) : null;
            this.reconnectAttempts = 0;
            this.lastError = null;
            this.setStatus('connected');
            console.log(`[TikTok] Đã kết nối @${username} (room ${this.roomId})`);
            return { success: true, message: `Đã kết nối phòng LIVE @${username}` };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[TikTok] Lỗi kết nối @${username}:`, msg);
            if (this.connection !== conn) return { success: false, message: msg };
            this.lastError = msg;
            this.dropConnection();
            this.scheduleReconnect();
            return { success: false, message: msg };
        }
    }

    private setupEventListeners(connection: TikTokLiveConnection): void {
        // typings của thư viện không tương thích TS 7: dùng giao diện tối thiểu
        const conn = connection as unknown as { on(event: string, listener: (data: Loose) => void): unknown };
        const current = () => this.connection === connection;
        const safe = (name: string, fn: (data: Loose) => void) => (data: Loose) => {
            if (!current()) return;
            try {
                fn(data);
            } catch (err) {
                console.error(`[TikTok] Lỗi xử lý sự kiện ${name}:`, err);
            }
        };

        conn.on(WebcastEvent.CHAT, safe('chat', (d) => this.onChat(d)));
        conn.on(WebcastEvent.FOLLOW, safe('follow', (d) => this.onFollow(d)));
        conn.on(WebcastEvent.GIFT, safe('gift', (d) => this.onGift(d)));

        conn.on(ControlEvent.DISCONNECTED, () => {
            if (!current()) return;
            console.warn(`[TikTok] Mất kết nối @${this.currentUsername}`);
            this.dropConnection();
            this.scheduleReconnect();
        });

        conn.on(WebcastEvent.STREAM_END, () => {
            if (!current()) return;
            console.log(`[TikTok] Livestream @${this.currentUsername} đã kết thúc`);
            this.lastError = 'Phiên live đã kết thúc';
            this.dropConnection();
            this.scheduleReconnect();
        });

        conn.on(ControlEvent.ERROR, (err: unknown) => {
            if (!current()) return;
            const e = err as { message?: string; info?: string; exception?: { message?: string } } | null;
            this.lastError = e?.message ?? e?.info ?? e?.exception?.message ?? 'Lỗi không rõ';
            console.error('[TikTok] Lỗi kết nối:', this.lastError);
            this.emitStatus(); // chỉ báo lỗi; đã rớt thì sự kiện DISCONNECTED lo việc nối lại
        });
    }

    private readonly streaks = new Map<string, { data: Loose; total: number; timer: NodeJS.Timeout }>();

    private onChat(data: Loose): void {
        this.handler.handle({ type: 'COMMENT', ...extractUser(data), avatarUrl: extractAvatarUrl(data) });
    }

    private onFollow(data: Loose): void {
        this.handler.handle({ type: 'FOLLOW', ...extractUser(data), avatarUrl: extractAvatarUrl(data) });
    }

    /** Combo: TikTok gửi lại cùng quà với repeatCount cộng dồn -> gộp thành MỘT vé với tổng, in khi combo kết thúc. */
    private onGift(data: Loose): void {
        const gift = extractGift(data);
        const total = Math.max(1, Number(data?.repeatCount ?? 1) || 1);
        if (!gift.streakable) {
            this.emitGift(data, total);
            return;
        }
        const key = `${extractUser(data).userId}_${gift.giftId}`;
        const prev = this.streaks.get(key);
        if (prev) clearTimeout(prev.timer);
        if (data?.repeatEnd) {
            this.streaks.delete(key);
            this.emitGift(data, total);
            return;
        }
        // phòng khi TikTok không gửi tín hiệu kết thúc: im 4s thì tự in
        const timer = setTimeout(() => {
            const cur = this.streaks.get(key);
            this.streaks.delete(key);
            if (cur) this.emitGift(cur.data, cur.total);
        }, 4000);
        timer.unref();
        this.streaks.set(key, { data, total: Math.max(total, prev?.total ?? 0), timer });
    }

    private emitGift(data: Loose, giftCount: number): void {
        const gift = extractGift(data);
        const input: NewEventInput = {
            type: 'GIFT',
            ...extractUser(data),
            avatarUrl: extractAvatarUrl(data),
            giftId: gift.giftId,
            giftName: gift.giftName,
            giftCount,
            diamondCount: gift.diamondCount,
        };
        this.handler.handle(input);
    }

    /** Dùng để thử khi chưa live: đưa dữ liệu thô (đúng dạng TikTok) vào đúng đường xử lý thật. */
    public simulate(kind: 'chat' | 'follow' | 'gift', data: Loose): void {
        if (kind === 'chat') this.onChat(data);
        else if (kind === 'follow') this.onFollow(data);
        else this.onGift(data);
    }

    /** Nối lại vô hạn khi còn muốn giữ kết nối (treo live cả ngày): 5s, 10s, 20s, 40s, tối đa 60s. */
    private scheduleReconnect(): void {
        if (!this.shouldReconnect || this.reconnectTimeout) return;
        const delayMs = Math.min(60_000, 5_000 * 2 ** this.reconnectAttempts);
        this.reconnectAttempts++;
        console.log(`[TikTok] Thử kết nối lại sau ${Math.round(delayMs / 1000)}s (lần ${this.reconnectAttempts})`);
        this.setStatus('reconnecting');
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            if (this.shouldReconnect) void this.initiateConnection();
        }, delayMs);
    }

    private setStatus(status: TikTokConnectionStatus): void {
        this.status = status;
        this.emitStatus();
    }

    private emitStatus(): void {
        this.bus?.emit('tiktok:status', this.getStatus());
    }
}
