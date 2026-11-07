import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Core } from '../app.js';
import type { RealtimeEventMap, ServerToClientEvents } from '../types/index.js';
import { getAudioConfig, getBackgroundConfig, saveSettingsDebounced } from '../settings.js';

const FORWARDED: (keyof RealtimeEventMap)[] = [
    'printer:state',
    'printer:job:started',
    'printer:job:completed',
    'printer:job:failed',
    'printer:sheet',
    'printer:sheet:completed',
    'queue',
    'event',
    'tiktok:status',
    'background:sync',
    'audio:sync',
    'audio:next',
    'audio:select',
];

export const createSocketServer = (httpServer: HttpServer, core: Core, origin: string) => {
    const io = new Server<Record<string, never>, ServerToClientEvents>(httpServer, {
        cors: { origin, methods: ['GET', 'POST'] },
    });

    // Chuyển nguyên các sự kiện của bus tới mọi client.
    for (const name of FORWARDED) {
        const forward = (...args: unknown[]): void => {
            (io.emit as (event: string, ...a: unknown[]) => boolean)(name, ...args);
        };
        (core.bus as unknown as NodeJS.EventEmitter).on(name, forward);
    }

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        // Đồng bộ trạng thái ngay khi client (overlay OBS) kết nối.
        socket.emit('printer:state', core.engine.getState());
        socket.emit('printer:sheet', core.sheets.current);
        socket.emit('queue', core.queue.snapshot());
        socket.emit('tiktok:status', core.tiktok.getStatus());
        socket.emit('background:sync', getBackgroundConfig());
        socket.emit('audio:sync', getAudioConfig());

        // Nhận điều khiển âm lượng thời gian thực từ slider (phát ngay 0ms tới OBS & các trang khác)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.on('audio:update' as any, (patch: any) => {
            if (!patch || typeof patch !== 'object') return;
            const current = getAudioConfig();
            const updated = {
                sfxVolume: typeof patch.sfxVolume === 'number' && Number.isFinite(patch.sfxVolume)
                    ? Math.min(1, Math.max(0, patch.sfxVolume))
                    : current.sfxVolume,
                bgmVolume: typeof patch.bgmVolume === 'number' && Number.isFinite(patch.bgmVolume)
                    ? Math.min(1, Math.max(0, patch.bgmVolume))
                    : current.bgmVolume,
                bgmEnabled: typeof patch.bgmEnabled === 'boolean' ? patch.bgmEnabled : current.bgmEnabled,
                muted: typeof patch.muted === 'boolean' ? patch.muted : current.muted,
            };
            saveSettingsDebounced({ audio: updated });
            socket.broadcast.emit('audio:sync', updated);
        });

        socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
    });

    return io;
};
