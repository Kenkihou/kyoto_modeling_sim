// modelingEngine.js
import * as THREE from 'three';

// ==========================================
// 装飾専用マテリアル（エンジン内で1回だけ生成して使い回す）
// ==========================================
const balcWallMat = new THREE.MeshBasicMaterial({ 
    color: 0x999999, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide 
});
const balcGlassMat = new THREE.MeshBasicMaterial({ 
    color: 0x88ccff, transparent: true, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide 
});
const woodMat = new THREE.MeshBasicMaterial({ 
    color: 0x4a2e1b, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide 
});
const sashMat = new THREE.MeshBasicMaterial({ 
    color: 0x444444, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide 
});
const createGlassTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;    
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#8ab8e6');   
    grad.addColorStop(0.5, '#d4e8fc'); 
    grad.addColorStop(1, '#5c8fbf');   
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, 256);
    return new THREE.CanvasTexture(canvas);
};
const windowGlassMat = new THREE.MeshBasicMaterial({ 
    map: createGlassTexture(), color: 0xffffff, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide 
});
const doorMat = new THREE.MeshBasicMaterial({ 
    color: 0x4a3b32, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide 
});
const porchMat = new THREE.MeshBasicMaterial({ 
    color: 0xbbbbbb, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide 
});

export const ModelingEngine = {
    /**
     * 玄関扉・ポーチの生成
     * @param {Object} b - ブロックのデータ
     * @param {Number} baseY - Y座標の基準値
     * @param {Object} materials - 使用するマテリアルのセット
     * @returns {THREE.Group} 生成した玄関グループ
     */
    buildDoors: function(b, baseY, materials) {
        const group = new THREE.Group();
        const { edgeMat } = materials; // ★ doorMat, porchMat の受け取りを削除

        // 1階(baseY=0)かつドアデータが存在する場合のみ生成
        if (b.doors && baseY === 0) {
            for (let dir in b.doors) {
                const doorGroup = new THREE.Group();
                const p = b.doorParams && b.doorParams[dir] ? b.doorParams[dir] : { offsetX: 0 };
                
                // 寸法設定
                const w_door = 900, h_door = 2000, d_door = 50; 
                const w_porch = 1500, h_porch = 100, d_porch = 900;

                // 面の方向に応じた回転とオフセット（壁表面のZ位置）
                let rotY = 0, offsetZ = 0;
                if (dir === 'pz') { rotY = 0; offsetZ = b.d / 2; }
                else if (dir === 'nz') { rotY = Math.PI; offsetZ = b.d / 2; }
                else if (dir === 'px') { rotY = Math.PI / 2; offsetZ = b.w / 2; }
                else if (dir === 'nx') { rotY = -Math.PI / 2; offsetZ = b.w / 2; }

                // --- 1. 玄関ポーチ (Porch) ---
                const porchGeo = new THREE.BoxGeometry(w_porch, h_porch, d_porch);
                const porchPos = new THREE.Vector3(0, h_porch / 2, offsetZ + d_porch / 2);
                const porchMesh = new THREE.Mesh(porchGeo, porchMat);
                porchMesh.position.copy(porchPos);
                const porchLine = new THREE.LineSegments(new THREE.EdgesGeometry(porchGeo), edgeMat);
                porchLine.position.copy(porchPos);
                doorGroup.add(porchMesh, porchLine);

                // --- 2. 玄関扉 (Door) ---
                const doorGeo = new THREE.BoxGeometry(w_door, h_door, d_door);
                const doorPos = new THREE.Vector3(0, h_porch + h_door / 2, offsetZ + d_door / 2);
                const doorMesh = new THREE.Mesh(doorGeo, doorMat);
                doorMesh.position.copy(doorPos);
                const doorLine = new THREE.LineSegments(new THREE.EdgesGeometry(doorGeo), edgeMat);
                doorLine.position.copy(doorPos);
                doorGroup.add(doorMesh, doorLine);

                // 基準位置の設定と回転・スライド
                doorGroup.position.set(b.x, baseY, b.z);
                doorGroup.rotation.y = rotY;
                doorGroup.translateX(p.offsetX); 

                // タグ付け
                doorGroup.traverse(child => {
                    if (child.isMesh || child.isLineSegments) {
                        child.userData = { isDeco: true, type: 'door', dir: dir, id: b.id };
                    }
                });
                
                group.add(doorGroup);
            }
        }
        return group;
    },
/**
     * 掃き出し窓の生成
     */
    buildWindows: function(b, baseY, materials) {
        const group = new THREE.Group();
        const { edgeMat } = materials; // ★ sashMat, windowGlassMat の受け取りを削除

        if (b.windows) {
            for (let dir in b.windows) {
                const windowGroup = new THREE.Group();
                const p = b.windowParams && b.windowParams[dir] ? b.windowParams[dir] : { height: 2000, offsetX: 0, offsetY: 0 };

                const h_sash = p.height; 
                const w_total = 1970; 
                const fw = 30; 
                const z_thick = 30; 
                const g_thick = 20; 

                const topY = baseY + 2100 + p.offsetY; 
                windowGroup.position.set(b.x, topY - h_sash / 2, b.z);

                let rotY = 0, offsetZ = 0;
                if (dir === 'pz') { rotY = 0; offsetZ = b.d / 2; }
                else if (dir === 'nz') { rotY = Math.PI; offsetZ = b.d / 2; }
                else if (dir === 'px') { rotY = Math.PI / 2; offsetZ = b.w / 2; }
                else if (dir === 'nx') { rotY = -Math.PI / 2; offsetZ = b.w / 2; }

                const sashShape = new THREE.Shape();
                sashShape.moveTo(-w_total/2, -h_sash/2);
                sashShape.lineTo(w_total/2, -h_sash/2);
                sashShape.lineTo(w_total/2, h_sash/2);
                sashShape.lineTo(-w_total/2, h_sash/2);
                sashShape.lineTo(-w_total/2, -h_sash/2);

                const holeL = new THREE.Path();
                holeL.moveTo(-w_total/2 + fw, -h_sash/2 + fw);
                holeL.lineTo(-fw/2, -h_sash/2 + fw);
                holeL.lineTo(-fw/2, h_sash/2 - fw);
                holeL.lineTo(-w_total/2 + fw, h_sash/2 - fw);
                holeL.lineTo(-w_total/2 + fw, -h_sash/2 + fw);
                sashShape.holes.push(holeL);

                const holeR = new THREE.Path();
                holeR.moveTo(fw/2, -h_sash/2 + fw);
                holeR.lineTo(w_total/2 - fw, -h_sash/2 + fw);
                holeR.lineTo(w_total/2 - fw, h_sash/2 - fw);
                holeR.lineTo(fw/2, h_sash/2 - fw);
                holeR.lineTo(fw/2, -h_sash/2 + fw);
                sashShape.holes.push(holeR);

                const sashGeo = new THREE.ExtrudeGeometry(sashShape, { depth: z_thick, bevelEnabled: false });
                sashGeo.translate(0, 0, -z_thick/2); 

                const sashPos = new THREE.Vector3(0, 0, offsetZ + z_thick/2);
                const sashMesh = new THREE.Mesh(sashGeo, sashMat);
                sashMesh.position.copy(sashPos);
                const sashLine = new THREE.LineSegments(new THREE.EdgesGeometry(sashGeo), edgeMat);
                sashLine.position.copy(sashPos);
                windowGroup.add(sashMesh, sashLine);

                const g_width = (w_total - fw * 3) / 2; 
                const g_height = h_sash - fw * 2;       
                const glassGeo = new THREE.BoxGeometry(g_width, g_height, g_thick);

                const glassPosX_L = -w_total/2 + fw + g_width/2; 
                const glassPosX_R = w_total/2 - fw - g_width/2;  

                const posL = new THREE.Vector3(glassPosX_L, 0, offsetZ + z_thick/2);
                const posR = new THREE.Vector3(glassPosX_R, 0, offsetZ + z_thick/2);

                const leftGlass = new THREE.Mesh(glassGeo, windowGlassMat);
                leftGlass.position.copy(posL);
                const leftGlassLine = new THREE.LineSegments(new THREE.EdgesGeometry(glassGeo), edgeMat);
                leftGlassLine.position.copy(posL);
                windowGroup.add(leftGlass, leftGlassLine);

                const rightGlass = new THREE.Mesh(glassGeo, windowGlassMat);
                rightGlass.position.copy(posR);
                const rightGlassLine = new THREE.LineSegments(new THREE.EdgesGeometry(glassGeo), edgeMat);
                rightGlassLine.position.copy(posR);
                windowGroup.add(rightGlass, rightGlassLine);

                windowGroup.rotation.y = rotY;
                windowGroup.translateX(p.offsetX); 

                windowGroup.traverse(child => {
                    if (child.isMesh || child.isLineSegments) child.userData = { isDeco: true, type: 'window', dir: dir, id: b.id };
                });
                group.add(windowGroup);
            }
        }
        return group;
    },

    /**
     * バルコニーの生成
     */
    buildBalconies: function(b, baseY, materials) {
        const group = new THREE.Group();
        const { roofMat, edgeMat } = materials; // ★ balcWallMat, balcGlassMat の受け取りを削除

        if (b.balconies) {
            const t_floor = 100; 
            const t_wall = 100;  

            for (let dir in b.balconies) {
                const type = b.balconies[dir];
                const p = b.balcParams && b.balcParams[dir] ? b.balcParams[dir] : { depth: 1000, h_handrail: 1100, h_side: 1100 };
                const d_total = p.depth;
                const d_floor = d_total - t_wall;
                const h_wall = p.h_handrail; 
                const h_side = p.h_side;     

                const balcGroup = new THREE.Group();
                balcGroup.position.set(b.x, baseY + 100, b.z);

                const w2 = b.w / 2;
                const d2 = b.d / 2;
                const parts = [];

                if (dir === 'pz') { 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(b.w, t_floor, d_total), pos: new THREE.Vector3(0, t_floor/2, d2 + d_total/2) }); 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(t_wall, h_side, d_total), pos: new THREE.Vector3(-w2 + t_wall/2, t_floor + h_side/2, d2 + d_total/2) }); 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(t_wall, h_side, d_total), pos: new THREE.Vector3(w2 - t_wall/2, t_floor + h_side/2, d2 + d_total/2) }); 
                } else if (dir === 'nz') { 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(b.w, t_floor, d_total), pos: new THREE.Vector3(0, t_floor/2, -d2 - d_total/2) }); 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(t_wall, h_side, d_total), pos: new THREE.Vector3(-w2 + t_wall/2, t_floor + h_side/2, -d2 - d_total/2) }); 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(t_wall, h_side, d_total), pos: new THREE.Vector3(w2 - t_wall/2, t_floor + h_side/2, -d2 - d_total/2) }); 
                } else if (dir === 'px') { 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(d_total, t_floor, b.d), pos: new THREE.Vector3(w2 + d_total/2, t_floor/2, 0) }); 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(d_total, h_side, t_wall), pos: new THREE.Vector3(w2 + d_total/2, t_floor + h_side/2, -d2 + t_wall/2) }); 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(d_total, h_side, t_wall), pos: new THREE.Vector3(w2 + d_total/2, t_floor + h_side/2, d2 - t_wall/2) }); 
                } else if (dir === 'nx') { 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(d_total, t_floor, b.d), pos: new THREE.Vector3(-w2 - d_total/2, t_floor/2, 0) }); 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(d_total, h_side, t_wall), pos: new THREE.Vector3(-w2 - d_total/2, t_floor + h_side/2, -d2 + t_wall/2) }); 
                    parts.push({ mat: balcWallMat, geo: new THREE.BoxGeometry(d_total, h_side, t_wall), pos: new THREE.Vector3(-w2 - d_total/2, t_floor + h_side/2, d2 - t_wall/2) }); 
                }

                const L = (dir === 'pz' || dir === 'nz') ? b.w - t_wall * 2 : b.d - t_wall * 2;
                const frameW = 50; 

                const frameShape = new THREE.Shape();
                frameShape.moveTo(-L / 2, -20); frameShape.lineTo(L / 2, -20);
                frameShape.lineTo(L / 2, h_wall); frameShape.lineTo(-L / 2, h_wall);
                frameShape.lineTo(-L / 2, -20);

                if (type === 'glass') {
                    const N = Math.max(1, Math.round(L / 700));
                    const S = L / N;
                    for (let i = 0; i < N; i++) {
                        let left = (i === 0) ? (-L / 2 + frameW) : (-L / 2 + i * S + frameW / 2);
                        let right = (i + 1 === N) ? (L / 2 - frameW) : (-L / 2 + (i + 1) * S - frameW / 2);
                        
                        const hole = new THREE.Path();
                        hole.moveTo(left, frameW); hole.lineTo(right, frameW);
                        hole.lineTo(right, h_wall - frameW); hole.lineTo(left, h_wall - frameW);
                        hole.lineTo(left, frameW);
                        frameShape.holes.push(hole);

                        let gW = right - left, gH = h_wall - frameW * 2, gCx = (left + right) / 2;
                        const t_glass = 10;
                        let gPos = new THREE.Vector3(), gGeo = (dir === 'pz' || dir === 'nz') ? new THREE.BoxGeometry(gW, gH, t_glass) : new THREE.BoxGeometry(t_glass, gH, gW);
                        if (dir === 'pz') gPos.set(gCx, t_floor + h_wall / 2, d2 + d_floor + t_wall / 2);
                        else if (dir === 'nz') gPos.set(gCx, t_floor + h_wall / 2, -d2 - d_floor - t_wall / 2);
                        else if (dir === 'px') gPos.set(w2 + d_floor + t_wall / 2, t_floor + h_wall / 2, gCx);
                        else if (dir === 'nx') gPos.set(-w2 - d_floor - t_wall / 2, t_floor + h_wall / 2, gCx);
                        parts.push({ mat: balcGlassMat, geo: gGeo, pos: gPos });
                    }
                } else if (type === 'lattice') {
                    const N_pillars = Math.max(1, Math.round(L / 1100));
                    const S_pillar = L / N_pillars;
                    const botGap = 110;

                    for (let i = 0; i < N_pillars; i++) {
                        let cLeft = -L / 2 + i * S_pillar;
                        let cRight = -L / 2 + (i + 1) * S_pillar;
                        let pLeft = cLeft + (i === 0 ? frameW : frameW / 2);
                        let pRight = cRight - (i + 1 === N_pillars ? frameW : frameW / 2);
                        let innerW = pRight - pLeft;

                        const botHole = new THREE.Path();
                        botHole.moveTo(pLeft, -10); botHole.lineTo(pRight, -10);
                        botHole.lineTo(pRight, botGap); botHole.lineTo(pLeft, botGap);
                        botHole.lineTo(pLeft, -10);
                        frameShape.holes.push(botHole);

                        const max_gap = 110;
                        const picket_w = 50;
                        let n_pickets = Math.max(0, Math.ceil((innerW - max_gap) / (picket_w + max_gap)));
                        const actual_gap = (innerW - n_pickets * picket_w) / (n_pickets + 1);

                        for (let j = 0; j <= n_pickets; j++) {
                            let hLeft = pLeft + j * (actual_gap + picket_w);
                            let hRight = hLeft + actual_gap;
                            if (hRight > hLeft) {
                                const pHole = new THREE.Path();
                                pHole.moveTo(hLeft, botGap + 50); pHole.lineTo(hRight, botGap + 50);
                                pHole.lineTo(hRight, h_wall - 50); pHole.lineTo(hLeft, h_wall - 50);
                                pHole.lineTo(hLeft, botGap + 50);
                                frameShape.holes.push(pHole);
                            }
                        }
                    }
                }

                const frameDepth = 50; 
                const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: frameDepth, bevelEnabled: false });
                frameGeo.translate(0, 0, -frameDepth / 2);
                
                let fPos = new THREE.Vector3();
                if (dir === 'pz') fPos.set(0, t_floor, d2 + d_floor + t_wall / 2);
                else if (dir === 'nz') { frameGeo.rotateY(Math.PI); fPos.set(0, t_floor, -d2 - d_floor - t_wall / 2); }
                else if (dir === 'px') { frameGeo.rotateY(Math.PI / 2); fPos.set(w2 + d_floor + t_wall / 2, t_floor, 0); }
                else if (dir === 'nx') { frameGeo.rotateY(-Math.PI / 2); fPos.set(-w2 - d_floor - t_wall / 2, t_floor, 0); }
                parts.push({ mat: roofMat, geo: frameGeo, pos: fPos });

                parts.forEach(part => {
                    const mesh = new THREE.Mesh(part.geo, part.mat);
                    mesh.position.copy(part.pos);
                    const edges = new THREE.EdgesGeometry(part.geo);
                    const line = new THREE.LineSegments(edges, edgeMat);
                    line.position.copy(part.pos);
                    balcGroup.add(mesh, line);
                });
                
                balcGroup.traverse(child => {
                    if (child.isMesh || child.isLineSegments) child.userData = { isDeco: true, type: 'balcony', dir: dir, id: b.id };
                });
                group.add(balcGroup);
            }
        }
        return group;
    },

    /**
     * つけ柱・付け梁の生成
     */
    buildPilasters: function(b, baseY, materials) {
        const group = new THREE.Group();
        const { edgeMat } = materials; // ★ woodMat の受け取りを削除

        if (b.pilasters) {
            for (let dir in b.pilasters) {
                const pillarGroup = new THREE.Group();
                pillarGroup.position.set(b.x, baseY, b.z); 

                const params = b.pilasterParams[dir] || { pitch: 1000 };
                const L = (dir === 'pz' || dir === 'nz') ? b.w : b.d;
                const pillarW = 100; 
                const pillarD = 50;  
                const beamH = 100;   
                const targetPitch = params.pitch;

                if (L < pillarW) continue;

                const currentBeamY = params.beamY !== undefined ? params.beamY : (b.h - beamH);
                
                // ■ 1. 付け梁 (Beam) の生成
                const beamGeo = (dir === 'pz' || dir === 'nz') 
                    ? new THREE.BoxGeometry(L, beamH, pillarD)
                    : new THREE.BoxGeometry(pillarD, beamH, L);
                
                let beamPos = new THREE.Vector3();
                let beamYCenter = currentBeamY + beamH / 2;

                if (dir === 'pz') beamPos.set(0, beamYCenter, b.d / 2 + pillarD / 2);
                else if (dir === 'nz') beamPos.set(0, beamYCenter, -b.d / 2 - pillarD / 2);
                else if (dir === 'px') beamPos.set(b.w / 2 + pillarD / 2, beamYCenter, 0);
                else if (dir === 'nx') beamPos.set(-b.w / 2 - pillarD / 2, beamYCenter, 0);

                const beamMesh = new THREE.Mesh(beamGeo, woodMat);
                beamMesh.position.copy(beamPos);
                const beamLine = new THREE.LineSegments(new THREE.EdgesGeometry(beamGeo), edgeMat);
                beamLine.position.copy(beamPos);
                pillarGroup.add(beamMesh, beamLine);

                // ■ 2. つけ柱 (Pilasters) の生成
                const spanDistance = L - pillarW; 
                const N_spans = Math.max(1, Math.round(spanDistance / targetPitch)); 
                const actualPitch = spanDistance / N_spans;
                const bottomOffset = (baseY === 0) ? 100 : 0;

                for (let i = 0; i <= N_spans; i++) {
                    if (params.visiblePillars && params.visiblePillars[i] === false) continue;
                    let cx = (-L / 2 + pillarW / 2) + i * actualPitch;

                    const segments = [
                        { bot: bottomOffset, top: currentBeamY },       
                        { bot: currentBeamY + beamH, top: b.h }         
                    ];

                    segments.forEach(seg => {
                        const segH = seg.top - seg.bot;
                        if (segH > 1) { 
                            const pGeo = new THREE.BoxGeometry(pillarW, segH, pillarD);
                            let pPos = new THREE.Vector3();
                            let cy = seg.bot + segH / 2;

                            if (dir === 'pz') {
                                pPos.set(cx, cy, b.d / 2 + pillarD / 2);
                            } else if (dir === 'nz') {
                                pPos.set(cx, cy, -b.d / 2 - pillarD / 2);
                            } else if (dir === 'px') {
                                pGeo.rotateY(Math.PI / 2); 
                                pPos.set(b.w / 2 + pillarD / 2, cy, cx);
                            } else if (dir === 'nx') {
                                pGeo.rotateY(Math.PI / 2); 
                                pPos.set(-b.w / 2 - pillarD / 2, cy, cx);
                            }

                            const pMesh = new THREE.Mesh(pGeo, woodMat);
                            pMesh.position.copy(pPos);
                            const pLine = new THREE.LineSegments(new THREE.EdgesGeometry(pGeo), edgeMat);
                            pLine.position.copy(pPos);
                            pillarGroup.add(pMesh, pLine);
                        }
                    });
                }

                pillarGroup.traverse(child => {
                    if (child.isMesh || child.isLineSegments) child.userData = { isDeco: true, type: 'pilaster', dir: dir, id: b.id };
                });
                group.add(pillarGroup);
            }
        }
        return group;
    },

    /**
     * 庇・下屋・水平庇の生成
     */
    buildVisorsAndSkirts: function(b, baseY, materials) {
        const group = new THREE.Group();
        const { roofMat, wallMat, edgeMat } = materials;

        if (b.lowerRoof || (b.visors && b.visors.length > 0) || (b.flatVisors && b.flatVisors.length > 0)) {
            const e = 600; 
            const slope = 0.4; 
            const t = 150; 
            
            const skirtGroup = new THREE.Group();
            skirtGroup.position.set(b.x, baseY + b.h, b.z); 

            const w2 = b.w / 2; 
            const d2 = b.d / 2;

            // ==========================================
            // 1. 単独軒庇の生成 (visors)
            // ==========================================
            if (b.visors && b.visors.length > 0) {
                const backDist = 300; 
                
                const has_pz = b.visors.includes('pz'); 
                const has_nz = b.visors.includes('nz'); 
                const has_px = b.visors.includes('px'); 
                const has_nx = b.visors.includes('nx'); 

                const getK = (d) => (b.visorParams && b.visorParams[d]) ? b.visorParams[d].keraba : 300;
                const k_pz = getK('pz'); const k_nz = getK('nz'); 
                const k_px = getK('px'); const k_nx = getK('nx'); 

                const k_pz_L = has_nx ? 0 : k_pz; const k_pz_R = has_px ? 0 : k_pz; 
                const k_nz_L = has_px ? 0 : k_nz; const k_nz_R = has_nx ? 0 : k_nz; 
                const k_px_L = has_pz ? 0 : k_px; const k_px_R = has_nz ? 0 : k_px; 
                const k_nx_L = has_nz ? 0 : k_nx; const k_nx_R = has_pz ? 0 : k_nx; 

                const buildVisorFace = (dir, k_left, k_right, has_left_neighbor, has_right_neighbor) => {
                    const params = (b.visorParams && b.visorParams[dir]) ? b.visorParams[dir] : { eaves: 600, slope: 4 };
                    const e_dir = params.eaves;
                    const slope_dir = params.slope / 10;
                    const dropOuter = e_dir * slope_dir;
                    const dropInner = backDist * slope_dir;

                    const roofVerts = [], roofInds = [];
                    const wallVerts = [], wallInds = [];
                    let rIdx = 0, wIdx = 0;

                    const addRoofQuad = (p0, p1, p2, p3) => {
                        roofVerts.push(...p0, ...p1, ...p2, ...p3);
                        roofInds.push(rIdx, rIdx+1, rIdx+2, rIdx, rIdx+2, rIdx+3);
                        rIdx += 4;
                    };
                    const addWallTri = (p0, p1, p2) => {
                        wallVerts.push(...p0, ...p1, ...p2);
                        wallInds.push(wIdx, wIdx+1, wIdx+2);
                        wIdx += 3;
                    };

                    let pIT_L, pIT_R, pIB_L, pIB_R; 
                    let pOT_L, pOT_R, pOB_L, pOB_R; 
                    let pBT_L, pBT_R, pBB_L, pBB_R; 

                    if (dir === 'pz') {
                        pIT_L = [-w2-k_left, t, d2]; pIT_R = [w2+k_right, t, d2];
                        pIB_L = [-w2-k_left, 0, d2]; pIB_R = [w2+k_right, 0, d2];
                        const outL = has_left_neighbor ? -w2-e_dir : -w2-k_left;
                        const outR = has_right_neighbor ? w2+e_dir : w2+k_right;
                        pOT_L = [outL, -dropOuter+t, d2+e_dir]; pOT_R = [outR, -dropOuter+t, d2+e_dir];
                        pOB_L = [outL, -dropOuter, d2+e_dir];   pOB_R = [outR, -dropOuter, d2+e_dir];
                        const backL = has_left_neighbor ? -w2+backDist : -w2-k_left;
                        const backR = has_right_neighbor ? w2-backDist : w2+k_right;
                        pBT_L = [backL, -dropInner+t, d2-backDist]; pBT_R = [backR, -dropInner+t, d2-backDist];
                        pBB_L = [backL, -dropInner, d2-backDist];   pBB_R = [backR, -dropInner, d2-backDist];
                    } else if (dir === 'nz') {
                        pIT_L = [w2+k_left, t, -d2]; pIT_R = [-w2-k_right, t, -d2];
                        pIB_L = [w2+k_left, 0, -d2]; pIB_R = [-w2-k_right, 0, -d2];
                        const outL = has_left_neighbor ? w2+e_dir : w2+k_left;
                        const outR = has_right_neighbor ? -w2-e_dir : -w2-k_right;
                        pOT_L = [outL, -dropOuter+t, -d2-e_dir]; pOT_R = [outR, -dropOuter+t, -d2-e_dir];
                        pOB_L = [outL, -dropOuter, -d2-e_dir];   pOB_R = [outR, -dropOuter, -d2-e_dir];
                        const backL = has_left_neighbor ? w2-backDist : w2+k_left;
                        const backR = has_right_neighbor ? -w2+backDist : -w2-k_right;
                        pBT_L = [backL, -dropInner+t, -d2+backDist]; pBT_R = [backR, -dropInner+t, -d2+backDist];
                        pBB_L = [backL, -dropInner, -d2+backDist];   pBB_R = [backR, -dropInner, -d2+backDist];
                    } else if (dir === 'px') {
                        pIT_L = [w2, t, d2+k_left]; pIT_R = [w2, t, -d2-k_right];
                        pIB_L = [w2, 0, d2+k_left]; pIB_R = [w2, 0, -d2-k_right];
                        const outL = has_left_neighbor ? d2+e_dir : d2+k_left;
                        const outR = has_right_neighbor ? -d2-e_dir : -d2-k_right;
                        pOT_L = [w2+e_dir, -dropOuter+t, outL]; pOT_R = [w2+e_dir, -dropOuter+t, outR];
                        pOB_L = [w2+e_dir, -dropOuter, outL];   pOB_R = [w2+e_dir, -dropOuter, outR];
                        const backL = has_left_neighbor ? d2-backDist : d2+k_left;
                        const backR = has_right_neighbor ? -d2+backDist : -d2-k_right;
                        pBT_L = [w2-backDist, -dropInner+t, backL]; pBT_R = [w2-backDist, -dropInner+t, backR];
                        pBB_L = [w2-backDist, -dropInner, backL];   pBB_R = [w2-backDist, -dropInner, backR];
                    } else if (dir === 'nx') {
                        pIT_L = [-w2, t, -d2-k_left]; pIT_R = [-w2, t, d2+k_right];
                        pIB_L = [-w2, 0, -d2-k_left]; pIB_R = [-w2, 0, d2+k_right];
                        const outL = has_left_neighbor ? -d2-e_dir : -d2-k_left;
                        const outR = has_right_neighbor ? d2+e_dir : d2+k_right;
                        pOT_L = [-w2-e_dir, -dropOuter+t, outL]; pOT_R = [-w2-e_dir, -dropOuter+t, outR];
                        pOB_L = [-w2-e_dir, -dropOuter, outL];   pOB_R = [-w2-e_dir, -dropOuter, outR];
                        const backL = has_left_neighbor ? -d2+backDist : -d2-k_left;
                        const backR = has_right_neighbor ? d2-backDist : d2+k_right;
                        pBT_L = [-w2+backDist, -dropInner+t, backL]; pBT_R = [-w2+backDist, -dropInner+t, backR];
                        pBB_L = [-w2+backDist, -dropInner, backL];   pBB_R = [-w2+backDist, -dropInner, backR];
                    }

                    addRoofQuad(pIT_L, pIT_R, pOT_R, pOT_L); 
                    addRoofQuad(pIB_R, pIB_L, pOB_L, pOB_R); 
                    addRoofQuad(pOT_R, pOT_L, pOB_L, pOB_R); 

                    if (k_left > 0 || k_right > 0) {
                        addRoofQuad(pBT_L, pBT_R, pIT_R, pIT_L); 
                        addRoofQuad(pIB_R, pIB_L, pBB_L, pBB_R); 
                        addRoofQuad(pBT_R, pBT_L, pBB_L, pBB_R); 
                    } else {
                        addRoofQuad(pIT_L, pIT_R, pIB_R, pIB_L);
                    }

                    if (!has_left_neighbor) {
                        if (k_left > 0) addRoofQuad(pBT_L, pBB_L, pIB_L, pIT_L);
                        addRoofQuad(pIT_L, pIB_L, pOB_L, pOT_L); 
                    }
                    if (!has_right_neighbor) {
                        if (k_right > 0) addRoofQuad(pIT_R, pIB_R, pBB_R, pBT_R);
                        addRoofQuad(pOT_R, pOB_R, pIB_R, pIT_R); 
                    }

                    if (roofVerts.length > 0) {
                        const rGeo = new THREE.BufferGeometry();
                        rGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(roofVerts), 3));
                        rGeo.setIndex(roofInds);
                        rGeo.computeVertexNormals();
                        const rMesh = new THREE.Mesh(rGeo, roofMat);
                        rMesh.userData = { id: b.id, isDeco: true, type: 'visor', dir: dir };
                        skirtGroup.add(rMesh);
                        const rLine = new THREE.LineSegments(new THREE.EdgesGeometry(rGeo), edgeMat);
                        rLine.userData = { id: b.id, isDeco: true, type: 'visor', dir: dir };
                        skirtGroup.add(rLine);
                    }
                    if (wallVerts.length > 0) {
                        const wGeo = new THREE.BufferGeometry();
                        wGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wallVerts), 3));
                        wGeo.setIndex(wallInds);
                        wGeo.computeVertexNormals();
                        const wMesh = new THREE.Mesh(wGeo, wallMat);
                        wMesh.userData = { id: b.id, isDeco: true, type: 'visor', dir: dir };
                        skirtGroup.add(wMesh);
                        const wLine = new THREE.LineSegments(new THREE.EdgesGeometry(wGeo), edgeMat);
                        wLine.userData = { id: b.id, isDeco: true, type: 'visor', dir: dir };
                        skirtGroup.add(wLine);
                    }
                };

                if (has_pz) buildVisorFace('pz', k_pz_L, k_pz_R, has_nx, has_px);
                if (has_nz) buildVisorFace('nz', k_nz_L, k_nz_R, has_px, has_nx);
                if (has_px) buildVisorFace('px', k_px_L, k_px_R, has_pz, has_nz);
                if (has_nx) buildVisorFace('nx', k_nx_L, k_nx_R, has_nz, has_pz);
            }

            // ==========================================
            // 2. 下屋の生成 (lowerRoof)
            // ==========================================
            if (b.lowerRoof) {
                const lr = b.lowerRoof;
                const max_out = Math.max(lr.out_nx, lr.out_px, lr.out_nz, lr.out_pz);
                if (max_out > 0) {
                    const e_lr = lr.eaves !== undefined ? lr.eaves : 600;
                    const slope_lr = lr.slope !== undefined ? lr.slope / 10 : 0.4;
                    const k_lr = lr.keraba !== undefined ? lr.keraba : 300;

                    const H_max = max_out * slope_lr; 
                    const H_out_eaves = e_lr * slope_lr;
                    const backDist = 300;       
                    const dropInner = backDist * slope_lr; 

                    const e_nx = e_lr * (lr.out_nx / max_out);
                    const e_px = e_lr * (lr.out_px / max_out);
                    const e_nz = e_lr * (lr.out_nz / max_out);
                    const e_pz = e_lr * (lr.out_pz / max_out);

                    const x_wall_L = -w2; const x_wall_R = w2;
                    const z_wall_B = -d2; const z_wall_F = d2;
                    const x_in_L = x_wall_L + lr.out_nx; const x_in_R = x_wall_R - lr.out_px;
                    const z_in_B = z_wall_B + lr.out_nz; const z_in_F = z_wall_F - lr.out_pz;
                    const x_out_L = x_wall_L - e_nx; const x_out_R = x_wall_R + e_px;
                    const z_out_B = z_wall_B - e_nz; const z_out_F = z_wall_F + e_pz;

                    const roofVerts = [], roofInds = [];
                    const wallVerts = [], wallInds = [];
                    let rIdx = 0, wIdx = 0;

                    const addRoofQuad = (p0, p1, p2, p3) => {
                        roofVerts.push(...p0, ...p1, ...p2, ...p3);
                        roofInds.push(rIdx, rIdx+1, rIdx+2, rIdx, rIdx+2, rIdx+3);
                        rIdx += 4;
                    };
                    const addWallTri = (p0, p1, p2) => {
                        wallVerts.push(...p0, ...p1, ...p2);
                        wallInds.push(wIdx, wIdx+1, wIdx+2);
                        wIdx += 3;
                    };

                    if (lr.out_pz > 0) { 
                        let x_L_in = x_in_L, x_L_out = x_out_L;
                        let x_R_in = x_in_R, x_R_out = x_out_R;
                        if (lr.out_nx === 0) { x_L_in = x_wall_L - k_lr; x_L_out = x_wall_L - k_lr; }
                        if (lr.out_px === 0) { x_R_in = x_wall_R + k_lr; x_R_out = x_wall_R + k_lr; }
                        
                        const pIT_L = [x_L_in, H_max+t, z_in_F], pIT_R = [x_R_in, H_max+t, z_in_F];
                        const pIB_L = [x_L_in, H_max, z_in_F],   pIB_R = [x_R_in, H_max, z_in_F];
                        const pOT_L = [x_L_out, -H_out_eaves+t, z_out_F], pOT_R = [x_R_out, -H_out_eaves+t, z_out_F];
                        const pOB_L = [x_L_out, -H_out_eaves, z_out_F],   pOB_R = [x_R_out, -H_out_eaves, z_out_F];

                        addRoofQuad(pIT_L, pIT_R, pOT_R, pOT_L); 
                        addRoofQuad(pIB_R, pIB_L, pOB_L, pOB_R); 
                        addRoofQuad(pOT_R, pOT_L, pOB_L, pOB_R); 

                        if (lr.out_nx === 0) { 
                            if (k_lr > 0) {
                                const pBT_L = [x_wall_L - k_lr, H_max-dropInner+t, z_in_F - backDist];
                                const pBT_R = [x_wall_L, H_max-dropInner+t, z_in_F - backDist];
                                const pBB_L = [x_wall_L - k_lr, H_max-dropInner, z_in_F - backDist];
                                const pBB_R = [x_wall_L, H_max-dropInner, z_in_F - backDist];
                                const piT_R = [x_wall_L, H_max+t, z_in_F];
                                const piB_R = [x_wall_L, H_max, z_in_F];
                                addRoofQuad(pBT_L, pBT_R, piT_R, pIT_L); 
                                addRoofQuad(piB_R, pIB_L, pBB_L, pBB_R); 
                                addRoofQuad(pBT_R, pBT_L, pBB_L, pBB_R); 
                                addRoofQuad(pBT_L, pBB_L, pIB_L, pIT_L); 
                            }
                            addRoofQuad(pIT_L, pIB_L, pOB_L, pOT_L); 
                            addWallTri([x_wall_L, H_max, z_in_F], [x_wall_L, 0, z_in_F], [x_wall_L, 0, z_wall_F]);
                        }
                        if (lr.out_px === 0) { 
                            if (k_lr > 0) {
                                const pBT_L = [x_wall_R, H_max-dropInner+t, z_in_F - backDist];
                                const pBT_R = [x_wall_R + k_lr, H_max-dropInner+t, z_in_F - backDist];
                                const pBB_L = [x_wall_R, H_max-dropInner, z_in_F - backDist];
                                const pBB_R = [x_wall_R + k_lr, H_max-dropInner, z_in_F - backDist];
                                const piT_L = [x_wall_R, H_max+t, z_in_F];
                                const piB_L = [x_wall_R, H_max, z_in_F];
                                addRoofQuad(pBT_L, pBT_R, pIT_R, piT_L);
                                addRoofQuad(pIB_R, piB_L, pBB_L, pBB_R);
                                addRoofQuad(pBT_R, pBT_L, pBB_L, pBB_R);
                                addRoofQuad(pIT_R, pIB_R, pBB_R, pBT_R); 
                            }
                            addRoofQuad(pOT_R, pOB_R, pIB_R, pIT_R); 
                            addWallTri([x_wall_R, H_max, z_in_F], [x_wall_R, 0, z_wall_F], [x_wall_R, 0, z_in_F]);
                        }
                    }

                    if (lr.out_nz > 0) {
                        let x_inR = x_in_R, x_outR = x_out_R;
                        let x_inL = x_in_L, x_outL = x_out_L;
                        if (lr.out_px === 0) { x_inR = x_wall_R + k_lr; x_outR = x_wall_R + k_lr; }
                        if (lr.out_nx === 0) { x_inL = x_wall_L - k_lr; x_outL = x_wall_L - k_lr; }

                        const pIT_R = [x_inR, H_max+t, z_in_B], pIT_L = [x_inL, H_max+t, z_in_B];
                        const pIB_R = [x_inR, H_max, z_in_B],   pIB_L = [x_inL, H_max, z_in_B];
                        const pOT_R = [x_outR, -H_out_eaves+t, z_out_B], pOT_L = [x_outL, -H_out_eaves+t, z_out_B];
                        const pOB_R = [x_out_R, -H_out_eaves, z_out_B],   pOB_L = [x_outL, -H_out_eaves, z_out_B];

                        addRoofQuad(pIT_R, pIT_L, pOT_L, pOT_R);
                        addRoofQuad(pIB_L, pIB_R, pOB_R, pOB_L);
                        addRoofQuad(pOT_L, pOT_R, pOB_R, pOB_L);

                        if (lr.out_px === 0) {
                            if (k_lr > 0) {
                                const pBT_R = [x_wall_R + k_lr, H_max-dropInner+t, z_in_B + backDist];
                                const pBT_L = [x_wall_R, H_max-dropInner+t, z_in_B + backDist];
                                const pBB_R = [x_wall_R + k_lr, H_max-dropInner, z_in_B + backDist];
                                const pBB_L = [x_wall_R, H_max-dropInner, z_in_B + backDist];
                                const piT_L = [x_wall_R, H_max+t, z_in_B];
                                const piB_L = [x_wall_R, H_max, z_in_B];
                                addRoofQuad(pBT_R, pBT_L, piT_L, pIT_R);
                                addRoofQuad(piB_L, pIB_R, pBB_R, pBB_L);
                                addRoofQuad(pBT_L, pBT_R, pBB_R, pBB_L);
                                addRoofQuad(pBT_R, pBB_R, pIB_R, pIT_R); 
                            }
                            addRoofQuad(pIT_R, pIB_R, pOB_R, pOT_R); 
                            addWallTri([x_wall_R, H_max, z_in_B], [x_wall_R, 0, z_in_B], [x_wall_R, 0, z_wall_B]);
                        }
                        if (lr.out_nx === 0) {
                            if (k_lr > 0) {
                                const pBT_R = [x_wall_L, H_max-dropInner+t, z_in_B + backDist];
                                const pBT_L = [x_wall_L - k_lr, H_max-dropInner+t, z_in_B + backDist];
                                const pBB_R = [x_wall_L, H_max-dropInner, z_in_B + backDist];
                                const pBB_L = [x_wall_L - k_lr, H_max-dropInner, z_in_B + backDist];
                                const piT_R = [x_wall_L, H_max+t, z_in_B];
                                const piB_R = [x_wall_L, H_max, z_in_B];
                                addRoofQuad(pBT_R, pBT_L, pIT_L, piT_R);
                                addRoofQuad(b.lowerRoof ? pIB_L : [], piB_R, pBB_R, pBB_L); 
                                addRoofQuad(pBT_L, pBT_R, pBB_R, pBB_L);
                                addRoofQuad(pIT_L, pIB_L, pBB_L, pBT_L); 
                            }
                            addRoofQuad(pOT_L, pOB_L, pIB_L, pIT_L); 
                            addWallTri([x_in_L, H_max, z_in_B], [x_wall_L, 0, z_wall_B], [x_in_L, 0, z_in_B]);
                        }
                    }

                    if (lr.out_px > 0) {
                        let z_inB = z_in_B, z_outB = z_out_B; 
                        let z_inF = z_in_F, z_outF = z_out_F; 
                        if (lr.out_nz === 0) { z_inB = z_wall_B - k_lr; z_outB = z_wall_B - k_lr; }
                        if (lr.out_pz === 0) { z_inF = z_wall_F + k_lr; z_outF = z_wall_F + k_lr; }

                        const pIT_B = [x_in_R, H_max+t, z_inB], pIT_F = [x_in_R, H_max+t, z_inF];
                        const pIB_B = [x_in_R, H_max, z_inB],   pIB_F = [x_in_R, H_max, z_inF];
                        const pOT_B = [x_out_R, -H_out_eaves+t, z_outB], pOT_F = [x_out_R, -H_out_eaves+t, z_outF];
                        const pOB_B = [x_out_R, -H_out_eaves, z_outB],   pOB_F = [x_out_R, -H_out_eaves, z_outF];

                        addRoofQuad(pIT_B, pIT_F, pOT_F, pOT_B);
                        addRoofQuad(pIB_F, pIB_B, pOB_B, pOB_F);
                        addRoofQuad(pOT_F, pOT_B, pOB_B, pOB_F);

                        if (lr.out_nz === 0) {
                            if (k_lr > 0) {
                                const pBT_B = [x_in_R - backDist, H_max-dropInner+t, z_wall_B - k_lr];
                                const pBT_F = [x_in_R - backDist, H_max-dropInner+t, z_wall_B];
                                const pBB_B = [x_in_R - backDist, H_max-dropInner, z_wall_B - k_lr];
                                const pBB_F = [x_in_R - backDist, H_max-dropInner, z_wall_B];
                                const piT_F = [x_in_R, H_max+t, z_wall_B];
                                const piB_F = [x_in_R, H_max, z_wall_B];
                                addRoofQuad(pBT_B, pBT_F, piT_F, pIT_B);
                                addRoofQuad(piB_F, pIB_B, pBB_B, pBB_F);
                                addRoofQuad(pBT_F, pBT_B, pBB_B, pBB_F);
                                addRoofQuad(pBT_B, pBB_B, pIB_B, pIT_B); 
                            }
                            addRoofQuad(pIT_B, pIB_B, pOB_B, pOT_B); 
                            addWallTri([x_in_R, H_max, z_wall_B], [x_wall_R, 0, z_wall_B], [x_in_R, 0, z_wall_B]);
                        }
                        if (lr.out_pz === 0) {
                            if (k_lr > 0) {
                                const pBT_B = [x_in_R - backDist, H_max-dropInner+t, z_wall_F];
                                const pBT_F = [x_in_R - backDist, H_max-dropInner+t, z_wall_F + k_lr];
                                const pBB_B = [x_in_R - backDist, H_max-dropInner, z_wall_F];
                                const pBB_F = [x_in_R - backDist, H_max-dropInner, z_wall_F + k_lr];
                                const piT_B = [x_in_R, H_max+t, z_wall_F];
                                const piB_B = [x_in_R, H_max, z_wall_F];
                                addRoofQuad(pBT_B, pBT_F, pIT_F, piT_B);
                                addRoofQuad(pIB_F, piB_B, pBB_B, pBB_F);
                                addRoofQuad(pBT_F, pBT_B, pBB_B, pBB_F);
                                addRoofQuad(pIT_F, pIB_F, pBB_F, pBT_F); 
                            }
                            addRoofQuad(pOT_F, pOB_F, pIB_F, pIT_F); 
                            addWallTri([x_in_R, H_max, z_wall_F], [x_in_R, 0, z_wall_F], [x_wall_R, 0, z_wall_F]);
                        }
                    }

                    if (lr.out_nx > 0) {
                        let z_inF = z_in_F, z_outF = z_out_F;
                        let z_inB = z_in_B, z_outB = z_out_B;
                        if (lr.out_pz === 0) { z_inF = z_wall_F + k_lr; z_outF = z_wall_F + k_lr; }
                        if (lr.out_nz === 0) { z_inB = z_wall_B - k_lr; z_outB = z_wall_B - k_lr; }

                        const pIT_F = [x_in_L, H_max+t, z_inF], pIT_B = [x_in_L, H_max+t, z_inB];
                        const pIB_F = [x_in_L, H_max, z_inF],   pIB_B = [x_in_L, H_max, z_inB];
                        const pOT_F = [x_out_L, -H_out_eaves+t, z_outF], pOT_B = [x_out_L, -H_out_eaves+t, z_outB];
                        const pOB_F = [x_out_L, -H_out_eaves, z_outF],   pOB_B = [x_out_L, -H_out_eaves, z_outB];

                        addRoofQuad(pIT_F, pIT_B, pOT_B, pOT_F);
                        addRoofQuad(pIB_B, pIB_F, pOB_F, pOB_B);
                        addRoofQuad(pOT_B, pOT_F, pOB_F, pOB_B);

                        if (lr.out_pz === 0) {
                            if (k_lr > 0) {
                                const pBT_F = [x_in_L + backDist, H_max-dropInner+t, z_wall_F + k_lr];
                                const pBT_B = [x_in_L + backDist, H_max-dropInner+t, z_wall_F];
                                const pBB_F = [x_in_L + backDist, H_max-dropInner, z_wall_F + k_lr];
                                const pBB_B = [x_in_L + backDist, H_max-dropInner, z_wall_F];
                                const piT_B = [x_in_L, H_max+t, z_wall_F];
                                const piB_B = [x_in_L, H_max, z_wall_F];
                                addRoofQuad(pBT_F, pBT_B, piT_B, pIT_F);
                                addRoofQuad(piB_B, pIB_F, pBB_F, pBB_B);
                                addRoofQuad(pBT_B, pBT_F, pBB_F, pBB_B);
                                addRoofQuad(pBT_F, pBB_F, pIB_F, pIT_F); 
                            }
                            addRoofQuad(pIT_F, pIB_F, pOB_F, pOT_F); 
                            addWallTri([x_in_L, H_max, z_wall_F], [x_wall_L, 0, z_wall_F], [x_in_L, 0, z_wall_F]);
                        }
                        if (lr.out_nz === 0) {
                            if (k_lr > 0) {
                                const pBT_F = [x_in_L + backDist, H_max-dropInner+t, z_wall_B];
                                const pBT_B = [x_in_L + backDist, H_max-dropInner+t, z_wall_B - k_lr];
                                const pBB_F = [x_in_L + backDist, H_max-dropInner, z_wall_B];
                                const pBB_B = [x_in_L + backDist, Math.max(0, H_max-dropInner), z_wall_B - k_lr]; 
                                const piT_F = [x_in_L, H_max+t, z_wall_B];
                                const piB_F = [x_in_L, H_max, z_wall_B];
                                addRoofQuad(pBT_F, pBT_B, pIT_B, piT_F);
                                addRoofQuad(pIB_B, piB_F, pBB_F, pBB_B);
                                addRoofQuad(pBT_B, pBT_F, pBB_F, pBB_B);
                                addRoofQuad(pIT_B, pIB_B, pBB_B, pBT_B); 
                            }
                            addRoofQuad(pOT_B, pOB_B, pIB_B, pIT_B); 
                            addWallTri([x_in_L, H_max, z_wall_B], [x_in_L, 0, z_wall_B], [x_wall_L, 0, z_wall_B]);
                        }
                    }

                    if (roofVerts.length > 0) {
                        const rGeo = new THREE.BufferGeometry();
                        rGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(roofVerts), 3));
                        rGeo.setIndex(roofInds);
                        rGeo.computeVertexNormals();
                        const rMesh = new THREE.Mesh(rGeo, roofMat);
                        rMesh.userData = { id: b.id, isDeco: true, type: 'lowerRoof' };
                        skirtGroup.add(rMesh);
                        const rLine = new THREE.LineSegments(new THREE.EdgesGeometry(rGeo), edgeMat);
                        rLine.userData = { id: b.id, isDeco: true, type: 'lowerRoof' };
                        skirtGroup.add(rLine);
                    }
                    if (wallVerts.length > 0) {
                        const wGeo = new THREE.BufferGeometry();
                        wGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wallVerts), 3));
                        wGeo.setIndex(wallInds);
                        wGeo.computeVertexNormals();
                        const wMesh = new THREE.Mesh(wGeo, wallMat);
                        wMesh.userData = { id: b.id, isDeco: true, type: 'lowerRoof' };
                        skirtGroup.add(wMesh);
                        const wLine = new THREE.LineSegments(new THREE.EdgesGeometry(wGeo), edgeMat);
                        wLine.userData = { id: b.id, isDeco: true, type: 'lowerRoof' };
                        skirtGroup.add(wLine);
                    }
                }
            }

            // ==========================================
            // 3. 水平庇の生成 (flatVisors)
            // ==========================================
            if (b.flatVisors && b.flatVisors.length > 0) {
                const t_flat = 100; 
                
                b.flatVisors.forEach(dir => {
                    const params = (b.flatVisorParams && b.flatVisorParams[dir]) ? b.flatVisorParams[dir] : { depth: 300, offsetY: 0, margin: 0 };
                    const e_flat = params.depth;     
                    const o_y = params.offsetY;      
                    const m_flat = params.margin;    
                    
                    const flat_w = Math.max(10, b.w - m_flat * 2);
                    const flat_d = Math.max(10, b.d - m_flat * 2);

                    let fGeo, fPos;
                    if (dir === 'pz') {
                        fGeo = new THREE.BoxGeometry(flat_w, t_flat, e_flat);
                        fPos = new THREE.Vector3(0, -t_flat/2 + o_y, b.d/2 + e_flat/2);
                    } else if (dir === 'nz') {
                        fGeo = new THREE.BoxGeometry(flat_w, t_flat, e_flat);
                        fPos = new THREE.Vector3(0, -t_flat/2 + o_y, -b.d/2 - e_flat/2);
                    } else if (dir === 'px') {
                        fGeo = new THREE.BoxGeometry(e_flat, t_flat, flat_d);
                        fPos = new THREE.Vector3(b.w/2 + e_flat/2, -t_flat/2 + o_y, 0);
                    } else if (dir === 'nx') {
                        fGeo = new THREE.BoxGeometry(e_flat, t_flat, flat_d);
                        fPos = new THREE.Vector3(-b.w/2 - e_flat/2, -t_flat/2 + o_y, 0);
                    }

                    if (fGeo && fPos) {
                        const fMesh = new THREE.Mesh(fGeo, wallMat);
                        fMesh.position.copy(fPos);
                        fMesh.userData = { id: b.id, isDeco: true, type: 'flatVisor', dir: dir }; 
                        
                        const fLine = new THREE.LineSegments(new THREE.EdgesGeometry(fGeo), edgeMat);
                        fLine.position.copy(fPos);
                        fLine.userData = { id: b.id, isDeco: true, type: 'flatVisor', dir: dir }; 
                        
                        skirtGroup.add(fMesh, fLine);
                    }
                });
            }

            group.add(skirtGroup);
        }
        return group;
    },

/**
     * 大屋根の生成
     */
    buildRoofs: function(b, baseY, buildingData, materials) {
        const group = new THREE.Group();
        const { wallMat, roofMat, edgeMat } = materials;

        if (b.roof) {
            const roofGroup = new THREE.Group();
            roofGroup.position.set(b.x, baseY + b.h, b.z); 
            
            const w = b.w; const d = b.d; 
            const t = 150; 

            const rParams = b.roof.params[b.roof.type];
            const slope = (rParams.slope !== undefined) ? rParams.slope / 10 : 0.4;
            
            let e_px = 0, e_nx = 0, e_pz = 0, e_nz = 0;

            if (b.roof.type === '切妻') {
                if (rParams.rotate90) {
                    e_px = rParams.keraba; e_nx = rParams.keraba;
                    e_pz = rParams.eaves;  e_nz = rParams.eaves;
                } else {
                    e_px = rParams.eaves;  e_nx = rParams.eaves;
                    e_pz = rParams.keraba; e_nz = rParams.keraba;
                }
            } else if (b.roof.type === '寄棟') {
                e_px = rParams.eaves; e_nx = rParams.eaves;
                e_pz = rParams.eaves; e_nz = rParams.eaves;
            }

            // 隣接ブロックとの干渉回避ロジック
            buildingData.forEach(ob => {
                if (ob.id === b.id) return;
                if ((ob.y || 0) + ob.h > (b.y || 0) + b.h - 50) {
                    if (Math.max((b.z) - b.d/2, (ob.z) - ob.d/2) < Math.min((b.z) + b.d/2, (ob.z) + ob.d/2) - 1) {
                        if (ob.x > b.x) {
                            let gap = (ob.x - ob.w/2) - (b.x + b.w/2);
                            if (gap >= -10 && gap < e_px) e_px = Math.max(0, gap);
                        }
                        if (ob.x < b.x) {
                            let gap = (b.x - b.w/2) - (ob.x + ob.w/2);
                            if (gap >= -10 && gap < e_nx) e_nx = Math.max(0, gap);
                        }
                    }
                    if (Math.max((b.x) - b.w/2, (ob.x) - ob.w/2) < Math.min((b.x) + b.w/2, (ob.x) + ob.w/2) - 1) {
                        if (ob.z > b.z) {
                            let gap = (ob.z - ob.d/2) - (b.z + b.d/2);
                            if (gap >= -10 && gap < e_pz) e_pz = Math.max(0, gap);
                        }
                        if (ob.z < b.z) {
                            let gap = (b.z - b.d/2) - (ob.z + ob.d/2);
                            if (gap >= -10 && gap < e_nz) e_nz = Math.max(0, gap);
                        }
                    }
                }
            });

            if (b.roof.type === '寄棟') {
                let e_all = Math.min(e_px, e_nx, e_pz, e_nz);
                e_px = e_all; e_nx = e_all; e_pz = e_all; e_nz = e_all;
            }

            // --- パラペット修景 / 陸屋根 ---
            if (b.roof.type === 'パラペット修景' || b.roof.type === '陸屋根') {
                const pThick = 150; 
                const pHeight = rParams.pHeight;
                
                const outerShape = new THREE.Shape();
                outerShape.moveTo(-w/2, -d/2);
                outerShape.lineTo(w/2, -d/2);
                outerShape.lineTo(w/2, d/2);
                outerShape.lineTo(-w/2, d/2);
                outerShape.lineTo(-w/2, -d/2);
                
                const innerHole = new THREE.Path();
                innerHole.moveTo(-w/2 + pThick, -d/2 + pThick);
                innerHole.lineTo(-w/2 + pThick, d/2 - pThick);
                innerHole.lineTo(w/2 - pThick, d/2 - pThick);
                innerHole.lineTo(w/2 - pThick, -d/2 + pThick);
                innerHole.lineTo(-w/2 + pThick, -d/2 + pThick);
                
                outerShape.holes.push(innerHole);
                
                const pGeo = new THREE.ExtrudeGeometry(outerShape, { depth: pHeight, bevelEnabled: false });
                pGeo.rotateX(-Math.PI / 2);
                
                const pMesh = new THREE.Mesh(pGeo, wallMat);
                const pLine = new THREE.LineSegments(new THREE.EdgesGeometry(pGeo), edgeMat);
                roofGroup.add(pMesh, pLine);

                if (b.roof.type === 'パラペット修景') {
                    const e_out = rParams.out_px; 
                    const e_in_target = rParams.in_px; 
                    const max_in = Math.min(e_in_target, w/2, d/2); 
                    
                    const rSlope = rParams.slope / 10; 
                    const rThick = 150; 

                    const y_OB = pHeight - e_out * rSlope;  
                    const y_OT = y_OB + rThick;            
                    const y_IB = pHeight + max_in * rSlope; 
                    const y_IT = y_IB + rThick;            

                    const x_out = w/2 + e_out;
                    const z_out = d/2 + e_out;
                    const x_in = w/2 - max_in;
                    const z_in = d/2 - max_in;

                    const pts = [
                        [x_out, y_OT, z_out], [x_out, y_OB, z_out], [x_in, y_IT, z_in], [x_in, y_IB, z_in],       
                        [-x_out, y_OT, z_out], [-x_out, y_OB, z_out], [-x_in, y_IT, z_in], [-x_in, y_IB, z_in],   
                        [-x_out, y_OT, -z_out], [-x_out, y_OB, -z_out], [-x_in, y_IT, -z_in], [-x_in, y_IB, -z_in], 
                        [x_out, y_OT, -z_out], [x_out, y_OB, -z_out], [x_in, y_IT, -z_in], [x_in, y_IB, -z_in]    
                    ];

                    const rVerts = []; const rInds = []; let vIdx = 0;

                    const addQuad = (p0, p1, p2, p3) => {
                        rVerts.push(...p0, ...p1, ...p2, ...p3);
                        rInds.push(vIdx, vIdx+1, vIdx+2, vIdx, vIdx+2, vIdx+3);
                        vIdx += 4;
                    };

                    for (let i = 0; i < 4; i++) {
                        const next = (i + 1) % 4;
                        const i0 = i * 4; const n0 = next * 4;
                        const pOT = pts[i0 + 0], pOB = pts[i0 + 1], pIT = pts[i0 + 2], pIB = pts[i0 + 3];
                        const nOT = pts[n0 + 0], nOB = pts[n0 + 1], nIT = pts[n0 + 2], nIB = pts[n0 + 3];
                        addQuad(pOT, nOT, nIT, pIT); 
                        addQuad(pOB, pIB, nIB, nOB); 
                        addQuad(pOB, pOT, nOT, nOB); 
                        addQuad(pIB, nIB, nIT, pIT); 
                    }

                    const rGeo = new THREE.BufferGeometry();
                    rGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rVerts), 3));
                    rGeo.setIndex(rInds);
                    rGeo.computeVertexNormals();

                    const rMesh = new THREE.Mesh(rGeo, roofMat);
                    const rLine = new THREE.LineSegments(new THREE.EdgesGeometry(rGeo), edgeMat);
                    roofGroup.add(rMesh, rLine);
                }

            } else if (b.roof.type === '切妻') {
                const isRot = rParams.rotate90; 
                const profW = isRot ? d : w; 
                const extD  = isRot ? w : d; 
                
                let e_L, e_R;
                if (isRot) {
                    e_L = e_pz; e_R = e_nz; 
                } else {
                    e_L = e_nx; e_R = e_px; 
                }
                
                // --- 棟の位置オフセットと妻面の計算 ---
                let rOffsetPct = rParams.ridgeOffset || 0; 
                let ridgeX = (profW * rOffsetPct) / 100;
                
                let spanL = (profW / 2) + ridgeX;
                let spanR = (profW / 2) - ridgeX;
                
                // 勾配を一定に保つため、スパンが長い方を基準に棟の高さを決定
                const ridgeH = Math.max(spanL, spanR) * slope;
                
                // 左右の壁の高さを計算（スパンが短い方は0、長い方は5角形の肩になる）
                let y_wall_L = ridgeH - spanL * slope;
                let y_wall_R = ridgeH - spanR * slope;

                // 軒先のY座標（基本は軒先に向かって下がる）
                let y_L_out = y_wall_L - e_L * slope;
                let y_R_out = y_wall_R - e_R * slope;
                
                // 50% または -50% に振り切った時は「片流れ」として直線を延長する
                if (rOffsetPct === 50) {
                    y_R_out = y_wall_R + e_R * slope;
                } else if (rOffsetPct === -50) {
                    y_L_out = y_wall_L + e_L * slope;
                }

                // 壁（妻面）の描画（5角形対応）
                const gShape = new THREE.Shape();
                gShape.moveTo(-profW/2, 0); 
                gShape.lineTo(profW/2, 0);
                gShape.lineTo(profW/2, y_wall_R);
                gShape.lineTo(ridgeX, ridgeH); 
                gShape.lineTo(-profW/2, y_wall_L);
                gShape.lineTo(-profW/2, 0);
                const gGeo = new THREE.ExtrudeGeometry(gShape, { depth: extD, bevelEnabled: false });

                // 屋根の厚み（断面）の描画
                const rShape = new THREE.Shape();
                rShape.moveTo(-profW/2 - e_L, y_L_out + t);
                rShape.lineTo(ridgeX, ridgeH + t);
                rShape.lineTo(profW/2 + e_R, y_R_out + t);
                rShape.lineTo(profW/2 + e_R, y_R_out);
                rShape.lineTo(ridgeX, ridgeH);
                rShape.lineTo(-profW/2 - e_L, y_L_out);
                rShape.lineTo(-profW/2 - e_L, y_L_out + t);
                
                const roofD = isRot ? extD + e_nx + e_px : extD + e_nz + e_pz;
                const rGeo = new THREE.ExtrudeGeometry(rShape, { depth: roofD, bevelEnabled: false });

                if (isRot) {
                    gGeo.translate(0, 0, -extD/2);
                    rGeo.translate(0, 0, -(extD/2 + e_nx));
                    gGeo.rotateY(Math.PI / 2);
                    rGeo.rotateY(Math.PI / 2);
                } else {
                    gGeo.translate(0, 0, -extD/2);
                    rGeo.translate(0, 0, -(extD/2 + e_nz));
                }
                
                const gMesh = new THREE.Mesh(gGeo, wallMat);
                const gLine = new THREE.LineSegments(new THREE.EdgesGeometry(gGeo), edgeMat);
                roofGroup.add(gMesh, gLine);
                
                const rMesh = new THREE.Mesh(rGeo, roofMat);
                const rLine = new THREE.LineSegments(new THREE.EdgesGeometry(rGeo), edgeMat);
                roofGroup.add(rMesh, rLine);

            } else {
                let ridge_axis = w <= d ? 'Z' : 'X';
                let H_ridge_rel = (ridge_axis === 'Z') ? (w / 2) * slope : (d / 2) * slope;
                let drop = e_px * slope; 
                
                const ry_top = H_ridge_rel + t;
                const ey_top = -drop + t;
                const ey_bot = -drop;
                const ry_bot = H_ridge_rel;
                
                const ex = w / 2 + e_px;
                const ez = d / 2 + e_px;
                
                let rZ = 0, rX = 0;
                if (ridge_axis === 'Z') { rZ = (d - w) / 2; } else { rX = (w - d) / 2; }
                
                const p_1 = (ridge_axis === 'Z') ? [0, ry_top, rZ] : [rX, ry_top, 0];
                const p_2 = (ridge_axis === 'Z') ? [0, ry_top, -rZ] : [-rX, ry_top, 0];
                const pb_1 = (ridge_axis === 'Z') ? [0, ry_bot, rZ] : [rX, ry_bot, 0];
                const pb_2 = (ridge_axis === 'Z') ? [0, ry_bot, -rZ] : [-rX, ry_bot, 0];
                
                const vertices = new Float32Array([
                    p_1[0], ry_top, p_1[2], p_2[0], ry_top, p_2[2],
                    ex, ey_top, ez,  -ex, ey_top, ez,  ex, ey_top, -ez,  -ex, ey_top, -ez,
                    pb_1[0], ry_bot, pb_1[2], pb_2[0], ry_bot, pb_2[2],
                    ex, ey_bot, ez,  -ex, ey_bot, ez,  ex, ey_bot, -ez,  -ex, ey_bot, -ez
                ]);
                const indices = [
                    0,3,2, 1,4,5, 0,2,4, 0,4,1, 0,1,5, 0,5,3, 
                    6,8,9, 7,11,10, 6,7,10, 6,10,8, 6,9,11, 6,11,7,
                    2,3,9, 2,9,8, 4,10,11, 4,11,5, 2,8,10, 2,10,4, 3,5,11, 3,11,9
                ];
                if (ridge_axis !== 'Z') {
                    indices.length = 0;
                    indices.push(0,2,4, 1,5,3, 0,1,3, 0,3,2, 0,4,5, 0,5,1);
                    indices.push(6,10,8, 7,9,11, 6,8,9, 6,9,7, 6,7,11, 6,11,10);
                    indices.push(2,3,9, 2,9,8, 4,10,11, 4,11,5, 2,8,10, 2,10,4, 3,5,11, 3,11,9);
                }
                
                const rGeo = new THREE.BufferGeometry();
                rGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                rGeo.setIndex(indices);
                rGeo.computeVertexNormals();
                
                const rMesh = new THREE.Mesh(rGeo, roofMat);
                const rLine = new THREE.LineSegments(new THREE.EdgesGeometry(rGeo), edgeMat);
                roofGroup.add(rMesh, rLine);
            }
            
            // タグ付け (プッシュプルのための isRoof を付与)
            roofGroup.traverse(child => {
                if (child.isMesh) {
                    child.userData = { id: b.id, isRoof: true };
                }
            });
            group.add(roofGroup);
        }
        return group;
    }
};