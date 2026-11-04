import { io, type Socket } from 'socket.io-client';
import type { RealtimeEventMap, ViewerEvent } from '../types';

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
};
export type { ViewerEvent };
