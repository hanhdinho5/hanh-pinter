/**
 * Quản lý âm thanh cho máy in 3D:
 * 1. Hiệu ứng âm thanh (SFX):
 *    - Tiếng nét bút / cọ ma sát sột soạt trên bề mặt giấy (Paper Friction / Pencil Sketching ASMR).
 *    - Tiếng chuông vàng lấp lánh khi in thẻ VIP, tiếng cuộn giấy khi tống trang.
 *    - Sử dụng Web Audio API để tự tổng hợp âm thanh chân thực (chạy mượt mà, không phụ thuộc mạng).
 *    - Đồng thời hỗ trợ nạp file .mp3 từ thư mục client/public/sounds/ nếu người dùng muốn dùng file thu âm thật.
 * 2. Nhạc nền (BGM): Tự động phát lặp các bài nhạc lofi/thư giãn từ client/public/music/, có điều khiển âm lượng.
 */
class SoundManager {
    private ctx: AudioContext | null = null;
    private sfxVolume = 1;
    private bgmVolume = 0.7;
    private isMuted = false;

    // Bộ tổng hợp âm thanh bút cọ trên bề mặt giấy (Paper Friction / Sketching Synth)
    private paperNoiseSource: AudioBufferSourceNode | null = null;
    private paperStrokeLFO: OscillatorNode | null = null;
    private printGainNode: GainNode | null = null;
    private isPrintingSoundActive = false;

    // Nhạc nền (BGM Audio Element)
    private bgmAudio: HTMLAudioElement | null = null;
    private bgmPlaylist: string[] = [];
    private currentBgmIndex = 0;
    private isBgmPlaying = false;

    constructor() {
        // Khởi tạo danh sách file nhạc mẫu (người dùng có thể thả file vào public/music/)
        this.bgmPlaylist = [
            '/music/lofi-1.mp3',
            '/music/lofi-2.mp3',
            '/music/bgm.mp3',
        ];
    }

    public unlockAudio(): void {
        try {
            const ctx = this.getContext();
            if (ctx.state === 'suspended') {
                void ctx.resume();
            }
        } catch {
            // ignore
        }
        // Nhạc nền bị chặn trước đó -> phát lại ngay khi được phép
        if (this.bgmWanted && !this.isBgmPlaying) this.playCurrentBgmTrack();
    }

    private getContext(): AudioContext {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            this.ctx = new AudioCtx();
        }
        if (this.ctx.state === 'suspended') {
            void this.ctx.resume();
        }
        return this.ctx;
    }

    // =========================================================================
    // SFX: TIẾNG BÚT CỌ VÀO GIẤY / NÉT VẼ TỰ NHIÊN (PAPER FRICTION & SKETCHING)
    // =========================================================================

    /** File tiếng bút đã giải mã + chuẩn hoá (null = không có file -> dùng âm tổng hợp) */
    private penBuffer: AudioBuffer | null = null;
    private penBufferGain = 1;
    private penBufferLoading: Promise<void> | null = null;
    private penFileSource: AudioBufferSourceNode | null = null;

    /** Nạp trước file tiếng bút (wav/mp3) qua Web Audio, đo đỉnh để tự khuếch đại lên cho đủ to. */
    private loadPenBuffer(): Promise<void> {
        if (this.penBufferLoading) return this.penBufferLoading;
        const candidates = ['/sounds/paper-friction.wav', '/sounds/paper-friction.mp3', '/sounds/printer-working.mp3'];
        this.penBufferLoading = (async () => {
            const ctx = this.getContext();
            for (const url of candidates) {
                try {
                    const res = await fetch(url);
                    const type = res.headers.get('content-type') ?? '';
                    if (!res.ok || type.includes('text/html')) continue;
                    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
                    let peak = 0;
                    for (let c = 0; c < buf.numberOfChannels; c++) {
                        const d = buf.getChannelData(c);
                        for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
                    }
                    // Chuẩn hoá về đỉnh ~0.9 (file thu âm gốc rất nhỏ)
                    this.penBufferGain = peak > 0 ? Math.min(12, 0.9 / peak) : 1;
                    this.penBuffer = buf;
                    return;
                } catch {
                    // thử file kế tiếp
                }
            }
        })();
        return this.penBufferLoading;
    }

    /**
     * Bật âm thanh nét bút / cọ ma sát trên bề mặt giấy (Paper Friction / Sketching sound)
     */
    public startPrintSound(isGold = false): void {
        if (this.isMuted || this.isPrintingSoundActive) return;
        this.isPrintingSoundActive = true;
        void this.loadPenBuffer().then(() => {
            // Lượt in đã kết thúc trong lúc đang nạp file
            if (!this.isPrintingSoundActive || this.printGainNode) return;
            if (this.penBuffer) this.startFilePrintSound(isGold);
            else this.startSynthesizedPrintSound(isGold);
        });
    }

    /**
     * Phát lặp file tiếng bút thật qua chuỗi lọc "êm tai":
     * - Cắt ù tần thấp và tiếng rít chói tần cao (gắt nhất khi nghe qua livestream).
     * - Thêm chút ấm ở dải trung trầm như bút chì mềm trên giấy dày.
     * - Âm lượng nhấp nhô theo nhịp tay tô (nét đi - nét về), không đều đều như máy.
     * - Nén nhẹ cho tiếng mượt, không giật to nhỏ.
     */
    private startFilePrintSound(isGold: boolean): void {
        if (!this.penBuffer) return;
        try {
            const ctx = this.getContext();
            const now = ctx.currentTime;

            const out = ctx.createGain();
            const level = this.penBufferGain * (isGold ? 0.62 : 0.55) * this.sfxVolume;
            out.gain.setValueAtTime(0, now);
            out.gain.linearRampToValueAtTime(level, now + 0.15);
            out.connect(ctx.destination);

            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -26;
            comp.knee.value = 18;
            comp.ratio.value = 3;
            comp.attack.value = 0.01;
            comp.release.value = 0.2;
            comp.connect(out);

            // Nhịp tay tô: ~3 nét/giây, mỗi nét nhấn rồi nhả
            const stroke = ctx.createGain();
            stroke.gain.value = 0.72;
            const strokeLfo = ctx.createOscillator();
            strokeLfo.type = 'sine';
            strokeLfo.frequency.value = 2.6 + Math.random() * 0.8;
            const strokeDepth = ctx.createGain();
            strokeDepth.gain.value = 0.28;
            strokeLfo.connect(strokeDepth);
            strokeDepth.connect(stroke.gain);
            stroke.connect(comp);

            const lowCut = ctx.createBiquadFilter();
            lowCut.type = 'highpass';
            lowCut.frequency.value = 180;
            const warmth = ctx.createBiquadFilter();
            warmth.type = 'peaking';
            warmth.frequency.value = 900;
            warmth.Q.value = 0.8;
            warmth.gain.value = 3.5;
            const deEss = ctx.createBiquadFilter();
            deEss.type = 'peaking';
            deEss.frequency.value = 4200;
            deEss.Q.value = 1.2;
            deEss.gain.value = -6;
            const highCut = ctx.createBiquadFilter();
            highCut.type = 'lowpass';
            highCut.frequency.value = isGold ? 7000 : 6200;
            highCut.Q.value = 0.5;
            lowCut.connect(warmth);
            warmth.connect(deEss);
            deEss.connect(highCut);
            highCut.connect(stroke);

            const src = ctx.createBufferSource();
            src.buffer = this.penBuffer;
            src.loop = true;
            src.playbackRate.value = 0.92 + Math.random() * 0.08;
            src.connect(lowCut);
            src.start(now, Math.random() * this.penBuffer.duration);
            strokeLfo.start(now);

            this.printGainNode = out;
            this.penFileSource = src;
            this.paperStrokeLFO = strokeLfo;
        } catch (err) {
            console.warn('[SoundManager] Lỗi phát file tiếng bút:', err);
            this.startSynthesizedPrintSound(isGold);
        }
    }

    /**
     * Tổng hợp tiếng bút cọ trên bề mặt giấy (Paper Friction / Sketching ASMR) bằng Web Audio API
     * Không còn tiếng cơ khí motor bước, mà là tiếng ma sát ngòi bút sột soạt tự nhiên và êm dịu trên thớ giấy.
     */
    private startSynthesizedPrintSound(isGold: boolean): void {
        try {
            const ctx = this.getContext();
            this.isPrintingSoundActive = true;

            const now = ctx.currentTime;
            const mainGain = ctx.createGain();
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime((isGold ? 0.75 : 0.6) * this.sfxVolume, now + 0.12);
            mainGain.connect(ctx.destination);
            this.printGainNode = mainGain;

            // 1. Tạo buffer tiếng vi hạt thớ giấy (Pink noise có micro-texture ngẫu nhiên)
            const sampleRate = ctx.sampleRate;
            const bufferLen = sampleRate * 3; // 3 giây seamless loop
            const noiseBuffer = ctx.createBuffer(1, bufferLen, sampleRate);
            const data = noiseBuffer.getChannelData(0);

            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferLen; i++) {
                const white = Math.random() * 2 - 1;
                // Pink noise filter (Paul Kellet algorithm)
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                b6 = white * 0.115926;

                // Thêm vi hạt sần sột soạt của giấy thô (micro-grain texture)
                const grain = Math.random() < 0.025 ? (Math.random() * 0.3 - 0.15) : 0;
                data[i] = (pink * 0.12 + grain);
            }

            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = noiseBuffer;
            noiseSource.loop = true;

            // 2. Lớp 1: Tiếng cọ xát đầu ngòi bút (Bandpass Filter 2700Hz, Q = 2.4)
            const frictionFilter = ctx.createBiquadFilter();
            frictionFilter.type = 'bandpass';
            frictionFilter.frequency.setValueAtTime(1600, now);
            frictionFilter.Q.setValueAtTime(0.9, now);

            // 3. Lớp 2: Tiếng rột roạt xì xào thoáng nhẹ của thớ giấy (Highpass 4500Hz)
            const whisperFilter = ctx.createBiquadFilter();
            whisperFilter.type = 'highpass';
            whisperFilter.frequency.setValueAtTime(3200, now);
            whisperFilter.Q.setValueAtTime(0.7, now);

            // 4. Bộ điều chế nhịp nét vẽ (Stroke Rhythm LFO):
            // Mô phỏng nhịp bút lia qua lại trên giấy (~7.5 nét vẽ/giây)
            const strokeLFO = ctx.createOscillator();
            strokeLFO.type = 'sine';
            strokeLFO.frequency.setValueAtTime(3, now);

            // Điều chế cường độ âm thanh theo nhịp vẽ (độ sâu ~0.35)
            const strokeGain = ctx.createGain();
            strokeGain.gain.setValueAtTime(0.65, now);
            const lfoAmpGain = ctx.createGain();
            lfoAmpGain.gain.setValueAtTime(0.35, now);
            strokeLFO.connect(lfoAmpGain);
            lfoAmpGain.connect(strokeGain.gain);

            // Điều chế nhẹ tần số cộng hưởng (+/- 300Hz) mô phỏng góc nghiêng bút thay đổi
            const lfoFreqGain = ctx.createGain();
            lfoFreqGain.gain.setValueAtTime(300, now);
            strokeLFO.connect(lfoFreqGain);
            lfoFreqGain.connect(frictionFilter.frequency);

            // Gain cho lớp xì xào thớ giấy
            const whisperGain = ctx.createGain();
            whisperGain.gain.setValueAtTime(0.1, now);

            // Kết nối chuỗi âm thanh
            noiseSource.connect(frictionFilter);
            frictionFilter.connect(strokeGain);
            strokeGain.connect(mainGain);

            noiseSource.connect(whisperFilter);
            whisperFilter.connect(whisperGain);
            whisperGain.connect(mainGain);

            strokeLFO.start(now);
            noiseSource.start(now);

            this.paperNoiseSource = noiseSource;
            this.paperStrokeLFO = strokeLFO;
        } catch (err) {
            console.warn('[SoundManager] Lỗi khởi tạo tiếng cọ giấy:', err);
        }
    }

    /**
     * Dừng âm thanh cọ giấy khi hoàn thành lượt in / vẽ
     */
    public stopPrintSound(): void {
        this.isPrintingSoundActive = false;

        if (this.ctx && this.printGainNode) {
            const gainNode = this.printGainNode;
            const lfo = this.paperStrokeLFO;
            const noise = this.paperNoiseSource;
            const file = this.penFileSource;
            this.printGainNode = null;
            this.paperStrokeLFO = null;
            this.paperNoiseSource = null;
            this.penFileSource = null;

            const now = this.ctx.currentTime;
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(gainNode.gain.value, now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.1);

            setTimeout(() => {
                for (const node of [lfo, noise, file]) {
                    try {
                        node?.stop();
                        node?.disconnect();
                    } catch {
                        // ignore
                    }
                }
                gainNode.disconnect();
            }, 150);
        }
    }

    /**
     * Phát tiếng chuông vàng lấp lánh (Gold Chimes) khi in xong thẻ VIP
     */
    public playGoldChime(): void {
        if (this.isMuted) return;

        // Thử phát file mp3
        const customAudio = new Audio('/sounds/gold-chime.mp3');
        customAudio.volume = this.sfxVolume;
        customAudio.play().catch(() => {
            // Tổng hợp âm thanh chuông gió pentatonic
            this.synthesizeChime([1046.5, 1318.5, 1567.98, 2093.0]); // C6, E6, G6, C7
        });
    }

    /**
     * Phát tiếng ai đó cuộn giấy (Paper Roll Whoosh)
     */
    public playPaperRoll(): void {
        if (this.isMuted) return;

        const customAudio = new Audio('/sounds/paper-eject.mp3');
        customAudio.volume = this.sfxVolume;
        customAudio.play().catch(() => {
            // Tổng hợp tiếng cuộn giấy
            try {
                const ctx = this.getContext();
                const now = ctx.currentTime;

                const bufferSize = ctx.sampleRate * 0.8;
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.35));
                }

                const source = ctx.createBufferSource();
                source.buffer = buffer;

                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(600, now);
                filter.frequency.exponentialRampToValueAtTime(150, now + 0.6);

                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.5 * this.sfxVolume, now);

                source.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);

                source.start(now);
            } catch {
                // ignore
            }
        });
    }

    private synthesizeChime(notes: number[]): void {
        try {
            const ctx = this.getContext();
            const now = ctx.currentTime;

            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.08);

                gain.gain.setValueAtTime(0, now + idx * 0.08);
                gain.gain.linearRampToValueAtTime(0.3 * this.sfxVolume, now + idx * 0.08 + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 1.2);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(now + idx * 0.08);
                osc.stop(now + idx * 0.08 + 1.3);
            });
        } catch {
            // ignore
        }
    }

    // =========================================================================
    // BGM: NHẠC NỀN LIVESTREAM LOFI
    // =========================================================================

    /** Người dùng muốn nhạc nền đang phát (kể cả khi trình duyệt tạm chặn tự phát) */
    private bgmWanted = false;
    /** Số bài lỗi liên tiếp: lỗi cả vòng thì dừng, không thử mãi */
    private bgmFailures = 0;
    private bgmRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private bgmListeners = new Set<(playing: boolean) => void>();

    /** Theo dõi trạng thái phát thật (để giao diện hiển thị đúng). */
    public onBgmChange(cb: (playing: boolean) => void): () => void {
        this.bgmListeners.add(cb);
        return () => this.bgmListeners.delete(cb);
    }

    private setBgmPlaying(playing: boolean): void {
        if (this.isBgmPlaying === playing) return;
        this.isBgmPlaying = playing;
        for (const cb of this.bgmListeners) cb(playing);
    }

    /**
     * Bắt đầu phát nhạc nền
     */
    public startBgm(): void {
        this.bgmWanted = true;
        if (this.isBgmPlaying) return;

        if (!this.bgmAudio) {
            this.bgmAudio = new Audio();
            this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
            this.bgmAudio.addEventListener('ended', () => this.playNextBgmTrack());
            // File thiếu / hỏng -> chuyển bài kế, lỗi hết cả danh sách thì dừng
            this.bgmAudio.addEventListener('error', () => this.onBgmTrackFailed());
            this.bgmAudio.addEventListener('playing', () => {
                this.bgmFailures = 0;
                this.setBgmPlaying(true);
            });
            this.bgmAudio.addEventListener('pause', () => this.setBgmPlaying(false));
        }
        this.bgmFailures = 0;
        this.playCurrentBgmTrack();
    }

    /**
     * Tạm dừng phát nhạc nền
     */
    public stopBgm(): void {
        this.bgmWanted = false;
        if (this.bgmRetryTimer) clearTimeout(this.bgmRetryTimer);
        this.bgmRetryTimer = null;
        this.bgmAudio?.pause();
        this.setBgmPlaying(false);
    }

    private playCurrentBgmTrack(): void {
        if (!this.bgmAudio || this.bgmPlaylist.length === 0 || !this.bgmWanted) return;

        const trackUrl = this.bgmPlaylist[this.currentBgmIndex];
        if (!this.bgmAudio.src.endsWith(trackUrl)) this.bgmAudio.src = trackUrl;
        this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;

        this.bgmAudio.play().catch((err: unknown) => {
            const name = (err as { name?: string } | null)?.name;
            if (name === 'NotAllowedError') {
                // Trình duyệt chặn tự phát: thử lại khi có tương tác hoặc sau ít giây (OBS / LIVE Studio)
                console.log('[SoundManager] Trình duyệt tạm chặn tự phát nhạc nền, sẽ thử lại');
                this.scheduleBgmRetry();
            }
            // File hỏng/thiếu: sự kiện 'error' của thẻ audio sẽ tự chuyển bài
        });
    }

    private scheduleBgmRetry(): void {
        if (this.bgmRetryTimer || !this.bgmWanted) return;
        this.bgmRetryTimer = setTimeout(() => {
            this.bgmRetryTimer = null;
            if (this.bgmWanted && !this.isBgmPlaying) this.playCurrentBgmTrack();
        }, 5000);
    }

    private onBgmTrackFailed(): void {
        this.bgmFailures++;
        if (this.bgmFailures >= this.bgmPlaylist.length) {
            console.warn('[SoundManager] Không phát được bài nhạc nền nào trong client/public/music/');
            this.setBgmPlaying(false);
            return;
        }
        this.currentBgmIndex = (this.currentBgmIndex + 1) % this.bgmPlaylist.length;
        this.playCurrentBgmTrack();
    }

    public nextTrack(): void {
        this.bgmWanted = true;
        if (!this.bgmAudio) {
            this.currentBgmIndex = (this.currentBgmIndex + 1) % this.bgmPlaylist.length;
            this.startBgm();
            return;
        }
        this.bgmFailures = 0;
        this.playNextBgmTrack();
    }

    public getCurrentTrackName(): string {
        if (this.bgmPlaylist.length === 0) return 'None';
        const url = this.bgmPlaylist[this.currentBgmIndex] || '';
        return url.split('/').pop() || url;
    }

    private playNextBgmTrack(): void {
        if (this.bgmPlaylist.length === 0) return;
        this.currentBgmIndex = (this.currentBgmIndex + 1) % this.bgmPlaylist.length;
        this.playCurrentBgmTrack();
    }

    // =========================================================================
    // ĐIỀU KHIỂN ÂM LƯỢNG & MUTE
    // =========================================================================

    public setSfxVolume(vol: number): void {
        this.sfxVolume = Math.max(0, Math.min(1, vol));
    }

    public getSfxVolume(): number {
        return this.sfxVolume;
    }

    public setBgmVolume(vol: number): void {
        this.bgmVolume = Math.max(0, Math.min(1, vol));
        if (this.bgmAudio && !this.isMuted) {
            this.bgmAudio.volume = this.bgmVolume;
        }
    }

    public getBgmVolume(): number {
        return this.bgmVolume;
    }

    /** Đặt trạng thái tắt tiếng (gọi nhiều lần vẫn cho cùng kết quả). */
    public setMuted(muted: boolean): void {
        this.isMuted = muted;
        if (this.bgmAudio) {
            this.bgmAudio.volume = muted ? 0 : this.bgmVolume;
        }
        if (muted && this.isPrintingSoundActive) {
            this.stopPrintSound();
        }
    }

    public toggleMute(): boolean {
        this.setMuted(!this.isMuted);
        return this.isMuted;
    }

    public isSoundMuted(): boolean {
        return this.isMuted;
    }

    public getBgmPlaying(): boolean {
        return this.isBgmPlaying;
    }

    public isBgmWanted(): boolean {
        return this.bgmWanted;
    }
}

export const soundManager = new SoundManager();
