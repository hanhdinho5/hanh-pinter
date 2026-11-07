import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCore } from './app.js';
import { config, type AppConfig } from './config.js';
import { classifyEvent, normalizeEvent } from './events/eventHandler.js';

const fast: AppConfig = { ...config, gift: { goldDiamonds: 100, fullPageDiamonds: 1000 }, printer: { ...config.printer, basePrintMs: 5 } };

const share = (userId: string) => ({ type: 'SHARE' as const, userId, username: userId });

test('ngưỡng 10/30: Hoa hồng nhỏ, heo 10 vàng và bánh vòng 30 VIP', () => {
    const thresholds = { goldDiamonds: 10, fullPageDiamonds: 30 };
    const gift = normalizeEvent({ type: 'GIFT', userId: 'u', username: 'u', giftId: 'other', diamondCount: 9 });
    assert.equal(classifyEvent(gift, thresholds).frame, 'normal');
    assert.equal(classifyEvent({ ...gift, diamondCount: 10 }, thresholds).frame, 'gold');
    assert.equal(classifyEvent({ ...gift, diamondCount: 29 }, thresholds).frame, 'gold');
    assert.equal(classifyEvent({ ...gift, diamondCount: 30 }, thresholds).frame, 'vip');
    assert.equal(classifyEvent({ ...gift, giftId: '5655', diamondCount: 1 }, thresholds).frame, 'rose');
});

test('Hoa hồng có khung riêng; đạt ngưỡng vẫn nâng lên vàng/VIP', () => {
    const rose = normalizeEvent({ type: 'GIFT', userId: 'r', username: 'r', giftId: '5655', diamondCount: 1 });
    const off = { ...config.gift, goldDiamonds: 100, fullPageDiamonds: 1000 };
    const on = off;
    assert.equal(classifyEvent(rose, off).frame, 'rose');
    assert.equal(classifyEvent(rose, on).frame, 'rose');
    assert.equal(classifyEvent({ ...rose, giftId: 'other', giftName: 'Rose' }, on).frame, 'rose');
    assert.equal(classifyEvent({ ...rose, giftId: 'other', giftName: 'Hoa hồng' }, on).frame, 'rose');
    assert.equal(classifyEvent({ ...rose, giftId: 'other', giftName: 'Heart' }, on).frame, 'normal');
    assert.equal(classifyEvent({ ...rose, giftCount: 1000 }, on).frame, 'vip');
    assert.equal(classifyEvent({ ...rose, giftCount: 100 }, off).frame, 'gold');
    assert.equal(classifyEvent({ ...rose, type: 'COMMENT' }, on).frame, 'normal');
});

test('Hoa hồng khung nhỏ chỉ chiếm một ô, bốn lượt đủ một tờ', async () => {
    const { handler, engine, bus } = createCore(fast);
    const slots: number[] = [];
    bus.on('printer:job:started', (job) => {
        slots.push(job.slot!);
        assert.equal(job.frame, 'rose');
    });
    const entries: { frame: string; isWide?: boolean }[] = [];
    bus.on('printer:sheet:completed', (sheet) => entries.push(...sheet.entries));
    for (let i = 0; i < 4; i++) handler.handle({ type: 'GIFT', userId: 'rose-user', username: 'rose-user', giftId: '5655', diamondCount: 1 });
    await engine.idle();
    assert.deepEqual(slots, [0, 1, 2, 3]);
    assert.equal(entries.length, 4);
    assert.ok(entries.every((entry) => entry.frame === 'rose' && entry.isWide === false));
});

test('chia sẻ/follow được xử lý tuần tự, đủ 4 ảnh thì sang tờ mới', async () => {
    const { handler, engine, sheets, bus } = createCore(fast);
    const order: string[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    bus.on('printer:job:started', (j) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        order.push(j.userId);
    });
    bus.on('printer:job:completed', () => concurrent--);
    const completedSheets: number[] = [];
    bus.on('printer:sheet:completed', (s) => completedSheets.push(s.entries.length));

    for (let i = 1; i <= 5; i++) handler.handle(i % 2 ? share(`u${i}`) : { ...share(`u${i}`), type: 'FOLLOW' });
    await engine.idle();

    assert.deepEqual(order, ['u1', 'u2', 'u3', 'u4', 'u5']);
    assert.equal(maxConcurrent, 1);
    assert.deepEqual(completedSheets, [4]);
    assert.equal(sheets.current.entries.length, 1);
});

test('follow vẫn chống trùng trên cùng tờ và trong queue; quà không bị chặn', async () => {
    const { handler, engine, sheets } = createCore(fast);
    const follow = { ...share('a'), type: 'FOLLOW' as const };
    assert.equal(handler.handle(follow).accepted, true);
    assert.equal(handler.handle(follow).accepted, false); // trong queue/đang in
    await engine.idle();
    assert.equal(handler.handle(follow).accepted, false); // đã có trên tờ
    assert.equal(sheets.current.entries.length, 1);
    // gift vẫn được in dù đã có trên tờ
    const g = handler.handle({ type: 'GIFT', userId: 'a', username: 'a', giftName: 'Rose', diamondCount: 1 });
    assert.equal(g.accepted, true);
    await engine.idle();
    assert.equal(sheets.current.entries.length, 2);
});

test('gift được ưu tiên, khung vàng, in nguyên trang', async () => {
    const { handler, engine, bus, sheets } = createCore(fast);
    const started: string[] = [];
    bus.on('printer:job:started', (j) => started.push(j.userId));

    handler.handle(share('c1')); // bắt đầu in ngay
    handler.handle(share('c2'));
    const rose = handler.handle({ type: 'GIFT', userId: 'r', username: 'r', giftName: 'Rose', diamondCount: 1 });
    const gold = handler.handle({ type: 'GIFT', userId: 'g', username: 'g', diamondCount: 100 });
    const big = handler.handle({ type: 'GIFT', userId: 'b', username: 'b', diamondCount: 500, giftCount: 2 });
    await engine.idle();

    assert.deepEqual(started, ['c1', 'r', 'g', 'b', 'c2']);
    assert.ok(rose.accepted && rose.job.frame === 'rose' && rose.job.lane === 'priority');
    assert.ok(gold.accepted && gold.job.frame === 'gold');
    assert.ok(big.accepted && big.job.frame === 'vip' && big.job.kind === 'single');
    // c1, r (hàng 0) + g (hàng 1) -> đủ tờ; b (VIP) hàng 0 tờ mới, c2 hàng 1
    assert.equal(sheets.completedCount, 1);
    assert.ok(sheets.current.entries.some((e) => e.userId === 'b' && e.frame === 'vip' && e.isWide));
});

test('pause/resume: job đang in xong rồi dừng, resume thì chạy tiếp', async () => {
    const { handler, engine, queue } = createCore(fast);
    handler.handle(share('p1'));
    handler.handle(share('p2'));
    engine.pause();
    await engine.idle();
    assert.equal(engine.getState().status, 'paused');
    assert.equal(queue.size, 1);
    handler.handle(share('p3'));
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(queue.size, 2); // không in khi đang pause
    engine.resume();
    await engine.idle();
    assert.equal(queue.size, 0);
    assert.equal(engine.getState().sheet.entries.length, 3);
});

test('không mất job khi nhận nhiều event liên tục', async () => {
    const { handler, engine, sheets } = createCore({ ...fast, queue: { ...fast.queue, maxFree: 1000 } });
    for (let i = 0; i < 50; i++) handler.handle(share(`m${i}`));
    await engine.idle();
    assert.equal(sheets.completedCount * 4 + sheets.current.entries.length, 50);
});

test('quà to (gold) chiếm nguyên 1 hàng, 2 quà to là đủ 1 tờ', async () => {
    const { handler, engine, sheets, bus } = createCore(fast);
    const completedSheets: number[] = [];
    bus.on('printer:sheet:completed', (s) => completedSheets.push(s.entries.length));

    // Quà to 1 -> Hàng 0 (slot 0, isWide: true)
    handler.handle({ type: 'GIFT', userId: 'vip1', username: 'VIP 1', diamondCount: 150 });
    // Quà to 2 -> Hàng 1 (slot 2, isWide: true) -> đầy 2 hàng -> sang tờ mới!
    handler.handle({ type: 'GIFT', userId: 'vip2', username: 'VIP 2', diamondCount: 200 });
    await engine.idle();

    assert.deepEqual(completedSheets, [2]); // Tờ đã hoàn tất có 2 quà to chiếm trọn 2 hàng
    assert.equal(sheets.completedCount, 1);
});

test('đổi tờ TRƯỚC khi bắt đầu in (client vẽ đúng tờ, đúng ô)', async () => {
    const { handler, engine, sheets, bus } = createCore(fast);
    const log: string[] = [];
    bus.on('printer:sheet:completed', (s) => log.push(`completed#${s.id}`));
    bus.on('printer:sheet', (s) => log.push(`sheet#${s.id}:${s.kind}`));
    bus.on('printer:job:started', (j) => log.push(`start:${j.userId}@${j.sheetId}/${j.slot}`));

    handler.handle(share('a')); // hàng 0
    await engine.idle();
    handler.handle(share('b')); // hàng 0
    handler.handle(share('c')); // hàng 1 -> 2 hàng đều có người
    await engine.idle();
    log.length = 0;

    // Quà vàng cần 1 hàng trống -> tờ 1 phải hoàn tất trước, quà in ở tờ 2 hàng 0
    handler.handle({ type: 'GIFT', userId: 'g', username: 'g', diamondCount: 150 });
    await engine.idle();
    assert.deepEqual(log.slice(0, 3), ['completed#1', 'sheet#2:standard', 'start:g@2/0']);
    assert.equal(sheets.current.id, 2);
    assert.ok(sheets.current.entries.some((e) => e.userId === 'g' && e.slot === 0 && e.isWide));

    // VIP: chiếm hàng 1 còn trống của tờ 2 -> đủ tờ -> tờ 2 hoàn tất SAU khi in
    log.length = 0;
    handler.handle({ type: 'GIFT', userId: 'v', username: 'v', diamondCount: 1000 });
    await engine.idle();
    assert.equal(log[0], 'start:v@2/2');
    assert.ok(log.includes('completed#2'));
    assert.equal(sheets.current.id, 3);
    assert.equal(sheets.current.entries.length, 0);
});

test('mỗi comment in một lượt, đủ 5 khóa; sau 7 phút xóa bộ đếm, comment chặn không kéo dài', (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
    const { handler, engine } = createCore(fast);
    engine.pause();
    const input = { type: 'COMMENT' as const, userId: 'u1', username: 'Minh Anh' };
    for (let i = 0; i < 4; i++) {
        assert.equal(handler.handle(input).accepted, true);
    }
    assert.equal(handler.handle(input).accepted, true);
    assert.equal(handler.handle(input).accepted, false);
    // Comment bị chặn không cản tim, chia sẻ hoặc quà của cùng người.
    assert.equal(handler.handle({ ...input, type: 'LIKE' }).accepted, true);
    assert.equal(handler.handle({ ...input, type: 'SHARE' }).accepted, true);
    assert.equal(handler.handle({ ...input, type: 'GIFT', diamondCount: 1 }).accepted, true);
    t.mock.timers.tick(7 * 60000 - 1);
    assert.equal(handler.handle(input).accepted, false);
    t.mock.timers.tick(1);
    const state = handler as unknown as { commentProgress: Map<string, unknown> };
    assert.equal(state.commentProgress.size, 0);
    for (let i = 0; i < 4; i++) assert.equal(handler.handle(input).accepted, true);
    assert.equal(handler.handle(input).accepted, true);
    assert.equal(handler.handle(input).accepted, false);
});

test('bộ đếm comment chưa đủ 5 cũng được dọn khi không hoạt động 7 phút', (t) => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'] });
    const { handler, engine } = createCore(fast);
    engine.pause();
    const input = { type: 'COMMENT' as const, userId: 'partial', username: 'Linh Đan' };
    for (let i = 0; i < 4; i++) handler.handle(input);
    t.mock.timers.tick(7 * 60000);
    assert.equal((handler as unknown as { commentProgress: Map<string, unknown> }).commentProgress.size, 0);
    assert.equal(handler.handle(input).accepted, true);
});

test('queue đầy không mất lượt comment; follow chỉ in một lần dù đổi tờ', async () => {
    const { handler, engine } = createCore({ ...fast, queue: { ...fast.queue, maxFree: 1 } });
    engine.pause();
    handler.handle(share('other'));
    const input = { type: 'COMMENT' as const, userId: 'u', username: 'u' };
    for (let i = 0; i < 4; i++) handler.handle(input);
    const result = handler.handle(input);
    assert.ok(!result.accepted && result.reason === 'queue_full');
    engine.resume();
    await engine.idle();
    assert.equal(handler.handle(input).accepted, true);
    await engine.idle();
    for (let i = 0; i < 4; i++) { assert.equal(handler.handle(input).accepted, true); await engine.idle(); }
    assert.equal(handler.handle(input).accepted, false);
    const follow = { type: 'FOLLOW' as const, userId: 'f', username: 'f' };
    assert.equal(handler.handle(follow).accepted, true);
    await engine.idle();
    for (let i = 0; i < 5; i++) { handler.handle(share('x' + i)); await engine.idle(); }
    assert.equal(handler.handle(follow).accepted, false);
});
test('quà thường không chiếm hết lượt: cứ 3 quà thì nhường 1 comment', async () => {
    const { handler, engine, bus } = createCore(fast);
    engine.pause();
    for (let i = 0; i < 6; i++) handler.handle({ type: 'GIFT', userId: `g${i}`, username: `g${i}`, diamondCount: 1, giftCount: 1 });
    handler.handle(share('c1'));
    const order: string[] = [];
    bus.on('printer:job:started', (job) => order.push(job.userId));
    engine.resume();
    await engine.idle();
    assert.deepEqual(order.slice(0, 5), ['g0', 'g1', 'g2', 'c1', 'g3']);
});

test('combo quà bị tự in sớm thì tín hiệu kết thúc đến muộn chỉ in phần còn lại', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const core = createCore(fast);
    const counts: number[] = [];
    core.bus.on('event', (e) => { if (e.type === 'GIFT') counts.push(e.giftCount); });
    const raw = (repeatCount: number, repeatEnd = false) => ({
        user: { userId: 'u9', uniqueId: 'u9' },
        giftId: 5655, giftName: 'Rose', diamondCount: 1, giftType: 1, repeatCount, repeatEnd,
        giftDetails: { giftType: 1 },
    });
    core.tiktok.simulate('gift', raw(3));
    t.mock.timers.tick(4100); // im lặng -> tự in 3
    core.tiktok.simulate('gift', raw(5, true)); // kết thúc muộn với tổng 5 -> chỉ in thêm 2
    assert.deepEqual(counts, [3, 2]);
});
