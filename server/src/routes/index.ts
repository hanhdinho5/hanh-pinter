import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Core } from '../app.js';
import type { NewEventInput } from '../events/eventHandler.js';

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

export const createRouter = (core: Core): Router => {
    const router = Router();
    const { engine, queue, handler, tiktok } = core;

    router.get('/health', (_req, res) => {
        res.json({ status: 'ok', uptime: process.uptime() });
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
