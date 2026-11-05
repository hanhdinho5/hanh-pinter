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
    assert.ok(big.accepted && big.job.kind === 'fullPage');
    assert.equal(sheets.completedCount, 2); // tờ dở (c1,r,g) + trang đặc biệt
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
