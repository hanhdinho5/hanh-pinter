import { WebcastPushConnection } from 'tiktok-live-connector/legacy';
import type { Bus } from '../events/bus.js';
import type { EventHandler, NewEventInput } from '../events/eventHandler.js';

export type TikTokConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface TikTokStatus {
    status: TikTokConnectionStatus;
    username: string | null;
    roomId: string | null;
    error: string | null;
    reconnectAttempts: number;
}

export interface TikTokChatEvent {
    userId?: string | number;
    uniqueId?: string;
    nickname?: string;
    comment?: string;
    profilePictureUrl?: string;
    profilePictureUrls?: string[];
    userDetails?: {
        profilePictureUrls?: string[];
    };
    user?: {
        id?: string;
        uniqueId?: string;
        nickname?: string;
        avatarThumb?: { urlList?: string[] };
        avatarMedium?: { urlList?: string[] };
    };
}

export interface TikTokGiftEvent extends TikTokChatEvent {
    giftId?: number | string;
    giftName?: string;
    repeatCount?: number;
    diamondCount?: number;
    giftType?: number;
    repeatEnd?: boolean | number;
}

export const extractAvatarUrl = (data: unknown): string | null => {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;

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

    const rawId = d['userId'] ?? user?.['id'] ?? d['uniqueId'] ?? 'anonymous';
    const rawName = d['uniqueId'] ?? d['nickname'] ?? user?.['uniqueId'] ?? user?.['nickname'] ?? 'Viewer';

    return {
        userId: String(rawId),
        username: String(rawName),
    };
};

export class TikTokAdapter {
    private connection: WebcastPushConnection | null = null;
    private currentUsername: string | null = null;
    private roomId: string | null = null;
    private status: TikTokConnectionStatus = 'disconnected';
    private lastError: string | null = null;
    private reconnectAttempts = 0;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private shouldReconnect = false;
    private readonly maxReconnectAttempts = 10;

    constructor(
        private readonly handler: EventHandler,
        private readonly bus?: Bus
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

    public async connect(username: string): Promise<{ success: boolean; message?: string }> {
        const cleanUsername = username.replace(/^@/, '').trim();
        if (!cleanUsername) {
            return { success: false, message: 'Tên người dùng TikTok không hợp lệ' };
        }

        // Nếu đã kết nối với tài khoản này rồi
        if (this.connection && this.currentUsername === cleanUsername && this.status === 'connected') {
            return { success: true, message: 'Đã kết nối với phiên live này' };
        }

        // Ngắt kết nối phiên cũ nếu có
        await this.disconnect();

        this.currentUsername = cleanUsername;
        this.status = 'connecting';
        this.shouldReconnect = true;
        this.lastError = null;
        this.reconnectAttempts = 0;
        this.emitStatus();

        return this.initiateConnection();
    }

    public async disconnect(): Promise<void> {
        this.shouldReconnect = false;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.connection) {
            try {
                this.connection.disconnect();
            } catch (err) {
                console.error('Lỗi khi ngắt kết nối TikTok:', err);
            }
            this.connection = null;
        }

        this.status = 'disconnected';
        this.roomId = null;
        this.emitStatus();
    }

    private async initiateConnection(): Promise<{ success: boolean; message?: string }> {
        if (!this.currentUsername) {
            this.status = 'disconnected';
            return { success: false, message: 'Chưa có username TikTok' };
        }

        try {
            const conn = new WebcastPushConnection(this.currentUsername, {
                processInitialData: false,
                enableExtendedGiftInfo: true,
            });
            this.connection = conn;

            this.setupEventListeners(conn);

            const state = await conn.connect();
            this.status = 'connected';
            this.roomId = state?.roomId ? String(state.roomId) : null;
            this.reconnectAttempts = 0;
            this.lastError = null;
            this.emitStatus();

            console.log(`[TikTok Adapter] Đã kết nối thành công phòng LIVE của @${this.currentUsername} (RoomId: ${this.roomId})`);
            return { success: true, message: `Đã kết nối phòng LIVE @${this.currentUsername}` };
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[TikTok Adapter] Lỗi kết nối LIVE @${this.currentUsername}:`, errMsg);
            this.lastError = errMsg;

            if (this.shouldReconnect) {
                this.scheduleReconnect();
            } else {
                this.status = 'disconnected';
                this.emitStatus();
            }

            return { success: false, message: errMsg };
        }
    }

    private setupEventListeners(conn: WebcastPushConnection): void {
        // 1. Sự kiện bình luận (Comment / Chat)
        conn.on('chat', (data: TikTokChatEvent) => {
            try {
                const { userId, username } = extractUser(data);
                const avatarUrl = extractAvatarUrl(data);

                const input: NewEventInput = {
                    type: 'COMMENT',
                    userId,
                    username,
                    avatarUrl,
                };
                this.handler.handle(input);
            } catch (err) {
                console.error('[TikTok Adapter] Lỗi xử lý sự kiện chat:', err);
            }
        });

        // 2. Sự kiện theo dõi (Follow)
        conn.on('follow', (data: TikTokChatEvent) => {
            try {
                const { userId, username } = extractUser(data);
                const avatarUrl = extractAvatarUrl(data);

                const input: NewEventInput = {
                    type: 'FOLLOW',
                    userId,
                    username,
                    avatarUrl,
                };
                this.handler.handle(input);
            } catch (err) {
                console.error('[TikTok Adapter] Lỗi xử lý sự kiện follow:', err);
            }
        });

        // 3. Sự kiện tặng quà (Gift)
        conn.on('gift', (data: TikTokGiftEvent) => {
            try {
                // Với combo quà liên hoàn (streak gift), chỉ xử lý khi chuỗi combo kết thúc để in một vé tổng
                if (data.giftType === 1 && !data.repeatEnd) {
                    return;
                }

                const { userId, username } = extractUser(data);
                const avatarUrl = extractAvatarUrl(data);

                const giftCount = Math.max(1, Number(data.repeatCount ?? 1));
                const diamondCount = Math.max(1, Number(data.diamondCount ?? 1));

                const input: NewEventInput = {
                    type: 'GIFT',
                    userId,
                    username,
                    avatarUrl,
                    giftId: data.giftId ? String(data.giftId) : 'gift',
                    giftName: data.giftName ? String(data.giftName) : 'TikTok Gift',
                    giftCount,
                    diamondCount,
                };
                this.handler.handle(input);
            } catch (err) {
                console.error('[TikTok Adapter] Lỗi xử lý sự kiện gift:', err);
            }
        });

        // 4. Mất kết nối
        conn.on('disconnected', () => {
            console.warn(`[TikTok Adapter] Phiên LIVE của @${this.currentUsername} đã bị ngắt kết nối.`);
            if (this.shouldReconnect) {
                this.scheduleReconnect();
            } else {
                this.status = 'disconnected';
                this.emitStatus();
            }
        });

        // 5. Kết thúc phiên LIVE
        conn.on('streamEnd', () => {
            console.log(`[TikTok Adapter] Livestream của @${this.currentUsername} đã kết thúc.`);
            this.status = 'disconnected';
            this.shouldReconnect = false;
            this.emitStatus();
        });

        // 6. Lỗi kết nối
        conn.on('error', (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[TikTok Adapter] Lỗi socket kết nối:', message);
            this.lastError = message;

            if (this.shouldReconnect && this.status !== 'reconnecting') {
                this.scheduleReconnect();
            }
        });
    }

    private scheduleReconnect(): void {
        if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn(`[TikTok Adapter] Dừng tự động kết nối lại sau ${this.reconnectAttempts} lần thử.`);
            this.status = 'disconnected';
            this.emitStatus();
            return;
        }

        this.reconnectAttempts++;
        this.status = 'reconnecting';
        this.emitStatus();

        // Thời gian chờ tăng dần theo cấp số nhân (3s, 6s, 12s, max 30s)
        const delayMs = Math.min(30000, 3000 * Math.pow(1.5, this.reconnectAttempts - 1));
        console.log(`[TikTok Adapter] Sẽ thử kết nối lại sau ${Math.round(delayMs / 1000)}s (lần ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        this.reconnectTimeout = setTimeout(() => {
            void this.initiateConnection();
        }, delayMs);
    }

    private emitStatus(): void {
        const payload = this.getStatus();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.bus as any)?.emit('tiktok:status', payload);
    }
}
