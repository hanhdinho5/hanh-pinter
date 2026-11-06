import * as THREE from 'three';
import { disposeObjectTree, screenToCamera, smoothNoise } from './backdrop';

interface Butterfly {
    root: THREE.Group;
    leftPivot: THREE.Group;
    rightPivot: THREE.Group;
    homeX: number;
    homeY: number;
    rangeX: number;
    rangeY: number;
    depth: number;
    flapSpeed: number;
    seed: number;
    lastX: number;
}

interface WingPalette {
    base: string;
    inner: string;
    border: string;
    dots: string;
}

const PALETTES: Record<string, WingPalette> = {
    monarch: { base: '#f28c1b', inner: '#ffb547', border: '#1b1410', dots: '#fff7e8' },
    sulphur: { base: '#f6e27a', inner: '#fff4b8', border: '#8a6d1c', dots: '#fffbe6' },
    azure: { base: '#5fa8e8', inner: '#b9dcff', border: '#1d2a44', dots: '#eef6ff' },
};

/**
 * Bướm bay chập chờn quanh mép trên tờ giấy và hai bên sườn núi (gắn vào camera).
 * Bay vào sau tờ giấy thì bị giấy che tự nhiên.
 */
export class ButterflySystem {
    public group = new THREE.Group();
    private camera: THREE.PerspectiveCamera;
    private butterflies: Butterfly[] = [];
    private wingGeo: THREE.PlaneGeometry;
    private bodyGeo: THREE.CylinderGeometry;
    private isVisible = true;
    private tmp = new THREE.Vector3();

    constructor(camera: THREE.PerspectiveCamera) {
        this.camera = camera;
        this.group.name = 'ButterflySystem';

        // Mặt phẳng cánh, gốc cánh nằm ở x = 0 để xoay quanh thân
        this.wingGeo = new THREE.PlaneGeometry(0.15, 0.17);
        this.wingGeo.translate(0.075, 0, 0);
        this.bodyGeo = new THREE.CylinderGeometry(0.006, 0.004, 0.08, 6);

        const configs = [
            { palette: 'monarch', homeX: -0.62, homeY: 0.3, rangeX: 0.28, rangeY: 0.16, depth: 8.6, flap: 13 },
            { palette: 'monarch', homeX: 0.58, homeY: 0.24, rangeX: 0.3, rangeY: 0.18, depth: 9.4, flap: 12 },
            { palette: 'sulphur', homeX: 0.15, homeY: 0.4, rangeX: 0.45, rangeY: 0.12, depth: 10.5, flap: 15 },
            { palette: 'azure', homeX: -0.25, homeY: 0.22, rangeX: 0.4, rangeY: 0.12, depth: 9.8, flap: 14 },
        ];

        const textures = new Map<string, THREE.CanvasTexture>();
        configs.forEach((cfg, i) => {
            let tex = textures.get(cfg.palette);
            if (!tex) {
                tex = this.createWingTexture(PALETTES[cfg.palette]);
                textures.set(cfg.palette, tex);
            }
            this.butterflies.push(this.createButterfly(tex, cfg, i));
        });
    }

    private createWingTexture(p: WingPalette): THREE.CanvasTexture {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        // Cánh trước (trên) và cánh sau (dưới), gốc ở mép trái canvas
        const wingPath = () => {
            ctx.beginPath();
            ctx.moveTo(4, 62);
            ctx.bezierCurveTo(20, 10, 90, 2, 122, 18);
            ctx.bezierCurveTo(118, 44, 90, 60, 60, 64);
            ctx.bezierCurveTo(96, 74, 104, 108, 80, 122);
            ctx.bezierCurveTo(52, 126, 22, 98, 4, 66);
            ctx.closePath();
        };

        wingPath();
        const grad = ctx.createRadialGradient(10, 64, 4, 30, 64, 110);
        grad.addColorStop(0, p.inner);
        grad.addColorStop(0.6, p.base);
        grad.addColorStop(1, p.base);
        ctx.fillStyle = grad;
        ctx.fill();

        // Viền tối và gân cánh
        ctx.save();
        wingPath();
        ctx.clip();
        ctx.strokeStyle = p.border;
        ctx.lineWidth = 12;
        wingPath();
        ctx.stroke();
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (const [x, y] of [[118, 20], [100, 48], [70, 62], [86, 112], [50, 116]]) {
            ctx.moveTo(6, 64);
            ctx.quadraticCurveTo((x + 6) / 2, (y + 64) / 2 + (y < 64 ? -6 : 6), x, y);
        }
        ctx.stroke();
        ctx.restore();

        // Chấm trắng trên viền
        ctx.fillStyle = p.dots;
        for (let i = 0; i < 7; i++) {
            const t = i / 6;
            ctx.beginPath();
            ctx.arc(30 + t * 86, 14 + Math.sin(t * Math.PI) * -2 + t * 4, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    private createButterfly(
        texture: THREE.Texture,
        cfg: { homeX: number; homeY: number; rangeX: number; rangeY: number; depth: number; flap: number },
        index: number
    ): Butterfly {
        const wingMat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.4,
            side: THREE.DoubleSide,
        });
        const bodyMat = new THREE.MeshBasicMaterial({ color: 0x1a1512 });

        const root = new THREE.Group();
        const body = new THREE.Mesh(this.bodyGeo, bodyMat);
        root.add(body);

        const leftPivot = new THREE.Group();
        const leftWing = new THREE.Mesh(this.wingGeo, wingMat);
        leftPivot.add(leftWing);
        root.add(leftPivot);

        const rightPivot = new THREE.Group();
        const rightWing = new THREE.Mesh(this.wingGeo, wingMat);
        rightWing.scale.x = -1;
        rightPivot.add(rightWing);
        root.add(rightPivot);

        this.group.add(root);

        return {
            root,
            leftPivot,
            rightPivot,
            homeX: cfg.homeX,
            homeY: cfg.homeY,
            rangeX: cfg.rangeX,
            rangeY: cfg.rangeY,
            depth: cfg.depth,
            flapSpeed: cfg.flap,
            seed: index * 13.7 + 3,
            lastX: 0,
        };
    }

    public update(delta: number, time: number): void {
        if (!this.isVisible) return;

        for (const b of this.butterflies) {
            // Đường bay chập chờn: trôi chậm + giật nhẹ lên xuống theo nhịp vỗ cánh
            const nx = b.homeX + smoothNoise(time * 0.12, b.seed) * b.rangeX;
            const flutterLift = Math.abs(Math.sin(time * b.flapSpeed * 0.5 + b.seed)) * 0.012;
            const ny = b.homeY + smoothNoise(time * 0.16, b.seed + 5) * b.rangeY + flutterLift;
            screenToCamera(this.camera, nx, ny, b.depth, this.tmp);
            b.root.position.copy(this.tmp);

            const vx = (this.tmp.x - b.lastX) / Math.max(delta, 1e-3);
            b.lastX = this.tmp.x;
            b.root.rotation.z = THREE.MathUtils.clamp(-vx * 0.6, -0.5, 0.5);
            b.root.rotation.y = smoothNoise(time * 0.3, b.seed + 9) * 0.6;
            b.root.rotation.x = -0.35;

            // Thỉnh thoảng khép cánh lượn một nhịp
            const rest = THREE.MathUtils.smoothstep(smoothNoise(time * 0.35, b.seed + 2), 0.45, 0.7);
            const open = 0.5 + 0.5 * Math.sin(time * b.flapSpeed + b.seed);
            const angle = THREE.MathUtils.lerp(0.15 + open * 1.15, 0.5, rest);
            b.leftPivot.rotation.y = angle;
            b.rightPivot.rotation.y = -angle;
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
    }
}
