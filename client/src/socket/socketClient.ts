import { io, type Socket } from 'socket.io-client';
import type { RealtimeEventMap, ViewerEvent, BackgroundConfig } from '../types';

export type TypedSocket = Socket<RealtimeEventMap>;

const DEFAULT_SERVER_URL =
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

export const api = {
    async pause(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/printer/pause`, { method: 'POST' });
        return res.json();
    },
    async resume(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/printer/resume`, { method: 'POST' });
        return res.json();
    },
    async setSpeed(speed: number, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/printer/speed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ speed }),
        });
        return res.json();
    },
    async sendMockComment(username: string, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/dev/events/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: `user-${username}-${Date.now()}`,
                username,
            }),
        });
        return res.json();
    },
    async sendMockFollow(username: string, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/dev/events/follow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: `user-${username}-${Date.now()}`,
                username,
            }),
        });
        return res.json();
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
                giftId: `gift-${giftName.toLowerCase()}`,
                giftName,
                giftCount: 1,
                diamondCount,
            }),
        });
        return res.json();
    },
    async getQueue(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/queue`);
        return res.json();
    },
    async getPrinterState(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/printer/state`);
        return res.json();
    },
    async connectTikTok(username: string, serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/tiktok/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        });
        return res.json();
    },
    async disconnectTikTok(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/tiktok/disconnect`, {
            method: 'POST',
        });
        return res.json();
    },
    async getGiftConfig(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/config/gift`);
        return res.json() as Promise<{ goldDiamonds: number; fullPageDiamonds: number }>;
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
        return res.json();
    },
    async getBackgroundConfig(serverUrl = DEFAULT_SERVER_URL) {
        const res = await fetch(`${serverUrl}/api/config/background`);
        return res.json() as Promise<BackgroundConfig>;
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
};
export type { ViewerEvent };

