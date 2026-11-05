/**
 * Quản lý âm thanh cho máy in 3D:
 * 1. Tiếng máy in (SFX): Tiếng motor bước / in nhiệt êm dịu, tiếng chuông vàng VIP, tiếng cuộn giấy.
 *    - Sử dụng Web Audio API để tự tổng hợp âm thanh chân thực (chạy ngay lập tức, không phụ thuộc file mạng).
 *    - Đồng thời hỗ trợ nạp file .mp3 từ thư mục public/sounds/ nếu người dùng muốn dùng file thu âm thật.
 * 2. Nhạc nền (BGM): Tự động phát lặp các bài nhạc lofi/thư giãn từ public/music/, có điều khiển âm lượng.
 */
class SoundManager {
    private ctx: AudioContext | null = null;
    private sfxVolume = 0.6;
    private bgmVolume = 0.35;
    private isMuted = false;

    // Bộ tổng hợp tiếng motor bước (Stepper Motor Synth)
    private printMotorOsc1: OscillatorNode | null = null;
    private printMotorOsc2: OscillatorNode | null = null;
    private printNoiseNode: AudioBufferSourceNode | null = null;
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
    // SFX: TIẾNG MÁY IN ĐỘNG CƠ BƯỚC / IN KIM ẢO
    // =========================================================================

    /**
     * Bật tiếng máy in chạy êm dịu khi đầu in bắt đầu quét
     */
    public startPrintSound(isGold = false): void {
        if (this.isMuted || this.isPrintingSoundActive) return;

        // Thử phát file mp3 nếu người dùng đã bỏ file vào public/sounds/
        const customAudio = new Audio('/sounds/printer-working.mp3');
        customAudio.volume = this.sfxVolume;
        customAudio.loop = true;

        const playPromise = customAudio.play();
        if (playPromise) {
            playPromise
                .then(() => {
                    this.isPrintingSoundActive = true;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (this as any)._customPrintAudio = customAudio;
                })
                .catch(() => {
                    // Nếu chưa có file mp3 thì dùng bộ tổng hợp âm thanh Web Audio API
                    this.startSynthesizedPrintSound(isGold);
                });
        } else {
            this.startSynthesizedPrintSound(isGold);
        }
    }

    /**
     * Tổng hợp tiếng motor bước + dither nhiệt máy in nhẹ nhàng bằng Web Audio API
     */
    private startSynthesizedPrintSound(isGold: boolean): void {
        try {
            const ctx = this.getContext();
            this.isPrintingSoundActive = true;

            const now = ctx.currentTime;
            const mainGain = ctx.createGain();
            mainGain.gain.setValueAtTime(0, now);
            mainGain.gain.linearRampToValueAtTime((isGold ? 0.22 : 0.16) * this.sfxVolume, now + 0.1);
            mainGain.connect(ctx.destination);
            this.printGainNode = mainGain;

            // Bộ lọc dải thông tần thấp tạo tiếng cơ khí êm dịu, không chói tai
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(420, now);
            filter.Q.setValueAtTime(3.0, now);
            filter.connect(mainGain);

            // Dao động 1: Tiếng motor bước tần số 110Hz (nhịp cơ khí)
            const osc1 = ctx.createOscillator();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(110, now);
            osc1.connect(filter);
            osc1.start(now);
            this.printMotorOsc1 = osc1;

            // Dao động 2: Hòa âm thứ hai 220Hz
            const osc2 = ctx.createOscillator();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(220, now);
            osc2.connect(filter);
            osc2.start(now);
            this.printMotorOsc2 = osc2;

            // Tiếng xì xào nhẹ của kim in nhiệt (White noise buffer)
            const bufferSize = ctx.sampleRate * 2;
            const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }

            const noise = ctx.createBufferSource();
            noise.buffer = noiseBuffer;
            noise.loop = true;

            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(1400, now);
            noiseFilter.Q.setValueAtTime(2.0, now);

            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(0.04 * this.sfxVolume, now);

            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(mainGain);
            noise.start(now);
            this.printNoiseNode = noise;
        } catch (err) {
            console.warn('[SoundManager] Lỗi khởi tạo tiếng in:', err);
        }
    }

    /**
     * Dừng tiếng máy in khi hoàn thành lượt in
     */
    public stopPrintSound(): void {
        this.isPrintingSoundActive = false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const customAudio = (this as any)._customPrintAudio as HTMLAudioElement | undefined;
        if (customAudio) {
            customAudio.pause();
            customAudio.currentTime = 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this as any)._customPrintAudio = null;
        }

        if (this.ctx && this.printGainNode) {
            const now = this.ctx.currentTime;
            this.printGainNode.gain.linearRampToValueAtTime(0, now + 0.12);

            setTimeout(() => {
                try {
                    this.printMotorOsc1?.stop();
                    this.printMotorOsc2?.stop();
                    this.printNoiseNode?.stop();
                    this.printMotorOsc1?.disconnect();
                    this.printMotorOsc2?.disconnect();
                    this.printNoiseNode?.disconnect();
                    this.printGainNode?.disconnect();
                } catch {
                    // ignore
                }
                this.printMotorOsc1 = null;
                this.printMotorOsc2 = null;
                this.printNoiseNode = null;
                this.printGainNode = null;
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
                gain.gain.setValueAtTime(0.2 * this.sfxVolume, now);

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
                gain.gain.linearRampToValueAtTime(0.18 * this.sfxVolume, now + idx * 0.08 + 0.03);
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
