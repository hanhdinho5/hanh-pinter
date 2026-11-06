import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCore } from './app.js';
import { config, type AppConfig } from './config.js';

const fast: AppConfig = { ...config, printer: { ...config.printer, basePrintMs: 5 } };

const comment = (userId: string) => ({ type: 'COMMENT' as const, userId, username: userId });

test('comment/follow được xử lý tuần tự, đủ 4 ảnh thì sang tờ mới', async () => {
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

    for (let i = 1; i <= 5; i++) handler.handle(i % 2 ? comment(`u${i}`) : { ...comment(`u${i}`), type: 'FOLLOW' });
    await engine.idle();

    assert.deepEqual(order, ['u1', 'u2', 'u3', 'u4', 'u5']);
    assert.equal(maxConcurrent, 1);
    assert.deepEqual(completedSheets, [4]);
    assert.equal(sheets.current.entries.length, 1);
});

test('chống trùng user trên cùng tờ (kể cả đang chờ trong queue)', async () => {
    const { handler, engine, sheets } = createCore(fast);
    assert.equal(handler.handle(comment('a')).accepted, true);
    assert.equal(handler.handle(comment('a')).accepted, false); // trong queue/đang in
    await engine.idle();
    assert.equal(handler.handle(comment('a')).accepted, false); // đã có trên tờ
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

    handler.handle(comment('c1')); // bắt đầu in ngay
    handler.handle(comment('c2'));
    const rose = handler.handle({ type: 'GIFT', userId: 'r', username: 'r', giftName: 'Rose', diamondCount: 1 });
    const gold = handler.handle({ type: 'GIFT', userId: 'g', username: 'g', diamondCount: 100 });
    const big = handler.handle({ type: 'GIFT', userId: 'b', username: 'b', diamondCount: 500, giftCount: 2 });
    await engine.idle();

    assert.deepEqual(started, ['c1', 'r', 'g', 'b', 'c2']);
    assert.ok(rose.accepted && rose.job.frame === 'normal' && rose.job.lane === 'priority');
    assert.ok(gold.accepted && gold.job.frame === 'gold');
    assert.ok(big.accepted && big.job.frame === 'vip' && big.job.kind === 'single');
    // c1, r (hàng 0) + g (hàng 1) -> đủ tờ; b (VIP) hàng 0 tờ mới, c2 hàng 1
    assert.equal(sheets.completedCount, 1);
    assert.ok(sheets.current.entries.some((e) => e.userId === 'b' && e.frame === 'vip' && e.isWide));
});

test('pause/resume: job đang in xong rồi dừng, resume thì chạy tiếp', async () => {
    const { handler, engine, queue } = createCore(fast);
    handler.handle(comment('p1'));
    handler.handle(comment('p2'));
    engine.pause();
    await engine.idle();
    assert.equal(engine.getState().status, 'paused');
    assert.equal(queue.size, 1);
    handler.handle(comment('p3'));
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(queue.size, 2); // không in khi đang pause
    engine.resume();
    await engine.idle();
    assert.equal(queue.size, 0);
    assert.equal(engine.getState().sheet.entries.length, 3);
});

test('không mất job khi nhận nhiều event liên tục', async () => {
    const { handler, engine, sheets } = createCore({ ...fast, queue: { maxFree: 1000 } });
    for (let i = 0; i < 50; i++) handler.handle(comment(`m${i}`));
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

    handler.handle(comment('a')); // hàng 0
    await engine.idle();
    handler.handle(comment('b')); // hàng 0
    handler.handle(comment('c')); // hàng 1 -> 2 hàng đều có người
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
