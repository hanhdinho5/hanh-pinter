import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Core } from '../app.js';
import type { NewEventInput } from '../events/eventHandler.js';
import { config } from '../config.js';
import { saveSettings, getBackgroundConfig, getAudioConfig } from '../settings.js';

class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const str = (body: Record<string, unknown>, key: string, required: boolean): string | undefined => {
    const v = body[key];
    if (v === undefined || v === null || v === '') {
        if (required) throw new HttpError(400, `Thiếu trường "${key}"`);
        return undefined;
    }
    if (typeof v !== 'string') throw new HttpError(400, `Trường "${key}" phải là string`);
    return v;
};

const int = (body: Record<string, unknown>, key: string): number | undefined => {
    const v = body[key];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new HttpError(400, `Trường "${key}" phải là số >= 0`);
    return Math.floor(v);
};

const parseEvent = (raw: unknown, type: NewEventInput['type']): NewEventInput => {
    if (!isRecord(raw)) throw new HttpError(400, 'Body phải là JSON object');
    const input: NewEventInput = {
        type,
        userId: str(raw, 'userId', true) as string,
        username: str(raw, 'username', true) as string,
    };
    const avatarUrl = str(raw, 'avatarUrl', false);
    if (avatarUrl !== undefined) input.avatarUrl = avatarUrl;
    if (type === 'GIFT') {
        const giftId = str(raw, 'giftId', false);
        const giftName = str(raw, 'giftName', false);
        const giftCount = int(raw, 'giftCount');
        const diamondCount = int(raw, 'diamondCount');
        if (giftId !== undefined) input.giftId = giftId;
        if (giftName !== undefined) input.giftName = giftName;
        if (giftCount !== undefined) input.giftCount = giftCount;
        if (diamondCount !== undefined) input.diamondCount = diamondCount;
    }
    return input;
};

const AVATAR_HOSTS = /(^|\.)(tiktokcdn[a-z-]*\.com|tiktokv\.com|ibyteimg\.com|byteimg\.com|byteoversea\.com|muscdn\.com|tiktokcdn\.us)$/i;
/** Avatar chỉ giữ tạm trong RAM vài phút (đủ cho lúc vẽ), không ghi ra ổ đĩa */
const AVATAR_CACHE_MAX = 30;
const AVATAR_CACHE_MS = 5 * 60_000;
const avatarCache = new Map<string, { type: string; body: Buffer; at: number }>();

export const isAllowedAvatarUrl = (raw: string): boolean => {
    try {
        const u = new URL(raw);
        return u.protocol === 'https:' && AVATAR_HOSTS.test(u.hostname);
    } catch {
        return false;
    }
};

export const createRouter = (core: Core): Router => {
    const router = Router();
    const { engine, queue, handler, tiktok } = core;

    router.get('/health', (_req, res) => {
        res.json({ status: 'ok', uptime: process.uptime() });
    });
    // Proxy avatar: CDN TikTok không có CORS nên canvas WebGL không đọc trực tiếp được.
    router.get('/avatar', async (req, res, next) => {
        try {
            const url = typeof req.query['url'] === 'string' ? req.query['url'] : '';
            if (!isAllowedAvatarUrl(url)) throw new HttpError(400, 'URL avatar không hợp lệ');
            const now = Date.now();
            for (const [k, v] of avatarCache) if (now - v.at > AVATAR_CACHE_MS) avatarCache.delete(k);
            let item = avatarCache.get(url);
            if (!item) {
                const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
                const type = r.headers.get('content-type') ?? '';
                if (!r.ok || !type.startsWith('image/')) throw new HttpError(502, 'Không tải được avatar');
                if (Number(r.headers.get('content-length') ?? 0) > 2_000_000) throw new HttpError(502, 'Avatar quá lớn');
                const body = Buffer.from(await r.arrayBuffer());
                if (body.length > 2_000_000) throw new HttpError(502, 'Avatar quá lớn');
                item = { type, body, at: now };
                while (avatarCache.size >= AVATAR_CACHE_MAX) avatarCache.delete(avatarCache.keys().next().value as string);
                avatarCache.set(url, item);
            }
            // Trình duyệt (OBS / LIVE Studio) không lưu ảnh vào bộ nhớ đệm trên ổ đĩa
            res.set({ 'Content-Type': item.type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
            res.send(item.body);
        } catch (err) {
            next(err);
        }
    });
    router.get('/printer/state', (_req, res) => {
        res.json(engine.getState());
    });
    router.get('/queue', (_req, res) => {
        res.json(queue.snapshot());
    });

    // --- TikTok Live Adapter Routes ---
    router.get('/tiktok/status', (_req, res) => {
        res.json(tiktok.getStatus());
    });
    router.post('/tiktok/connect', async (req, res, next) => {
        try {
            if (!isRecord(req.body)) throw new HttpError(400, 'Body phải là JSON object');
            const username = str(req.body, 'username', true);
            if (!username) throw new HttpError(400, 'Thiếu username TikTok');
            const result = await tiktok.connect(username);
            res.json({ ...result, status: tiktok.getStatus() });
        } catch (err) {
            next(err);
        }
    });
    router.post('/tiktok/disconnect', async (_req, res, next) => {
        try {
            await tiktok.disconnect();
            res.json({ success: true, status: tiktok.getStatus() });
        } catch (err) {
            next(err);
        }
    });

    // --- Cấu hình ngưỡng quà (đổi nóng, lưu file) ---
    router.get('/config/gift', (_req, res) => {
        res.json(config.gift);
    });
    router.put('/config/gift', (req, res) => {
        if (!isRecord(req.body)) throw new HttpError(400, 'Body phải là JSON object');
        const gold = int(req.body, 'goldDiamonds') ?? config.gift.goldDiamonds;
        const full = int(req.body, 'fullPageDiamonds') ?? config.gift.fullPageDiamonds;
        if (gold < 1) throw new HttpError(400, 'Ngưỡng khung vàng phải >= 1');
        if (full <= gold) throw new HttpError(400, 'Ngưỡng in nguyên trang phải lớn hơn ngưỡng khung vàng');
        config.gift.goldDiamonds = gold;
        config.gift.fullPageDiamonds = full;
        saveSettings({ goldDiamonds: gold, fullPageDiamonds: full });
        res.json(config.gift);
    });

    // --- Cấu hình Cảnh Nền Background & Sinh Vật Bay ---
    router.get('/config/background', (_req, res) => {
        res.json(getBackgroundConfig());
    });
    router.put('/config/background', (req, res) => {
        if (!isRecord(req.body)) throw new HttpError(400, 'Body phải là JSON object');
        const current = getBackgroundConfig();
        const presetId = str(req.body, 'presetId', false) ?? current.presetId;
        const autoRotate = typeof req.body['autoRotate'] === 'boolean' ? req.body['autoRotate'] : current.autoRotate;
        const intervalMinutes = int(req.body, 'intervalMinutes') ?? current.intervalMinutes;
        const showButterflies = typeof req.body['showButterflies'] === 'boolean' ? req.body['showButterflies'] : current.showButterflies;
        const showBirds = typeof req.body['showBirds'] === 'boolean' ? req.body['showBirds'] : current.showBirds;
        const rawMode = req.body['mode'];
        if (rawMode !== undefined && rawMode !== 'image' && rawMode !== 'video') throw new HttpError(400, 'mode phải là image|video');
        const mode: 'image' | 'video' = rawMode ?? current.mode;
        const videoId = str(req.body, 'videoId', false) ?? current.videoId;

        const updated = {
            presetId,
            autoRotate,
            intervalMinutes: Math.max(1, intervalMinutes),
            showButterflies,
            showBirds,
            mode,
            videoId,
        };

        saveSettings({ background: updated });
        (core.bus as unknown as NodeJS.EventEmitter).emit('background:sync', updated);
        res.json(updated);
    });

    // --- Âm lượng (đồng bộ tới overlay OBS) ---
    router.get('/config/audio', (_req, res) => {
        res.json(getAudioConfig());
    });
    router.put('/config/audio', (req, res) => {
        if (!isRecord(req.body)) throw new HttpError(400, 'Body phải là JSON object');
        const current = getAudioConfig();
        const vol = (key: string, fallback: number): number => {
            const v = req.body[key];
            return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
        };
        const bool = (key: string, fallback: boolean): boolean =>
            typeof req.body[key] === 'boolean' ? (req.body[key] as boolean) : fallback;
        const updated = {
            sfxVolume: vol('sfxVolume', current.sfxVolume),
            bgmVolume: vol('bgmVolume', current.bgmVolume),
            bgmEnabled: bool('bgmEnabled', current.bgmEnabled),
            muted: bool('muted', current.muted),
        };
        saveSettings({ audio: updated });
        (core.bus as unknown as NodeJS.EventEmitter).emit('audio:sync', updated);
        res.json(updated);
    });

    router.post('/audio/next', (_req, res) => {
        (core.bus as unknown as NodeJS.EventEmitter).emit('audio:next');
        res.json({ ok: true });
    });

    router.post('/printer/pause', (_req, res) => {
        engine.pause();
        res.json(engine.getState());
    });
    router.post('/printer/resume', (_req, res) => {
        engine.resume();
        res.json(engine.getState());
    });
    router.post('/printer/speed', (req, res) => {
        const speed = isRecord(req.body) ? req.body['speed'] : undefined;
        if (typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0) {
            throw new HttpError(400, 'Trường "speed" phải là số > 0');
        }
        engine.setSpeed(speed);
        res.json(engine.getState());
    });

    const devEvent = (type: NewEventInput['type']) => (req: Request, res: Response) => {
        const result = handler.handle(parseEvent(req.body, type));
        res.status(result.accepted ? 202 : 200).json(result);
    };
    // Giả lập dữ liệu thô như TikTok gửi (proto v3) đi qua adapter thật: chat | follow | gift (có combo)
    // Các API giả lập chỉ dùng được trên chính máy chạy server (người chung wifi không gửi quà giả được)
    router.use('/dev', (req, _res, next) => {
        const ip = req.socket.remoteAddress ?? '';
        if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
        next(new HttpError(403, 'API giả lập chỉ dùng được trên máy chạy server'));
    });
    router.post('/dev/tiktok/simulate', (req, res) => {
        if (!isRecord(req.body)) throw new HttpError(400, 'Body phải là JSON object');
        const kind = req.body['kind'];
        if (kind !== 'chat' && kind !== 'follow' && kind !== 'gift') throw new HttpError(400, 'kind phải là chat|follow|gift');
        const id = str(req.body, 'uniqueId', true) as string;
        const data: Record<string, unknown> = {
            user: { userId: `sim-${id}`, uniqueId: id, nickname: id, avatarThumb: { urlList: [] } },
            comment: 'xin chào',
        };
        if (kind === 'gift') {
            Object.assign(data, {
                giftId: int(req.body, 'giftId') ?? 5655,
                giftDetails: { giftName: str(req.body, 'giftName', false) ?? 'Rose', diamondCount: int(req.body, 'diamondCount') ?? 1, giftType: req.body['streakable'] ? 1 : 0 },
                repeatCount: int(req.body, 'repeatCount') ?? 1,
                repeatEnd: req.body['repeatEnd'] === true,
            });
        }
        core.tiktok.simulate(kind, data);
        res.status(202).json({ ok: true });
    });
    router.post('/dev/events/comment', devEvent('COMMENT'));
    router.post('/dev/events/follow', devEvent('FOLLOW'));
    router.post('/dev/events/gift', devEvent('GIFT'));

    router.use((_req, res) => {
        res.status(404).json({ error: 'Not found' });
    });
    router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        if (err instanceof HttpError) {
            res.status(err.status).json({ error: err.message });
            return;
        }
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    });

    return router;
};
