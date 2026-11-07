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
    // In tên hiển thị trên hồ sơ; ID tài khoản vẫn dùng riêng để tính lượt/chống trùng.
    const rawName = [user?.['nickname'], d['nickname'], user?.['uniqueId'], user?.['displayId'], d['uniqueId']]
        .find((name) => typeof name === 'string' && name.trim().length > 0) ?? 'Viewer';

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
        private readonly interactions = { printOnJoin: false },
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
        this.likeRemainders.clear();
        this.interactionMessages.clear();
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
        conn.on(WebcastEvent.LIKE, safe('like', (d) => this.onLike(d)));
        conn.on(WebcastEvent.SHARE, safe('share', (d) => this.onShare(d)));
        conn.on(WebcastEvent.MEMBER, safe('join', (d) => this.onJoin(d)));

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
    /** Combo đã tự in vì im lặng quá lâu: nhớ số đã in để tín hiệu kết thúc đến muộn không in trùng */
    private readonly flushed = new Map<string, { count: number; expires: number }>();

    private onChat(data: Loose): void {
        this.handler.handle({ type: 'COMMENT', ...extractUser(data), avatarUrl: extractAvatarUrl(data) });
    }

    private onFollow(data: Loose): void {
        this.handler.handle({ type: 'FOLLOW', ...extractUser(data), avatarUrl: extractAvatarUrl(data) });
    }

    private readonly likeRemainders = new Map<string, { count: number; prints: number }>();
    private readonly interactionMessages = new Map<string, number>();

    private duplicateInteraction(kind: string, data: Loose): boolean {
        const id = data.common?.msgId ?? data.msgId;
        if (!id || String(id) === '0') return false;
        const key = `${kind}:${String(id)}`;
        const now = Date.now();
        const previous = this.interactionMessages.get(key);
        if (previous !== undefined && now - previous < 5 * 60_000) return true;
        if (this.interactionMessages.size >= 5000) {
            this.interactionMessages.delete(this.interactionMessages.keys().next().value!);
        }
        this.interactionMessages.set(key, now);
        return false;
    }

    private onLike(data: Loose): void {
        const user = extractUser(data);
        // Không dùng totalLikeCount/total: đây là tổng tim cả phòng.
        const count = Number(data.likeCount ?? data.count);
        if (user.userId === 'anonymous' || !Number.isSafeInteger(count) || count <= 0) return;
        if (this.duplicateInteraction('like', data)) return;
        const state = this.likeRemainders.get(user.userId) ?? { count: 0, prints: 0 };
        state.count = Math.min(Number.MAX_SAFE_INTEGER, state.count + count);
        this.likeRemainders.set(user.userId, state);
        // Chỉ 5 lượt đầu dùng 10 tim; từ lượt 6 luôn là 30 tim.
        while (state.count >= (state.prints < 5 ? 10 : 30)) {
            const required = state.prints < 5 ? 10 : 30;
            const result = this.handler.handle({ type: 'LIKE', ...user, avatarUrl: extractAvatarUrl(data) });
            if (!result.accepted) break;
            state.count -= required;
            state.prints = Math.min(5, state.prints + 1);
        }
    }

    private onShare(data: Loose): void {
        const user = extractUser(data);
        if (user.userId === 'anonymous') return;
        if (this.duplicateInteraction('share', data)) return;
        this.handler.handle({ type: 'SHARE', ...user, avatarUrl: extractAvatarUrl(data) });
    }

    private onJoin(data: Loose): void {
        if (!this.interactions.printOnJoin || Number(data.action ?? 1) !== 1) return;
        const user = extractUser(data);
        if (!user.userId || user.userId === 'anonymous' || this.duplicateInteraction('join', data)) return;
        this.handler.handle({ type: 'JOIN', ...user, avatarUrl: extractAvatarUrl(data) });
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
        const now = Date.now();
        for (const [k, f] of this.flushed) if (f.expires < now) this.flushed.delete(k);
        // repeatCount của TikTok là cộng dồn: trừ phần đã in khi combo bị tự in sớm
        const already = this.flushed.get(key)?.count ?? 0;
        const prev = this.streaks.get(key);
        if (prev) clearTimeout(prev.timer);
        if (data?.repeatEnd) {
            this.streaks.delete(key);
            this.flushed.delete(key);
            const remaining = Math.max(total, prev?.total ?? 0) - already;
            if (remaining > 0) this.emitGift(data, remaining);
            return;
        }
        // phòng khi TikTok không gửi tín hiệu kết thúc: im 4s thì tự in phần chưa in
        const timer = setTimeout(() => {
            const cur = this.streaks.get(key);
            this.streaks.delete(key);
            if (!cur) return;
            const done = this.flushed.get(key)?.count ?? 0;
            if (cur.total > done) {
                this.emitGift(cur.data, cur.total - done);
                this.flushed.set(key, { count: cur.total, expires: Date.now() + 60_000 });
            }
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
    public simulate(kind: 'chat' | 'follow' | 'gift' | 'like' | 'share' | 'join', data: Loose): void {
        if (kind === 'chat') this.onChat(data);
        else if (kind === 'follow') this.onFollow(data);
        else if (kind === 'like') this.onLike(data);
        else if (kind === 'share') this.onShare(data);
        else if (kind === 'join') this.onJoin(data);
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
