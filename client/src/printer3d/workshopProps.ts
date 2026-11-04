import * as THREE from 'three';

/**
 * Tạo bảng treo dụng cụ (Pegboard) và các công cụ gắn trên tường (kìm, búa, cờ lê)
 * Giống hệt phong cách xưởng Livecade PFP Printer
 */
export function createWallPegboardAndTools(): THREE.Group {
    const group = new THREE.Group();
    group.position.set(-0.35, 3.0, -2.4);

    // 1. Tấm Pegboard gỗ đục lỗ
    const pegboardWidth = 2.4;
    const pegboardHeight = 1.9;
    const boardGeo = new THREE.BoxGeometry(pegboardWidth, pegboardHeight, 0.05);

    // Tạo texture lỗ pegboard bằng Canvas 2D
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Nền gỗ ván ép pegboard
    ctx.fillStyle = '#6e472a';
    ctx.fillRect(0, 0, 512, 512);

    // Lưới lỗ tròn pegboard
    ctx.fillStyle = '#1e1007';
    const cols = 16;
    const rows = 16;
    const stepX = 512 / cols;
    const stepY = 512 / rows;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            ctx.beginPath();
            ctx.arc((c + 0.5) * stepX, (r + 0.5) * stepY, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const pegboardTex = new THREE.CanvasTexture(canvas);
    const boardMat = new THREE.MeshStandardMaterial({
        map: pegboardTex,
        roughness: 0.75,
        metalness: 0.05,
    });
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.receiveShadow = true;
    group.add(boardMesh);

    // Khung nẹp gỗ bao quanh pegboard
    const frameMat = new THREE.MeshStandardMaterial({
        color: 0x4a2e18,
        roughness: 0.6,
    });
    const topFrameGeo = new THREE.BoxGeometry(pegboardWidth + 0.1, 0.08, 0.08);
    const topFrame = new THREE.Mesh(topFrameGeo, frameMat);
    topFrame.position.set(0, pegboardHeight / 2 + 0.04, 0.02);
    group.add(topFrame);

    const botFrame = new THREE.Mesh(topFrameGeo, frameMat);
    botFrame.position.set(0, -pegboardHeight / 2 - 0.04, 0.02);
    group.add(botFrame);

    // 2. Các công cụ treo trên Pegboard
    // Vật liệu kim loại công cụ
    const toolSteelMat = new THREE.MeshStandardMaterial({
        color: 0x22262c,
        metalness: 0.9,
        roughness: 0.25,
    });
    const toolGripRed = new THREE.MeshStandardMaterial({
        color: 0x8a1c14,
        roughness: 0.5,
    });
    const woodHandleMat = new THREE.MeshStandardMaterial({
        color: 0xb5804c,
        roughness: 0.6,
    });

    // --- Dụng cụ 1: Kìm cắt / kéo bấm (Shears / Pliers) treo bên trái ---
    const pliersGroup = new THREE.Group();
    pliersGroup.position.set(-0.75, 0.15, 0.06);

    // Cặp cán kìm màu đỏ/cam
    const handleGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.45, 8);
    const leftHandle = new THREE.Mesh(handleGeo, toolGripRed);
    leftHandle.rotation.z = 0.2;
    leftHandle.position.set(-0.06, -0.15, 0);
    pliersGroup.add(leftHandle);

    const rightHandle = new THREE.Mesh(handleGeo, toolGripRed);
    rightHandle.rotation.z = -0.2;
    rightHandle.position.set(0.06, -0.15, 0);
    pliersGroup.add(rightHandle);

    // Đầu kìm kim loại
    const jawGeo = new THREE.BoxGeometry(0.07, 0.2, 0.03);
    const jaw = new THREE.Mesh(jawGeo, toolSteelMat);
    jaw.position.set(0, 0.15, 0);
    pliersGroup.add(jaw);

    // Chốt xoay kìm
    const pivotGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.04, 12);
    const pivot = new THREE.Mesh(pivotGeo, toolSteelMat);
    pivot.rotation.x = Math.PI / 2;
    pivot.position.set(0, 0.05, 0);
    pliersGroup.add(pivot);

    group.add(pliersGroup);

    // --- Dụng cụ 2: Búa thợ (Claw Hammer) treo ở giữa ---
    const hammerGroup = new THREE.Group();
    hammerGroup.position.set(-0.25, -0.05, 0.06);

    // Cán búa bằng gỗ
    const shaftGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.65, 8);
    const shaft = new THREE.Mesh(shaftGeo, woodHandleMat);
    hammerGroup.add(shaft);

    // Đầu búa thép
    const hammerHeadGeo = new THREE.BoxGeometry(0.24, 0.07, 0.06);
    const hammerHead = new THREE.Mesh(hammerHeadGeo, toolSteelMat);
    hammerHead.position.set(0.03, 0.32, 0);
    hammerGroup.add(hammerHead);

    group.add(hammerGroup);

    // --- Dụng cụ 3: Cờ lê (Wrenches) treo bên phải ---
    for (let i = 0; i < 2; i++) {
        const wrenchGroup = new THREE.Group();
        const posX = 0.25 + i * 0.35;
        const scale = 1 - i * 0.2;
        wrenchGroup.position.set(posX, 0.1, 0.06);
        wrenchGroup.scale.set(scale, scale, scale);

        // Thân cờ lê
        const wBodyGeo = new THREE.BoxGeometry(0.04, 0.45, 0.02);
        const wBody = new THREE.Mesh(wBodyGeo, toolSteelMat);
        wrenchGroup.add(wBody);

        // Vòng miệng cờ lê trên
        const ringGeo = new THREE.TorusGeometry(0.05, 0.02, 8, 16);
        const ring = new THREE.Mesh(ringGeo, toolSteelMat);
        ring.position.set(0, 0.23, 0);
        wrenchGroup.add(ring);

        // Miệng mở cờ lê dưới
        const openGeo = new THREE.BoxGeometry(0.09, 0.06, 0.025);
        const openM = new THREE.Mesh(openGeo, toolSteelMat);
        openM.position.set(0, -0.23, 0);
        wrenchGroup.add(openM);

        group.add(wrenchGroup);
    }

    // Các móc treo kim loại giữ công cụ
    const hookMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9 });
    for (const hx of [-0.75, -0.25, 0.25, 0.6]) {
        const hookGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.06);
        const hook = new THREE.Mesh(hookGeo, hookMat);
        hook.rotation.x = Math.PI / 2;
        hook.position.set(hx, 0.35, 0.04);
        group.add(hook);
    }

    return group;
}

/**
 * Tạo kệ gỗ đựng đồ (Workshop Shelves) với các lọ thủy tinh, hộp linh kiện phía bên phải
 */
export function createWorkshopShelf(): THREE.Group {
    const group = new THREE.Group();
    group.position.set(1.4, 2.9, -2.4);

    const shelfMat = new THREE.MeshStandardMaterial({
        color: 0x4a2e18,
        roughness: 0.65,
    });

    const shelfW = 1.3;
    const shelfD = 0.32;
    const shelfT = 0.04;

    // Kệ tầng dưới
    const lowerShelfGeo = new THREE.BoxGeometry(shelfW, shelfT, shelfD);
    const lowerShelf = new THREE.Mesh(lowerShelfGeo, shelfMat);
    lowerShelf.position.set(0, -0.4, shelfD / 2);
    lowerShelf.receiveShadow = true;
    group.add(lowerShelf);

    // Kệ tầng trên
    const upperShelf = new THREE.Mesh(lowerShelfGeo, shelfMat);
    upperShelf.position.set(0, 0.35, shelfD / 2);
    upperShelf.receiveShadow = true;
    group.add(upperShelf);

    // Giá đỡ kim loại chữ L (Brackets)
    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8 });
    for (const bx of [-shelfW / 2 + 0.1, shelfW / 2 - 0.1]) {
        for (const by of [-0.4, 0.35]) {
            const bGeo = new THREE.BoxGeometry(0.03, 0.18, shelfD * 0.9);
            const bMesh = new THREE.Mesh(bGeo, bracketMat);
            bMesh.position.set(bx, by - 0.09, shelfD / 2);
            group.add(bMesh);
        }
    }

    // Các lọ thủy tinh đựng ốc vít / linh kiện (Glass Jars) ở tầng dưới
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xdff0f8,
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
        transmission: 0.8,
        ior: 1.5,
    });
    const lidMat = new THREE.MeshStandardMaterial({
        color: 0x8c7853,
        metalness: 0.8,
        roughness: 0.3,
    });

    for (let j = 0; j < 3; j++) {
        const jarGroup = new THREE.Group();
        const jx = -0.38 + j * 0.36;
        jarGroup.position.set(jx, -0.22, 0.15);

        // Thân lọ
        const jarGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.28, 16);
        const jar = new THREE.Mesh(jarGeo, glassMat);
        jarGroup.add(jar);

        // Nắp lọ kim loại
        const lidGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.04, 16);
        const lid = new THREE.Mesh(lidGeo, lidMat);
        lid.position.y = 0.15;
        jarGroup.add(lid);

        // Linh kiện / ốc vít bên trong lọ
        const contentsGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.18, 12);
        const contentsMat = new THREE.MeshStandardMaterial({
            color: j === 0 ? 0xd4af37 : j === 1 ? 0x4a5568 : 0x8c3a1e,
            roughness: 0.7,
        });
        const contents = new THREE.Mesh(contentsGeo, contentsMat);
        contents.position.y = -0.04;
        jarGroup.add(contents);

        group.add(jarGroup);
    }

    // Các hộp đựng linh kiện / phụ kiện ở tầng trên (Storage Boxes)
    const boxMat = new THREE.MeshStandardMaterial({
        color: 0x2b303a,
        roughness: 0.8,
    });
    const box1Geo = new THREE.BoxGeometry(0.45, 0.26, 0.24);
    const box1 = new THREE.Mesh(box1Geo, boxMat);
    box1.position.set(-0.3, 0.51, 0.15);
    box1.castShadow = true;
    group.add(box1);

    const box2Geo = new THREE.BoxGeometry(0.38, 0.22, 0.22);
    const box2Mat = new THREE.MeshStandardMaterial({ color: 0x8a6d48, roughness: 0.7 });
    const box2 = new THREE.Mesh(box2Geo, box2Mat);
    box2.position.set(0.32, 0.49, 0.15);
    box2.castShadow = true;
    group.add(box2);

    return group;
}

/**
 * Tạo đèn bàn cổ điển (Vintage Desk Lamp) với chao đèn chiếu rọi góc ấm cúng
 * Giống đèn góc trái trong Livecade PFP Printer
 */
export function createVintageDeskLamp(): {
    lampGroup: THREE.Group;
    spotLight: THREE.SpotLight;
} {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(-1.85, 2.2, -1.6);

    const darkMetal = new THREE.MeshStandardMaterial({
        color: 0x1f2328,
        metalness: 0.85,
        roughness: 0.35,
    });
    const brassJoint = new THREE.MeshStandardMaterial({
        color: 0xc8963e,
        metalness: 0.9,
        roughness: 0.25,
    });

    // Đế đèn tròn nặng
    const baseGeo = new THREE.CylinderGeometry(0.26, 0.28, 0.07, 24);
    const base = new THREE.Mesh(baseGeo, darkMetal);
    base.position.y = -0.8;
    lampGroup.add(base);

    // Cần đèn gập khúc dưới (Lower arm)
    const armGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.7, 12);
    const lowerArm = new THREE.Mesh(armGeo, darkMetal);
    lowerArm.position.set(0.12, -0.4, 0);
    lowerArm.rotation.z = -0.35;
    lampGroup.add(lowerArm);

    // Khớp xoay bằng đồng (Joint 1)
    const jointGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const joint1 = new THREE.Mesh(jointGeo, brassJoint);
    joint1.position.set(0.24, -0.1, 0);
    lampGroup.add(joint1);

    // Cần đèn gập khúc trên (Upper arm vươn về phía máy in)
    const upperArm = new THREE.Mesh(armGeo, darkMetal);
    upperArm.position.set(0.42, 0.15, 0.15);
    upperArm.rotation.z = -0.85;
    upperArm.rotation.y = 0.3;
    lampGroup.add(upperArm);

    // Khớp xoay cổ đèn (Joint 2)
    const joint2 = new THREE.Mesh(jointGeo, brassJoint);
    joint2.position.set(0.65, 0.32, 0.3);
    lampGroup.add(joint2);

    // Chao đèn hình nón (Lampshade) hướng xuống phía máy in và bàn
    const shadeGeo = new THREE.ConeGeometry(0.28, 0.38, 20, 1, true);
    const shade = new THREE.Mesh(shadeGeo, darkMetal);
    shade.position.set(0.82, 0.18, 0.45);
    shade.rotation.x = 0.75;
    shade.rotation.z = -1.1;
    lampGroup.add(shade);

    // Bóng đèn phát sáng bên trong chao
    const bulbGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe8aa });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0.82, 0.18, 0.45);
    lampGroup.add(bulb);

    // Ánh sáng rọi từ đèn bàn (Spotlight ấm áp chiếu rọi xuống máy in & giấy)
    const spotLight = new THREE.SpotLight(0xffdf99, 4.8, 8, Math.PI / 4, 0.75, 1.2);
    spotLight.position.set(0.82, 0.18, 0.45);
    spotLight.target.position.set(0, 0.5, 0.2);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 2048;
    spotLight.shadow.mapSize.height = 2048;
    spotLight.shadow.bias = -0.0005;

    lampGroup.add(spotLight);
    lampGroup.add(spotLight.target);

    return { lampGroup, spotLight };
}

/**
 * Tạo thanh huy hiệu hành động lơ lửng trên máy in (Action Badges Bar)
 * Giống thanh biểu tượng [PRINT] [GOLD FRAME] [FULL PAGE] [LEGENDARY] ở Livecade
 */
export function createActionBadgesBar(): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    // Nền trong suốt hoặc kính mờ nhẹ
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const badges = [
        { icon: '💬', label: 'PRINT', bg: 'rgba(30, 41, 59, 0.85)', color: '#38bdf8' },
        { icon: '🌹', label: 'PRINT', bg: 'rgba(30, 41, 59, 0.85)', color: '#f43f5e' },
        { icon: '💎', label: 'GOLD FRAME', bg: 'rgba(45, 30, 15, 0.9)', color: '#fbbf24' },
        { icon: '🍩', label: 'FULL PAGE', bg: 'rgba(40, 20, 50, 0.9)', color: '#ec4899' },
        { icon: '👑', label: 'LEGENDARY', bg: 'rgba(50, 30, 10, 0.95)', color: '#f59e0b' },
    ];

    const totalBadges = badges.length;
    const badgeW = 180;
    const badgeH = 54;
    const gap = 16;
    const totalW = totalBadges * badgeW + (totalBadges - 1) * gap;
    const startX = (canvas.width - totalW) / 2;
    const y = 20;

    badges.forEach((b, idx) => {
        const x = startX + idx * (badgeW + gap);

        // Khung huy hiệu bo góc
        ctx.fillStyle = b.bg;
        ctx.beginPath();
        ctx.roundRect(x, y, badgeW, badgeH, 10);
        ctx.fill();

        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, badgeW, badgeH, 10);
        ctx.stroke();

        // Biểu tượng
        ctx.font = '22px "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.icon, x + 14, y + badgeH / 2);

        // Chữ
        ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = b.color;
        ctx.fillText(b.label, x + 50, y + badgeH / 2);
    });

    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(2.8, 0.26);
    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 1.85, -0.6);
    return mesh;
}

