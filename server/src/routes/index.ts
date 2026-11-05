import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Core } from '../app.js';
import type { NewEventInput } from '../events/eventHandler.js';
import { config } from '../config.js';
import { saveSettings, getBackgroundConfig } from '../settings.js';

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
const avatarCache = new Map<string, { type: string; body: Buffer }>();

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
            let item = avatarCache.get(url);
            if (!item) {
                const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
                const type = r.headers.get('content-type') ?? '';
                if (!r.ok || !type.startsWith('image/')) throw new HttpError(502, 'Không tải được avatar');
                const body = Buffer.from(await r.arrayBuffer());
                if (body.length > 2_000_000) throw new HttpError(502, 'Avatar quá lớn');
                item = { type, body };
                if (avatarCache.size >= 500) avatarCache.delete(avatarCache.keys().next().value as string);
                avatarCache.set(url, item);
            }
            res.set({ 'Content-Type': item.type, 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' });
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

        const updated = {
            presetId,
            autoRotate,
            intervalMinutes: Math.max(1, intervalMinutes),
            showButterflies,
            showBirds,
        };

        saveSettings({ background: updated });
        (core.bus as unknown as NodeJS.EventEmitter).emit('background:sync', updated);
        res.json(updated);
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
