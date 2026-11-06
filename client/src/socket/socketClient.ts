import { io, type Socket } from 'socket.io-client';
import { getRandomAvatarUrl } from '../printer3d/avatarManager';
import type { RealtimeEventMap, ViewerEvent, BackgroundConfig, AudioConfig } from '../types';

export type TypedSocket = Socket<RealtimeEventMap>;

export const DEFAULT_SERVER_URL =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SERVER_URL ??
    (typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : 'http://localhost:3001');

let sharedSocket: TypedSocket | null = null;

export function getSocket(serverUrl = DEFAULT_SERVER_URL): TypedSocket {
    if (!sharedSocket) {
        sharedSocket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        }) as unknown as TypedSocket;
    }
    return sharedSocket;
}

/** Đọc JSON; server báo lỗi ({ error }) hoặc mất kết nối thì ném Error có thông điệp tiếng Việt */
async function parse(res: Response): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
    let body: { error?: string } | null = null;
    try {
        body = await res.json();
    } catch {
        // không phải JSON
    }
    if (!res.ok) throw new Error(body?.error ?? `Lỗi server (${res.status})`);
    return body;
}

export const api = {
    async pause(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/printer/pause`, { method: 'POST' });
        return parse(res);
    },
    async resume(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/printer/resume`, { method: 'POST' });
        return parse(res);
    },
    async setSpeed(speed: number, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/printer/speed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ speed }),
        });
        return parse(res);
    },
    async sendMockComment(username: string, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/dev/events/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: `user-${username}-${Date.now()}`,
                username,
                avatarUrl: getRandomAvatarUrl(),
            }),
        });
        return parse(res);
    },
    async sendMockFollow(username: string, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/dev/events/follow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: `user-${username}-${Date.now()}`,
                username,
                avatarUrl: getRandomAvatarUrl(),
            }),
        });
        return parse(res);
    },
    async sendMockGift(
        username: string,
        giftName: string,
        diamondCount: number,
        serverUrl = DEFAULT_SERVER_URL
    ) {
        const res = await fetch(`${serverUrl}/api/dev/events/gift`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: `user-${username}-${Date.now()}`,
                username,
                avatarUrl: getRandomAvatarUrl(),
                giftId: `gift-${giftName.toLowerCase()}`,
                giftName,
                giftCount: 1,
                diamondCount,
            }),
        });
        return parse(res);
    },
    async getQueue(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/queue`);
        return parse(res);
    },
    async getPrinterState(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/printer/state`);
        return parse(res);
    },
    async connectTikTok(username: string, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/tiktok/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        });
        return parse(res);
    },
    async disconnectTikTok(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/tiktok/disconnect`, {
            method: 'POST',
        });
        return parse(res);
    },
    async getGiftConfig(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/config/gift`);
        return parse(res) as Promise<{ goldDiamonds: number; fullPageDiamonds: number }>;
    },
    async setGiftConfig(goldDiamonds: number, fullPageDiamonds: number, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/config/gift`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goldDiamonds, fullPageDiamonds }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Lỗi lưu cấu hình');
        return body as { goldDiamonds: number; fullPageDiamonds: number };
    },
    async getTikTokStatus(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/tiktok/status`);
        return parse(res);
    },
    async getBackgrounds(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/backgrounds`);
        return parse(res) as Promise<Array<{ id: string; name: string; url: string; badge: string }>>;
    },
    async getBackgroundConfig(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/config/background`);
        return parse(res) as Promise<BackgroundConfig>;
    },
    async setBackgroundConfig(patch: Partial<BackgroundConfig>, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/config/background`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Lỗi lưu cấu hình background');
        return body as BackgroundConfig;
    },
    async getAudioConfig(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/config/audio`);
        return parse(res) as Promise<AudioConfig>;
    },
    async nextBgmTrack(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/audio/next`, { method: 'POST' });
        if (!res.ok) throw new Error('Lỗi chuyển bài');
    },
    updateAudioRealtime(patch: Partial<AudioConfig>) {
        const socket = getSocket();
        if (socket?.connected) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (socket as any).emit('audio:update', patch);
        }
    },
    async setAudioConfig(patch: Partial<AudioConfig>, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/config/audio`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Lỗi lưu âm lượng');
        return body as AudioConfig;
    },
};
export type { ViewerEvent };

