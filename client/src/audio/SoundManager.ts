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

    /** Phát lặp file tiếng bút thật, mỗi lần bắt đầu ở một vị trí ngẫu nhiên cho đỡ lặp lại. */
    private startFilePrintSound(isGold: boolean): void {
        if (!this.penBuffer) return;
        try {
            const ctx = this.getContext();
            const now = ctx.currentTime;
            const gain = ctx.createGain();
            const level = this.penBufferGain * (isGold ? 1.0 : 0.9) * this.sfxVolume;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(level, now + 0.08);
            gain.connect(ctx.destination);

            const src = ctx.createBufferSource();
            src.buffer = this.penBuffer;
            src.loop = true;
            src.playbackRate.value = 0.94 + Math.random() * 0.12;
            src.connect(gain);
            src.start(now, Math.random() * this.penBuffer.duration);

            this.printGainNode = gain;
            this.penFileSource = src;
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
            frictionFilter.frequency.setValueAtTime(2700, now);
            frictionFilter.Q.setValueAtTime(2.4, now);

            // 3. Lớp 2: Tiếng rột roạt xì xào thoáng nhẹ của thớ giấy (Highpass 4500Hz)
            const whisperFilter = ctx.createBiquadFilter();
            whisperFilter.type = 'highpass';
            whisperFilter.frequency.setValueAtTime(4500, now);
            whisperFilter.Q.setValueAtTime(0.7, now);

            // 4. Bộ điều chế nhịp nét vẽ (Stroke Rhythm LFO):
            // Mô phỏng nhịp bút lia qua lại trên giấy (~7.5 nét vẽ/giây)
            const strokeLFO = ctx.createOscillator();
            strokeLFO.type = 'triangle';
            strokeLFO.frequency.setValueAtTime(7.5, now);

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
            whisperGain.gain.setValueAtTime(0.25, now);

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

    /**
     * Bắt đầu phát nhạc nền
     */
    public startBgm(): void {
        if (this.isBgmPlaying) return;

        if (!this.bgmAudio) {
            this.bgmAudio = new Audio();
            this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
            this.bgmAudio.addEventListener('ended', () => {
                this.playNextBgmTrack();
            });
        }

        this.playCurrentBgmTrack();
    }

    /**
     * Tạm dừng phát nhạc nền
     */
    public stopBgm(): void {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
        }
        this.isBgmPlaying = false;
    }

    private playCurrentBgmTrack(): void {
        if (!this.bgmAudio || this.bgmPlaylist.length === 0) return;

        const trackUrl = this.bgmPlaylist[this.currentBgmIndex];
        this.bgmAudio.src = trackUrl;
        this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;

        const playPromise = this.bgmAudio.play();
        if (playPromise) {
            playPromise
                .then(() => {
                    this.isBgmPlaying = true;
                })
                .catch(() => {
                    // Trình duyệt có thể chặn autoplay nếu người dùng chưa tương tác chuột
                    console.log('[SoundManager] Chờ người dùng tương tác để bật nhạc nền BGM');
                    this.isBgmPlaying = false;
                });
        }
    }

    public nextTrack(): void {
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

    public toggleMute(): boolean {
        this.isMuted = !this.isMuted;
        if (this.bgmAudio) {
            this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
        }
        if (this.isMuted && this.isPrintingSoundActive) {
            this.stopPrintSound();
        }
        return this.isMuted;
    }

    public isSoundMuted(): boolean {
        return this.isMuted;
    }

    public getBgmPlaying(): boolean {
        return this.isBgmPlaying;
    }
}

export const soundManager = new SoundManager();
