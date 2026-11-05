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
    private sfxVolume = 0.6;
    private bgmVolume = 0.35;
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

    /**
     * Bật âm thanh nét bút / cọ ma sát trên bề mặt giấy (Paper Friction / Sketching sound)
     */
    public startPrintSound(isGold = false): void {
        if (this.isMuted || this.isPrintingSoundActive) return;

        // Thử phát file mp3 nếu người dùng đã bỏ file thu âm vào client/public/sounds/
        // Ưu tiên paper-friction.mp3, kế đến là printer-working.mp3
        const tryPlayFile = (path: string, fallback: () => void) => {
            const customAudio = new Audio(path);
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
                        fallback();
                    });
            } else {
                fallback();
            }
        };

        tryPlayFile('/sounds/paper-friction.mp3', () => {
            tryPlayFile('/sounds/printer-working.mp3', () => {
                // Nếu chưa có file mp3 thì dùng bộ tổng hợp âm thanh Web Audio API mô phỏng tiếng ngòi bút ma sát trên thớ giấy
                this.startSynthesizedPrintSound(isGold);
            });
        });
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
            mainGain.gain.linearRampToValueAtTime((isGold ? 0.22 : 0.16) * this.sfxVolume, now + 0.12);
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
            this.printGainNode.gain.linearRampToValueAtTime(0, now + 0.1);

            setTimeout(() => {
                try {
                    this.paperStrokeLFO?.stop();
                    this.paperNoiseSource?.stop();
                    this.paperStrokeLFO?.disconnect();
                    this.paperNoiseSource?.disconnect();
                    this.printGainNode?.disconnect();
                } catch {
                    // ignore
                }
                this.paperStrokeLFO = null;
                this.paperNoiseSource = null;
                this.printGainNode = null;
            }, 120);
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
