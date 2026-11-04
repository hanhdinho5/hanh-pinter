import * as THREE from 'three';

/**
 * Tạo texture vân gỗ cho bàn hoặc tường workshop bằng Canvas 2D
 */
export function createWoodTexture(
    width = 1024,
    height = 1024,
    isWall = false
): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const roughnessCanvas = document.createElement('canvas');
    roughnessCanvas.width = width;
    roughnessCanvas.height = height;
    const rCtx = roughnessCanvas.getContext('2d')!;

    if (isWall) {
        // Tường gỗ dạng các thanh gỗ xếp dọc
        const plankCount = 10;
        const plankWidth = width / plankCount;

        for (let i = 0; i < plankCount; i++) {
            const x = i * plankWidth;
            // Biến thiên màu nhẹ giữa các thanh gỗ
            const hue = 24 + (Math.random() * 4 - 2);
            const sat = 45 + (Math.random() * 10 - 5);
            const light = 22 + (Math.random() * 8 - 4);

            ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
            ctx.fillRect(x, 0, plankWidth, height);

            // Vân sợi gỗ dọc
            ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light - 8}%, 0.15)`;
            for (let grain = 0; grain < 35; grain++) {
                const gx = x + Math.random() * plankWidth;
                const gw = Math.random() * 3 + 1;
                ctx.fillRect(gx, 0, gw, height);
            }

            // Khe rãnh giữa các thanh gỗ (tối màu)
            ctx.fillStyle = 'rgba(10, 6, 3, 0.75)';
            ctx.fillRect(x + plankWidth - 2, 0, 3, height);

            // Đinh ốc tán trang trí
            ctx.fillStyle = 'rgba(20, 15, 10, 0.6)';
            ctx.beginPath();
            ctx.arc(x + plankWidth / 2, 40, 4, 0, Math.PI * 2);
            ctx.arc(x + plankWidth / 2, height - 40, 4, 0, Math.PI * 2);
            ctx.fill();

            // Roughness map (khe rãnh nhám hơn)
            rCtx.fillStyle = '#999999';
            rCtx.fillRect(x, 0, plankWidth, height);
            rCtx.fillStyle = '#ffffff';
            rCtx.fillRect(x + plankWidth - 2, 0, 3, height);
        }
    } else {
        // Mặt bàn gỗ workshop: ấm cúng, vân gỗ tự nhiên nằm ngang
        const baseGradient = ctx.createLinearGradient(0, 0, width, height);
        baseGradient.addColorStop(0, '#5a3825');
        baseGradient.addColorStop(0.5, '#442817');
        baseGradient.addColorStop(1, '#392012');
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, width, height);

        // Các lớp vân gỗ uốn lượn
        for (let layer = 0; layer < 60; layer++) {
            const y = Math.random() * height;
            const h = Math.random() * 8 + 2;
            const dark = Math.random() > 0.5;
            ctx.fillStyle = dark ? 'rgba(25, 12, 6, 0.18)' : 'rgba(120, 80, 50, 0.12)';

            ctx.beginPath();
            ctx.moveTo(0, y);
            for (let x = 0; x <= width; x += 60) {
                const wave = Math.sin((x / width) * Math.PI * 4 + layer) * 12;
                ctx.lineTo(x, y + wave);
            }
            ctx.lineTo(width, y + h);
            ctx.lineTo(0, y + h);
            ctx.closePath();
            ctx.fill();
        }

        // Tạo mắt gỗ ngẫu nhiên
        for (let knot = 0; knot < 3; knot++) {
            const kx = (knot + 0.5) * (width / 3) + (Math.random() * 80 - 40);
            const ky = height * 0.3 + Math.random() * height * 0.4;
            const knotGrad = ctx.createRadialGradient(kx, ky, 4, kx, ky, 45);
            knotGrad.addColorStop(0, 'rgba(20, 10, 5, 0.5)');
            knotGrad.addColorStop(0.6, 'rgba(35, 18, 9, 0.25)');
            knotGrad.addColorStop(1, 'rgba(60, 35, 20, 0)');
            ctx.fillStyle = knotGrad;
            ctx.beginPath();
            ctx.ellipse(kx, ky, 45, 20, Math.PI / 12, 0, Math.PI * 2);
            ctx.fill();
        }

        rCtx.fillStyle = '#777777';
        rCtx.fillRect(0, 0, width, height);
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;

    const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;

    return { map, roughnessMap };
}

/**
 * Tạo texture kim loại phay xước (brushed metal) cho thân máy in
 */
export function createBrushedMetalTexture(
    width = 512,
    height = 512,
    baseColor = '#2b2d32'
): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const rCanvas = document.createElement('canvas');
    rCanvas.width = width;
    rCanvas.height = height;
    const rCtx = rCanvas.getContext('2d')!;

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, width, height);

    rCtx.fillStyle = '#555555';
    rCtx.fillRect(0, 0, width, height);

    // Vệt phay kim loại ngang
    for (let i = 0; i < 400; i++) {
        const y = Math.random() * height;
        const h = Math.random() * 2 + 0.5;
        const bright = Math.random() > 0.5;
        ctx.fillStyle = bright ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(0, y, width, h);

        rCtx.fillStyle = bright ? '#444444' : '#666666';
        rCtx.fillRect(0, y, width, h);
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;

    const roughnessMap = new THREE.CanvasTexture(rCanvas);
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;

    return { map, roughnessMap };
}

/**
 * Tạo màn hình OLED / LCD cho máy in hiển thị trạng thái
 */
export function createOledScreenTexture(
    statusText = 'READY',
    subText = 'WAITING FOR PRINTS',
    statusColor = '#00ffaa'
): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Nền OLED đen sâu có lưới điểm pixel nhẹ
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Viền phát quang
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

    // Chấm đèn trạng thái
    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(32, 40, 10, 0, Math.PI * 2);
    ctx.fill();

    // Dòng trạng thái chính
    ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = statusColor;
    ctx.fillText(statusText, 56, 50);

    // Dòng phụ
    ctx.font = '500 20px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(subText, 32, 95);

    // Ký hiệu mạng / kết nối
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('⚡ ONLINE', canvas.width - 130, 95);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}
