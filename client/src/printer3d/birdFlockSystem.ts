import * as THREE from 'three';
import { disposeObjectTree, screenToCamera, seededRandom, smoothNoise } from './backdrop';

interface Bird {
    root: THREE.Group;
    leftInner: THREE.Group;
    leftOuter: THREE.Group;
    rightInner: THREE.Group;
    rightOuter: THREE.Group;
    /** Vật liệu + màu gốc (để pha nhạt theo khoảng cách) */
    materials: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[];
    flapSpeed: number;
    flapPhase: number;
    seed: number;
}

interface Glider {
    bird: Bird;
    centerX: number;
    centerY: number;
    depth: number;
}

interface FlockMember {
    bird: Bird;
    offsetX: number;
    offsetY: number;
}

/** Chim bay từ chân trời lại gần camera rồi vút lên */
interface Approacher {
    bird: Bird;
    active: boolean;
    t: number;
    duration: number;
    delay: number;
    startX: number;
    endX: number;
    startY: number;
    cruiseY: number;
    startDepth: number;
    endDepth: number;
}

const SKY_TOP_NY = 0.88;
const SKY_BOTTOM_NY = 0.46;
const HORIZON_NY = 0.4;

const SKY_TINT = new THREE.Color(0xc3d6e8);

type Species = 'gull' | 'kingfisher' | 'oriole';

interface Palette {
    root: string;
    mid: string;
    covert: string;
    feather: string;
    featherDark: string;
    tip: string;
    tipSpots?: string;
    body: number;
    belly: number;
    head: number;
    beak: number;
    tail: number;
}

const PALETTES: Record<Species, Palette> = {
    // Mòng biển trắng: cánh xám bạc, đầu cánh đen chấm trắng, mỏ vàng cam
    gull: {
        root: '#f7f9fb', mid: '#d5dde5', covert: '#eef2f6', feather: '#c5ced8', featherDark: '#97a5b3',
        tip: '#1d2127', tipSpots: '#ffffff', body: 0xf3f6f9, belly: 0xffffff, head: 0xffffff, beak: 0xf5a524, tail: 0xe6ebf0,
    },
    // Bói cá: cánh xanh lam ngọc ánh kim, bụng cam
    kingfisher: {
        root: '#0f766e', mid: '#0891b2', covert: '#2fe0f5', feather: '#2563eb', featherDark: '#1e3a8a',
        tip: '#172554', body: 0xf97316, belly: 0xfdba74, head: 0x0ea5e9, beak: 0x1f2937, tail: 0x1d4ed8,
    },
    // Vàng anh: thân vàng rực, cánh đen viền vàng
    oriole: {
        root: '#facc15', mid: '#eab308', covert: '#fef08a', feather: '#1c1917', featherDark: '#0c0a09',
        tip: '#111113', tipSpots: '#fde047', body: 0xfacc15, belly: 0xfde68a, head: 0xfbbf24, beak: 0xe11d48, tail: 0x18181b,
    },
};

/** Đổi UV của ShapeGeometry (mặc định = toạ độ thô) về 0..1 để dán texture lông vũ */
function normalizeUv(geo: THREE.BufferGeometry): void {
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    }
    uv.needsUpdate = true;
}

/**
 * Texture cánh: u = gốc -> đầu cánh, v = mép sau (dưới) -> mép trước (trên).
 * Gồm lớp lông phủ phía trước, hàng lông bay riêng từng chiếc ở mép sau (răng cưa nhờ alphaTest).
 */
function createWingTexture(p: Palette, outer: boolean): THREE.CanvasTexture {
    const W = 256;
    const H = 128;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;

    const base = ctx.createLinearGradient(0, 0, W, 0);
    base.addColorStop(0, outer ? p.mid : p.root);
    base.addColorStop(1, outer ? p.feather : p.mid);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // Lông bay (mép sau): từng chiếc lông thuôn dài, xen kẽ sáng tối
    const count = outer ? 7 : 8;
    for (let i = 0; i < count; i++) {
        const x = (i + 0.5) * (W / count);
        const tilt = outer ? 0.55 : 0.25;
        ctx.save();
        ctx.translate(x, H * 0.8);
        ctx.rotate(tilt);
        const g = ctx.createLinearGradient(0, -H * 0.3, 0, H * 0.3);
        g.addColorStop(0, i % 2 ? p.feather : p.featherDark);
        g.addColorStop(1, i % 2 ? p.featherDark : p.feather);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, W / count / 1.6, H * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Sống lông
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -H * 0.28);
        ctx.lineTo(0, H * 0.3);
        ctx.stroke();
        ctx.restore();
    }

    // Lông phủ phía trước (mép trên)
    const cov = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    cov.addColorStop(0, p.covert);
    cov.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cov;
    ctx.fillRect(0, 0, W, H * 0.45);
    for (let i = 0; i < 14; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.ellipse((i + 0.5) * (W / 14), H * 0.3, W / 24, H * 0.12, 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Đầu cánh
    if (outer) {
        const tip = ctx.createLinearGradient(W * 0.45, 0, W * 0.7, 0);
        tip.addColorStop(0, 'rgba(0,0,0,0)');
        tip.addColorStop(1, p.tip);
        ctx.fillStyle = tip;
        ctx.fillRect(W * 0.45, 0, W * 0.55, H);
        if (p.tipSpots) {
            ctx.fillStyle = p.tipSpots;
            for (const [x, y] of [[0.8, 0.35], [0.9, 0.55], [0.72, 0.6]]) {
                ctx.beginPath();
                ctx.arc(W * x, H * y, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Ánh sáng: mép trước sáng, mép sau tối nhẹ
    const light = ctx.createLinearGradient(0, 0, 0, H);
    light.addColorStop(0, 'rgba(255,255,255,0.25)');
    light.addColorStop(0.5, 'rgba(255,255,255,0)');
    light.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);

    // Răng cưa mép sau (giữa các chiếc lông) -> trong suốt
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i <= count; i++) {
        const x = i * (W / count);
        ctx.beginPath();
        ctx.moveTo(x - 7, H);
        ctx.lineTo(x + 7, H);
        ctx.lineTo(x + (outer ? 6 : 2), H - 16);
        ctx.closePath();
        ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

/**
 * Chim trời (gắn vào camera):
 * - 2 con chim liệng tự do trên trời.
 * - Định kỳ 25–45s một đàn bay ngang qua chân trời.
 * - Định kỳ 16–28s 1–3 con bay từ tít chân trời lại gần, to dần, rồi vút lên khỏi khung hình.
 */
export class BirdFlockSystem {
    public group = new THREE.Group();
    private camera: THREE.PerspectiveCamera;
    private random = seededRandom(20240611);
    private gliders: Glider[] = [];
    private flock: FlockMember[] = [];
    private approachers: Approacher[] = [];
    private geos: THREE.BufferGeometry[] = [];
    private innerGeo: THREE.ShapeGeometry;
    private outerGeo: THREE.ShapeGeometry;
    private bodyGeo: THREE.BufferGeometry;
    private tailGeo: THREE.ShapeGeometry;
    private beakGeo: THREE.ShapeGeometry;
    private eyeGeo: THREE.CircleGeometry;
    private wingTextures = new Map<string, THREE.CanvasTexture>();
    private isVisible = true;

    private flockActive = false;
    private flockProgress = 0;
    private flockDuration = 16;
    private flockDirection = 1;
    private flockY = 0.7;
    private flockDepth = 14;
    private nextFlockIn = 14;
    private nextApproachIn = 4;

    private tmp = new THREE.Vector3();

    constructor(camera: THREE.PerspectiveCamera) {
        this.camera = camera;
        this.group.name = 'BirdFlockSystem';

        // Cánh trong (gốc cánh) và cánh ngoài (đầu cánh, lông vũ nhọn) để vỗ cánh có độ gập tự nhiên
        const inner = new THREE.Shape();
        inner.moveTo(0, 0.012);
        inner.quadraticCurveTo(0.03, 0.03, 0.065, 0.026);
        inner.lineTo(0.065, -0.006);
        inner.quadraticCurveTo(0.03, -0.016, 0, -0.012);
        this.innerGeo = new THREE.ShapeGeometry(inner, 6);
        normalizeUv(this.innerGeo);

        const outer = new THREE.Shape();
        outer.moveTo(0, 0.026);
        outer.quadraticCurveTo(0.04, 0.03, 0.085, 0.012);
        outer.lineTo(0.074, 0.006);
        outer.lineTo(0.08, 0.0);
        outer.lineTo(0.068, -0.002);
        outer.lineTo(0.072, -0.008);
        outer.quadraticCurveTo(0.03, -0.012, 0, -0.006);
        this.outerGeo = new THREE.ShapeGeometry(outer, 6);
        normalizeUv(this.outerGeo);

        const body = new THREE.SphereGeometry(0.016, 10, 8);
        body.scale(0.85, 1.25, 0.8);
        this.bodyGeo = body;

        const tail = new THREE.Shape();
        tail.moveTo(-0.008, 0);
        tail.lineTo(0.008, 0);
        tail.lineTo(0.016, -0.035);
        tail.lineTo(0, -0.028);
        tail.lineTo(-0.016, -0.035);
        tail.closePath();
        this.tailGeo = new THREE.ShapeGeometry(tail);
        const beak = new THREE.Shape();
        beak.moveTo(-0.004, 0);
        beak.lineTo(0.004, 0);
        beak.lineTo(0, -0.011);
        beak.closePath();
        this.beakGeo = new THREE.ShapeGeometry(beak);
        this.eyeGeo = new THREE.CircleGeometry(0.0024, 10);
        this.geos.push(this.innerGeo, this.outerGeo, this.bodyGeo, this.tailGeo, this.beakGeo, this.eyeGeo);

        for (let i = 0; i < 2; i++) {
            const depth = 15 + i * 3;
            const bird = this.createBird(1.25, 'gull');
            this.tintByDepth(bird, depth);
            this.gliders.push({ bird, centerX: i === 0 ? -0.45 : 0.4, centerY: 0.72 - i * 0.12, depth });
        }
        for (let i = 0; i < 8; i++) {
            const bird = this.createBird(1.1, 'gull');
            bird.root.visible = false;
            this.flock.push({ bird, offsetX: 0, offsetY: 0 });
        }
        for (let i = 0; i < 3; i++) {
            const bird = this.createBird(1.6, (['kingfisher', 'oriole', 'gull'] as Species[])[i]);
            bird.root.visible = false;
            this.approachers.push({
                bird,
                active: false,
                t: 0,
                duration: 9,
                delay: 0,
                startX: 0,
                endX: 0,
                startY: 0,
                cruiseY: 0,
                startDepth: 40,
                endDepth: 4,
            });
        }
    }

    private getWingTexture(species: Species, outer: boolean): THREE.CanvasTexture {
        const key = `${species}-${outer ? 'outer' : 'inner'}`;
        let tex = this.wingTextures.get(key);
        if (!tex) {
            tex = createWingTexture(PALETTES[species], outer);
            this.wingTextures.set(key, tex);
        }
        return tex;
    }

    private createBird(scale: number, species: Species): Bird {
        const p = PALETTES[species];
        const materials: Bird['materials'] = [];
        const mat = (color: number, map?: THREE.Texture) => {
            const m = new THREE.MeshBasicMaterial({
                color: map ? 0xffffff : color,
                map: map ?? null,
                side: THREE.DoubleSide,
                alphaTest: map ? 0.5 : 0,
            });
            materials.push({ mat: m, base: m.color.clone() });
            return m;
        };
        const bodyMat = mat(p.body);
        const bellyMat = mat(p.belly);
        const headMat = mat(p.head);
        const innerMat = mat(0, this.getWingTexture(species, false));
        const outerMat = mat(0, this.getWingTexture(species, true));
        const tailMat = mat(p.tail);
        const beakMat = mat(p.beak);
        const eyeMat = mat(0x0b0b0f);

        const root = new THREE.Group();

        // Chim nhìn chính diện/từ dưới lên: cánh nằm trong mặt phẳng quay về camera -> thấy rõ dáng chữ V/M khi vỗ
        const tail = new THREE.Mesh(this.tailGeo, tailMat);
        tail.position.set(0, -0.012, -0.004);
        root.add(tail);
        const body = new THREE.Mesh(this.bodyGeo, bodyMat);
        root.add(body);
        const belly = new THREE.Mesh(this.bodyGeo, bellyMat);
        belly.scale.set(0.6, 0.7, 0.6);
        belly.position.set(0, -0.004, 0.008);
        root.add(belly);
        const head = new THREE.Mesh(this.bodyGeo, headMat);
        head.scale.setScalar(0.62);
        head.position.set(0, 0.022, 0.004);
        root.add(head);
        const beak = new THREE.Mesh(this.beakGeo, beakMat);
        beak.position.set(0, 0.019, 0.016);
        root.add(beak);
        for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(this.eyeGeo, eyeMat);
            eye.position.set(side * 0.0045, 0.025, 0.0125);
            root.add(eye);
        }

        const makeWing = (side: 1 | -1) => {
            // Nhóm lật gương bên ngoài, khớp xoay bên trong -> 2 cánh vỗ đối xứng
            const mirror = new THREE.Group();
            mirror.scale.x = side;
            root.add(mirror);
            const innerPivot = new THREE.Group();
            innerPivot.position.x = 0.01;
            innerPivot.add(new THREE.Mesh(this.innerGeo, innerMat));
            const outerPivot = new THREE.Group();
            outerPivot.position.x = 0.064;
            outerPivot.add(new THREE.Mesh(this.outerGeo, outerMat));
            innerPivot.add(outerPivot);
            mirror.add(innerPivot);
            return [innerPivot, outerPivot] as const;
        };
        const [leftInner, leftOuter] = makeWing(1);
        const [rightInner, rightOuter] = makeWing(-1);

        root.scale.setScalar(scale * (0.9 + this.random() * 0.2));
        this.group.add(root);

        return {
            root,
            leftInner,
            leftOuter,
            rightInner,
            rightOuter,
            materials,
            flapSpeed: 8.5 + this.random() * 3,
            flapPhase: this.random() * Math.PI * 2,
            seed: this.random() * 100,
        };
    }

    /** Chim càng xa càng nhạt dần về màu trời (phối cảnh khí quyển), gần thì rõ màu */
    private tintByDepth(bird: Bird, depth: number): void {
        const fade = THREE.MathUtils.clamp((depth - 8) / 34, 0, 0.6);
        for (const { mat, base } of bird.materials) {
            mat.color.copy(base).lerp(SKY_TINT, fade);
        }
    }

    /** roll: nghiêng theo hướng lượn; tilt: ngả thân để thấy chút phối cảnh 3D; yaw: quay nhẹ theo hướng bay ngang */
    private orient(bird: Bird, roll: number, tilt: number, yaw: number): void {
        bird.root.rotation.set(tilt, yaw, roll);
    }

    /** amount: 0 = liệng (cánh dang, hơi nâng), 1 = vỗ mạnh */
    private animateWings(bird: Bird, time: number, amount: number): void {
        const phase = time * bird.flapSpeed + bird.flapPhase;
        const flap = Math.sin(phase) * 0.85 * amount;
        const glide = 0.1 + Math.sin(time * 0.9 + bird.seed) * 0.04;
        const inner = glide + flap;
        // Đầu cánh trễ pha một chút và gập vào khi cánh hất lên
        const outer = 0.15 * amount + Math.sin(phase - 0.6) * 0.55 * amount;
        bird.leftInner.rotation.z = inner;
        bird.rightInner.rotation.z = inner;
        bird.leftOuter.rotation.z = outer;
        bird.rightOuter.rotation.z = outer;
    }

    /** Nút "Bay ngay": cho đàn bay ngang + vài con bay lại gần */
    public triggerFlockFlight(): void {
        this.startFlock();
        this.triggerApproach();
    }

    private startFlock(): void {
        this.flockActive = true;
        this.flockProgress = 0;
        this.flockDirection = this.random() > 0.5 ? 1 : -1;
        this.flockY = THREE.MathUtils.lerp(SKY_BOTTOM_NY + 0.1, SKY_TOP_NY - 0.1, this.random());
        this.flockDepth = 12 + this.random() * 5;
        this.flockDuration = 15 + this.random() * 6;

        const count = 5 + Math.floor(this.random() * 4);
        this.flock.forEach((m, i) => {
            m.bird.root.visible = i < count;
            this.tintByDepth(m.bird, this.flockDepth);
            const rank = Math.ceil(i / 2);
            const side = i % 2 === 0 ? 1 : -1;
            m.offsetX = -rank * 0.075 + (this.random() - 0.5) * 0.03;
            m.offsetY = side * rank * 0.035 + (this.random() - 0.5) * 0.02;
        });
    }

    public triggerApproach(): void {
        const count = 1 + Math.floor(this.random() * 3);
        const side = this.random() > 0.5 ? 1 : -1;
        const baseX = side * (0.1 + this.random() * 0.35);
        this.approachers.forEach((a, i) => {
            if (i >= count) return;
            a.active = true;
            a.t = 0;
            a.delay = i * (0.5 + this.random() * 0.6);
            a.duration = 8.5 + this.random() * 2.5;
            a.startX = baseX + (this.random() - 0.5) * 0.12;
            // Bay chéo về phía tâm/ngược bên để đi ngang qua khung hình
            a.endX = -side * (0.15 + this.random() * 0.5);
            a.startY = HORIZON_NY + 0.02 + this.random() * 0.1;
            a.cruiseY = 0.48 + this.random() * 0.2;
            a.startDepth = 38 + this.random() * 6;
            a.endDepth = 3.6 + this.random() * 1.2;
            a.bird.root.visible = false;
        });
    }

    private updateApproachers(delta: number, time: number): void {
        let anyActive = false;
        for (const a of this.approachers) {
            if (!a.active) continue;
            anyActive = true;
            if (a.delay > 0) {
                a.delay -= delta;
                continue;
            }
            a.t += delta / a.duration;
            if (a.t >= 1) {
                a.active = false;
                a.bird.root.visible = false;
                continue;
            }
            a.bird.root.visible = true;
            const t = a.t;
            const s = a.bird.seed;

            // Tiến lại gần: độ sâu giảm theo hàm mũ (xa thì chậm, gần thì lướt nhanh như thật)
            const approach = Math.min(1, t / 0.78);
            const depth = a.startDepth * Math.pow(a.endDepth / a.startDepth, approach * approach * (3 - 2 * approach) * 0.5 + approach * 0.5);

            // Vút lên ở đoạn cuối
            const climb = THREE.MathUtils.smoothstep(t, 0.62, 1);
            const nx = THREE.MathUtils.lerp(a.startX, a.endX, approach) + smoothNoise(time * 0.5, s) * 0.03;
            const ny =
                THREE.MathUtils.lerp(a.startY, a.cruiseY, THREE.MathUtils.smoothstep(t, 0, 0.6)) +
                climb * climb * 1.1 +
                smoothNoise(time * 0.6, s + 4) * 0.015;

            screenToCamera(this.camera, nx, ny, depth, this.tmp);
            a.bird.root.position.copy(this.tmp);
            this.tintByDepth(a.bird, depth);

            // Lượn nghiêng theo hướng bay ngang, khi vút lên thì ngả thân ra sau (lộ bụng)
            const lateral = (a.endX - a.startX) * 0.6;
            this.orient(a.bird, -lateral * 0.5 + smoothNoise(time * 0.8, s) * 0.12, 0.25 - climb * 0.6, lateral * 0.4);

            // Vỗ mạnh khi vút lên, đoạn giữa liệng xen vỗ
            const glideMix = THREE.MathUtils.smoothstep(smoothNoise(time * 0.35, s + 2), 0.1, 0.5);
            const flap = Math.max(climb, 0.45 + 0.55 * glideMix);
            this.animateWings(a.bird, time, flap);
        }

        if (!anyActive) {
            this.nextApproachIn -= delta;
            if (this.nextApproachIn <= 0) {
                this.triggerApproach();
                this.nextApproachIn = 16 + this.random() * 12;
            }
        }
    }

    public update(delta: number, time: number): void {
        if (!this.isVisible) return;
        const dt = Math.min(delta, 0.1);

        // 1. Chim liệng tự do
        for (const g of this.gliders) {
            const s = g.bird.seed;
            const nx = g.centerX + smoothNoise(time * 0.045, s) * 0.45;
            const ny = THREE.MathUtils.clamp(g.centerY + smoothNoise(time * 0.06, s + 7) * 0.12, SKY_BOTTOM_NY, SKY_TOP_NY);
            screenToCamera(this.camera, nx, ny, g.depth, this.tmp);
            const vx = (this.tmp.x - g.bird.root.position.x) / Math.max(dt, 1e-3);
            g.bird.root.position.copy(this.tmp);
            this.orient(g.bird, THREE.MathUtils.clamp(-vx * 0.5, -0.4, 0.4), 0.3, vx >= 0 ? 0.5 : -0.5);
            const flapAmount = THREE.MathUtils.smoothstep(smoothNoise(time * 0.25, s + 3), 0.25, 0.55);
            this.animateWings(g.bird, time, flapAmount);
        }

        // 2. Chim bay từ xa lại gần rồi vút lên
        this.updateApproachers(dt, time);

        // 3. Đàn chim bay ngang
        if (!this.flockActive) {
            this.nextFlockIn -= dt;
            if (this.nextFlockIn <= 0) this.startFlock();
            return;
        }

        this.flockProgress += dt / this.flockDuration;
        if (this.flockProgress >= 1) {
            this.flockActive = false;
            this.flock.forEach((m) => (m.bird.root.visible = false));
            this.nextFlockIn = 25 + this.random() * 20;
            return;
        }

        const leadX = THREE.MathUtils.lerp(-1.35, 1.35, this.flockProgress) * this.flockDirection;
        const leadY = this.flockY + Math.sin(this.flockProgress * Math.PI) * 0.05;
        const yaw = this.flockDirection > 0 ? 0.55 : -0.55;

        for (const m of this.flock) {
            if (!m.bird.root.visible) continue;
            const s = m.bird.seed;
            const nx = leadX + m.offsetX * this.flockDirection + smoothNoise(time * 0.4, s) * 0.012;
            const ny = leadY + m.offsetY + smoothNoise(time * 0.5, s + 11) * 0.012;
            screenToCamera(this.camera, nx, ny, this.flockDepth, this.tmp);
            m.bird.root.position.copy(this.tmp);
            this.orient(m.bird, smoothNoise(time * 0.7, s) * 0.12, 0.3, yaw);
            this.animateWings(m.bird, time, 0.65 + 0.35 * Math.max(0, smoothNoise(time * 0.3, s)));
        }
    }

    public setVisible(visible: boolean): void {
        this.isVisible = visible;
        this.group.visible = visible;
    }

    public getVisible(): boolean {
        return this.isVisible;
    }

    public dispose(): void {
        disposeObjectTree(this.group);
        this.geos.forEach((g) => g.dispose());
        this.wingTextures.forEach((t) => t.dispose());
    }
}
