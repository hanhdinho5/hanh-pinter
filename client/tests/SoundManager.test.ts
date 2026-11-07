import assert from 'node:assert/strict';
import { test } from 'node:test';
import { soundManager } from '../src/audio/SoundManager.ts';

class FakeAudio extends EventTarget {
    static instances: FakeAudio[] = [];
    static rejection: string | undefined;
    src: string;
    currentTime = 0;
    ended = false;
    volume = 1;
    loop = false;
    preload = '';
    constructor(src = '') {
        super();
        this.src = src;
        FakeAudio.instances.push(this);
    }
    play() {
        return FakeAudio.rejection
            ? Promise.reject({ name: FakeAudio.rejection })
            : Promise.resolve();
    }
    pause() { this.dispatchEvent(new Event('pause')); }
    load() {}
    removeAttribute() { this.src = ''; }
    emit(name: string) { this.dispatchEvent(new Event(name)); }
}

const fresh = () => {
    globalThis.Audio = FakeAudio as unknown as typeof Audio;
    FakeAudio.instances = [];
    FakeAudio.rejection = undefined;
    return new (soundManager.constructor as new () => typeof soundManager)();
};
const latest = () => FakeAudio.instances.at(-1)!;

test('select a playlist track, restart same track and ignore invalid selections', () => {
    const manager = fresh();
    try {
        assert.equal(manager.getBgmPlaylist()[0], '/music/emin-jony-kamin-1h.m4a');
        manager.selectBgmTrack(3);
        assert.match(manager.getCurrentTrackName(), /study-relax/);
        latest().currentTime = 120;
        manager.selectBgmTrack(3);
        assert.equal(latest().currentTime, 0);
        const count = FakeAudio.instances.length;
        manager.selectBgmTrack(-1);
        manager.selectBgmTrack(manager.getBgmPlaylist().length);
        manager.selectBgmTrack(1.5);
        assert.equal(FakeAudio.instances.length, count);
        latest().emit('ended');
        assert.equal(manager.getCurrentTrackName(), 'lofi-1.mp3');
    } finally { manager.stopBgm(); }
});

type PrintHarness = {
    loadPenBuffer: () => Promise<void>;
    startSynthesizedPrintSound: (gold: boolean) => void;
    isPrintingSoundActive: boolean;
};

test('paper sound stops when drawing frames stop and resumes only with new frames', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
    const manager = fresh();
    const internal = manager as unknown as PrintHarness;
    internal.loadPenBuffer = async () => {};
    let starts = 0;
    internal.startSynthesizedPrintSound = () => { starts++; };
    try {
        manager.keepPrintSoundAlive();
        await Promise.resolve();
        assert.equal(starts, 1);
        t.mock.timers.tick(200);
        manager.keepPrintSoundAlive();
        t.mock.timers.tick(200);
        assert.equal(internal.isPrintingSoundActive, true);
        t.mock.timers.tick(200);
        assert.equal(internal.isPrintingSoundActive, false);
        manager.keepPrintSoundAlive();
        await Promise.resolve();
        assert.equal(starts, 2);
    } finally { manager.stopPrintSound(); }
});

test('late paper audio loading cannot restart a finished drawing or reuse an old request', async () => {
    const manager = fresh();
    const internal = manager as unknown as PrintHarness;
    let resolve!: () => void;
    const loading = new Promise<void>((done) => { resolve = done; });
    internal.loadPenBuffer = () => loading;
    const starts: boolean[] = [];
    internal.startSynthesizedPrintSound = (gold) => { starts.push(gold); };
    manager.startPrintSound(false);
    manager.stopPrintSound();
    manager.startPrintSound(true);
    resolve();
    await Promise.resolve();
    assert.deepEqual(starts, [true]);
    manager.stopPrintSound();
    assert.equal(internal.isPrintingSoundActive, false);
});

test('ended advances once, ignores old events, and wraps the playlist', () => {
    const manager = fresh();
    try {
        manager.startBgm();
        const first = latest();
        first.emit('playing');
        first.emit('ended');
        assert.equal(manager.getCurrentTrackName(), manager.getBgmPlaylist()[1].split('/').pop());
        first.emit('error');
        first.emit('ended');
        assert.equal(FakeAudio.instances.length, 2);
        for (let i = 0; i < manager.getBgmPlaylist().length - 1; i++) latest().emit('ended');
        assert.equal(manager.getCurrentTrackName(), manager.getBgmPlaylist()[0].split('/').pop());
    } finally { manager.stopBgm(); }
});

test('pause prevents delayed completion/errors from advancing; resume keeps position', () => {
    const manager = fresh();
    try {
        manager.startBgm();
        latest().currentTime = 42;
        manager.stopBgm();
        latest().emit('ended');
        latest().emit('error');
        manager.startBgm();
        assert.equal(FakeAudio.instances.length, 1);
        assert.equal(latest().currentTime, 42);
    } finally { manager.stopBgm(); }
});

test('unplayable playlist stops after one pass, including rejection/error duplicates', async () => {
    const manager = fresh();
    FakeAudio.rejection = 'NotSupportedError';
    try {
        manager.startBgm();
        const first = latest();
        first.emit('error');
        for (let i = 0; i < 10; i++) await Promise.resolve();
        assert.equal(FakeAudio.instances.length, manager.getBgmPlaylist().length);
        assert.equal(manager.isBgmWanted(), false);
    } finally { manager.stopBgm(); }
});

test('watchdog recovers a missing ended event and a stalled stream', (t) => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
    const manager = fresh();
    try {
        manager.startBgm();
        latest().ended = true;
        t.mock.timers.tick(5000);
        assert.equal(manager.getCurrentTrackName(), manager.getBgmPlaylist()[1].split('/').pop());
        t.mock.timers.tick(45000);
        assert.equal(manager.getCurrentTrackName(), manager.getBgmPlaylist()[2].split('/').pop());
    } finally { manager.stopBgm(); }
});

test('autoplay denial retries the same track, rapid next ignores stale promises', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    const manager = fresh();
    FakeAudio.rejection = 'NotAllowedError';
    try {
        manager.startBgm();
        await Promise.resolve();
        t.mock.timers.tick(45000);
        await Promise.resolve();
        assert.equal(manager.getCurrentTrackName(), manager.getBgmPlaylist()[0].split('/').pop());
        manager.nextTrack();
        manager.nextTrack();
        FakeAudio.rejection = undefined;
        await Promise.resolve();
        assert.equal(manager.getCurrentTrackName(), manager.getBgmPlaylist()[2].split('/').pop());
        assert.equal(FakeAudio.instances.length, 3);
    } finally { manager.stopBgm(); }
});
