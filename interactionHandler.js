// interactionHandler.js
import * as THREE from 'three';
import { AppState } from './appState.js';
import { UIController } from './uiController.js';

let camera, scene, controls, hoverMesh, activeMat;
let getInteractiveMeshes = () => [];
let rebuildMeshes = () => {};
let saveState = () => {};

let currentTool = null;
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let activePlane = new THREE.Plane(); 
const raycaster = new THREE.Raycaster();

let isDrawing = false;
const drawStartPt = new THREE.Vector3();
let currentDrawObj = null; 

let isExtruding = false;
let extrudeTargetId = null;
const extrudeNormal = new THREE.Vector3();
let connectedBlocks = []; 
const extrudeStartPt = new THREE.Vector3(); 

const downPointer = new THREE.Vector2(); 
const tooltip = document.getElementById('tooltip');

let currentSnap = 500; // 現在のスナップ量
function snap(val) { return Math.round(val / currentSnap) * currentSnap; }

function getMainPointer(e) {
    const subW = (window.innerHeight / 4) * 1.5;
    const mainW = window.innerWidth - subW;
    if (e.clientX < subW) return null;
    const x = ((e.clientX - subW) / mainW) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    return { x, y };
}

function getGroundIntersect(e) {
    const p = getMainPointer(e);
    if (!p) return null;
    pointer.x = p.x;
    pointer.y = p.y;
    raycaster.setFromCamera(pointer, camera);
    const target = new THREE.Vector3();
    
    const intersect = raycaster.ray.intersectPlane(groundPlane, target);
    if(intersect) {
        target.x = snap(target.x);
        target.z = snap(target.z);
        return target;
    }
    return null;
}

function updateHoverMesh(b, normal) {
    const baseY = b.y || 0;
    if (normal.y > 0.5) { 
        hoverMesh.scale.set(b.w, b.d, 1);
        hoverMesh.rotation.set(-Math.PI/2, 0, 0);
        hoverMesh.position.set(b.x, baseY + b.h + 2, b.z);
    } else if (normal.x > 0.5) { 
        hoverMesh.scale.set(b.d, b.h, 1);
        hoverMesh.rotation.set(0, Math.PI/2, 0);
        hoverMesh.position.set(b.x + b.w/2 + 2, baseY + b.h/2, b.z);
    } else if (normal.x < -0.5) { 
        hoverMesh.scale.set(b.d, b.h, 1);
        hoverMesh.rotation.set(0, -Math.PI/2, 0);
        hoverMesh.position.set(b.x - b.w/2 - 2, baseY + b.h/2, b.z);
    } else if (normal.z > 0.5) { 
        hoverMesh.scale.set(b.w, b.h, 1);
        hoverMesh.rotation.set(0, 0, 0);
        hoverMesh.position.set(b.x, baseY + b.h/2, b.z + b.d/2 + 2);
    } else if (normal.z < -0.5) { 
        hoverMesh.scale.set(b.w, b.h, 1);
        hoverMesh.rotation.set(0, Math.PI, 0);
        hoverMesh.position.set(b.x, baseY + b.h/2, b.z - b.d/2 - 2);
    }
    hoverMesh.visible = true;
}

export const InteractionHandler = {
    init(params) {
        camera = params.camera;
        scene = params.scene;
        controls = params.controls;
        getInteractiveMeshes = params.getInteractiveMeshes;
        hoverMesh = params.hoverMesh;
        activeMat = params.activeMat;
        rebuildMeshes = params.rebuildMeshes;
        saveState = params.saveState;

        this.setupEventListeners();
        
        // HTMLツールバーボタンから呼べるようグローバル化
        window.setTool = (toolName) => this.setTool(toolName);
        // スナップ切り替え関数
        window.toggleSnap = () => {
            currentSnap = currentSnap === 500 ? 100 : 500;
            const btn = document.getElementById('btn-snap-toggle');
            if (btn) btn.innerText = `📏 スナップ: ${currentSnap}mm`;
        };
    },

    getCurrentTool() {
        return currentTool;
    },

    setTool(toolName) {
        currentTool = toolName;

        // ★追加：ツールを切り替えた時に、作図中の仮平面があれば強制的に消去する
        if (currentDrawObj) {
            scene.remove(currentDrawObj.mesh, currentDrawObj.line);
            if (currentDrawObj.mesh.geometry) currentDrawObj.mesh.geometry.dispose();
            currentDrawObj = null;
            isDrawing = false;
        }

        const btnDraw = document.getElementById('btn-draw');
        const btnExtrude = document.getElementById('btn-extrude');
        const modeText = document.getElementById('mode-text');
        const modeDesc = document.getElementById('mode-desc');

        if (btnDraw) btnDraw.classList.toggle('active', toolName === 'DRAW');
        if (btnExtrude) btnExtrude.classList.toggle('active', toolName === 'EXTRUDE');

        if (tooltip) tooltip.style.display = 'none';
        hoverMesh.visible = false;
        document.body.style.cursor = 'default';           
        if (toolName !== 'EXTRUDE') {
            AppState.selectedId = null;
            AppState.selectedFaceDir = null;
        }
        rebuildMeshes();

        UIController.hideFloatingMenu(); 
        UIController.updateStatusDisplay(currentTool); 
    },

    setupEventListeners() {
        window.addEventListener('pointerdown', (e) => {
            if (e.target.closest('#floating-menu')) return;
            if (document.getElementById('cesium-overlay').style.display === 'block') return;

            UIController.hideFloatingMenu();
            if (e.button !== 0) return; 
            if (e.target.tagName !== 'CANVAS') return; 

            downPointer.set(e.clientX, e.clientY);

            const p = getMainPointer(e);
            if (!p) return; 
            pointer.x = p.x;
            pointer.y = p.y;
            raycaster.setFromCamera(pointer, camera);

            if (currentTool === 'DRAW') {
                const pt = getGroundIntersect(e);
                if (!pt) return;
                isDrawing = true;
                drawStartPt.copy(pt);
                controls.enabled = false;

            } else if (currentTool === 'EXTRUDE') {
                const interactiveMeshes = getInteractiveMeshes();
                const intersects = raycaster.intersectObjects(interactiveMeshes);
                if (intersects.length > 0) {
                    const hit = intersects[0];
                    const hitId = hit.object.userData.id;

                    if (!AppState.selectedId || AppState.selectedId !== hitId) return;

                    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
                    
                    let hitFaceDir = null;
                    if (hit.object.userData.isRoof || normal.y > 0.5) hitFaceDir = 'top';
                    else if (normal.y < -0.5) hitFaceDir = 'bottom';
                    else if (normal.z > 0.5) hitFaceDir = 'pz';
                    else if (normal.z < -0.5) hitFaceDir = 'nz';
                    else if (normal.x > 0.5) hitFaceDir = 'px';
                    else if (normal.x < -0.5) hitFaceDir = 'nx';

                    if (!AppState.selectedFaceDir || AppState.selectedFaceDir !== hitFaceDir) return;

                    const baseBlock = AppState.buildingData.find(d => d.id === hitId);

                    extrudeNormal.set(0,0,0);
                    if (hitFaceDir === 'top') extrudeNormal.set(0,1,0); 
                    else if (hitFaceDir === 'bottom') return; 
                    else if (hitFaceDir === 'px') extrudeNormal.set(1,0,0); 
                    else if (hitFaceDir === 'nx') extrudeNormal.set(-1,0,0); 
                    else if (hitFaceDir === 'pz') extrudeNormal.set(0,0,1); 
                    else if (hitFaceDir === 'nz') extrudeNormal.set(0,0,-1); 
                    else return;

                    isExtruding = true;
                    connectedBlocks = [];

                    const camDir = camera.getWorldDirection(new THREE.Vector3()).negate();
                    const axis = extrudeNormal.clone();
                    
                    const cross1 = new THREE.Vector3().crossVectors(axis, camDir);
                    let planeNormal = new THREE.Vector3().crossVectors(cross1, axis).normalize();
                    
                    if (planeNormal.lengthSq() < 0.001) {
                        planeNormal = axis.y === 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
                    }
                    
                    activePlane.setFromNormalAndCoplanarPoint(planeNormal, hit.point);
                    extrudeStartPt.copy(hit.point);

                    if (extrudeNormal.y > 0) {
                        if (e.shiftKey) {
                            const newY = (baseBlock.y || 0) + baseBlock.h;
                            const newBlock = {
                                id: Date.now().toString(),
                                x: baseBlock.x, y: newY, z: baseBlock.z,
                                w: baseBlock.w, d: baseBlock.d, h: 500 
                            };
                            AppState.buildingData.push(newBlock);
                            extrudeTargetId = newBlock.id;
                            connectedBlocks.push({ block: newBlock, startBox: { ...newBlock }, type: 'resize' });
                            
                            rebuildMeshes(); 
                            window.setMeshActiveMaterial?.(newBlock.id);
                        } else {
                            extrudeTargetId = hitId;
                            const stackedBlocks = AppState.getStackedBlocks([baseBlock]);
                            
                            stackedBlocks.forEach(ob => {
                                if (ob.id === baseBlock.id) {
                                    connectedBlocks.push({ block: ob, startBox: { ...ob }, type: 'resize' });
                                } else {
                                    connectedBlocks.push({ block: ob, startBox: { ...ob }, type: 'translate' });
                                }
                            });
                            rebuildMeshes();
                            connectedBlocks.forEach(cb => window.setMeshActiveMaterial?.(cb.block.id));
                        }
                    } 
                    else {
                        if (e.shiftKey) {
                            const newBlock = {
                                id: Date.now().toString(),
                                x: baseBlock.x, y: baseBlock.y || 0, z: baseBlock.z,
                                w: baseBlock.w, d: baseBlock.d, h: baseBlock.h 
                            };
                            if (extrudeNormal.x !== 0) {
                                newBlock.w = 500;
                                newBlock.x = baseBlock.x + (baseBlock.w / 2 + 250) * extrudeNormal.x;
                            } else if (extrudeNormal.z !== 0) {
                                newBlock.d = 500;
                                newBlock.z = baseBlock.z + (baseBlock.d / 2 + 250) * extrudeNormal.z;
                            }
                            AppState.buildingData.push(newBlock);
                            extrudeTargetId = newBlock.id;
                            connectedBlocks.push({ block: newBlock, startBox: { ...newBlock }, type: 'resize', normal: extrudeNormal.clone() });
                            
                            rebuildMeshes(); 
                            window.setMeshActiveMaterial?.(newBlock.id);
                        } else {
                            extrudeTargetId = hitId;
                            
                            AppState.buildingData.forEach(ob => {
                                if (ob.id === baseBlock.id) return;
                                
                                let isTouchingOpposite = false;
                                if (extrudeNormal.x !== 0) {
                                    const targetEdge = baseBlock.x + (baseBlock.w/2) * extrudeNormal.x;
                                    const obOppositeEdge = ob.x - (ob.w/2) * extrudeNormal.x; 
                                    
                                    if (Math.abs(obOppositeEdge - targetEdge) < 1) { 
                                        const overlapZ = Math.abs(ob.z - baseBlock.z) * 2 < (ob.d + baseBlock.d) - 1;
                                        const overlapY = Math.max((ob.y||0), (baseBlock.y||0)) < Math.min((ob.y||0)+ob.h, (baseBlock.y||0)+baseBlock.h) - 1;
                                        if (overlapZ && overlapY) isTouchingOpposite = true;
                                    }
                                } else if (extrudeNormal.z !== 0) {
                                    const targetEdge = baseBlock.z + (baseBlock.d/2) * extrudeNormal.z;
                                    const obOppositeEdge = ob.z - (ob.d/2) * extrudeNormal.z;
                                    
                                    if (Math.abs(obOppositeEdge - targetEdge) < 1) { 
                                        const overlapX = Math.abs(ob.x - baseBlock.x) * 2 < (ob.w + baseBlock.w) - 1;
                                        const overlapY = Math.max((ob.y||0), (baseBlock.y||0)) < Math.min((ob.y||0)+ob.h, (baseBlock.y||0)+baseBlock.h) - 1;
                                        if (overlapX && overlapY) isTouchingOpposite = true;
                                    }
                                }
                                
                                if (isTouchingOpposite) {
                                    connectedBlocks.push({ block: ob, startBox: { ...ob }, type: 'resize', normal: extrudeNormal.clone().negate() });
                                }
                            });
                            connectedBlocks.push({ block: baseBlock, startBox: { ...baseBlock }, type: 'resize', normal: extrudeNormal.clone() });
                            
                            rebuildMeshes();
                            connectedBlocks.forEach(cb => window.setMeshActiveMaterial?.(cb.block.id));
                        }
                    }
                    controls.enabled = false;
                }
            }
        });

        window.addEventListener('pointermove', (e) => {
            if (document.getElementById('cesium-overlay').style.display === 'block') return;

            const p = getMainPointer(e);
            if (!p) {
                document.body.style.cursor = 'default';
                return; 
            }
            pointer.x = p.x;
            pointer.y = p.y;

            if (isDrawing) {
                const pt = getGroundIntersect(e);
                if (!pt) return;

                const w = Math.abs(pt.x - drawStartPt.x);
                const d = Math.abs(pt.z - drawStartPt.z);
                const cx = (pt.x + drawStartPt.x) / 2;
                const cz = (pt.z + drawStartPt.z) / 2;
                const h = 100; 

                if (currentDrawObj) {
                    scene.remove(currentDrawObj.mesh, currentDrawObj.line);
                    currentDrawObj.mesh.geometry.dispose();
                }

                if (w > 0 && d > 0) {
                    const geo = new THREE.BoxGeometry(w, h, d);
                    const mesh = new THREE.Mesh(geo, activeMat);
                    mesh.position.set(cx, h / 2, cz);
                    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), window.getEdgeMat?.() || activeMat);
                    line.position.copy(mesh.position);
                    scene.add(mesh, line);
                    currentDrawObj = { mesh, line, x: cx, z: cz, w: w, d: d, h: h };
                    
                    if (tooltip) {
                        tooltip.style.display = 'block';
                        tooltip.style.left = (e.clientX + 15) + 'px';
                        tooltip.style.top = (e.clientY + 15) + 'px';
                        tooltip.innerText = `間口: ${(w / 1000).toFixed(1)} m\n奥行: ${(d / 1000).toFixed(1)} m`;
                    }
                } else {
                    if (tooltip) tooltip.style.display = 'none';
                }
                window.renderAllViews?.();

            } else if (isExtruding) {
                let tooltipText = "";

                raycaster.setFromCamera(pointer, camera);
                const target = new THREE.Vector3();              
                const intersect = raycaster.ray.intersectPlane(activePlane, target);

                if (intersect) {
                    if (extrudeNormal.y > 0) {
                        const deltaY = target.y - extrudeStartPt.y; 
                        const mainCb = connectedBlocks.find(cb => cb.type === 'resize');
                        
                        let newH = snap(mainCb.startBox.h + deltaY);
                        if (newH < 500) newH = 500;
                        
                        const actualDeltaY = newH - mainCb.startBox.h;

                        connectedBlocks.forEach(cb => {
                            if (cb.type === 'resize') {
                                cb.block.h = newH;
                            } else if (cb.type === 'translate') {
                                cb.block.y = cb.startBox.y + actualDeltaY;
                            }
                        });
                        tooltipText = `階高: ${(newH / 1000).toFixed(1)} m`;

                    } else if (extrudeNormal.x !== 0) {
                        const deltaX = target.x - extrudeStartPt.x;
                        let validDeltaX = Math.round(deltaX / currentSnap) * currentSnap;
                        let minDeltaX = -Infinity;
                        let maxDeltaX = Infinity;

                        for (let cb of connectedBlocks) {
                            if (cb.type !== 'resize') continue;
                            const startMovingEdge = cb.startBox.x + (cb.startBox.w/2) * cb.normal.x;
                            const fixedEdge = cb.startBox.x - (cb.startBox.w/2) * cb.normal.x;

                            if (cb.normal.x > 0) {
                                const limit = fixedEdge + 100 - startMovingEdge;
                                if (limit > minDeltaX) minDeltaX = limit;
                            } else if (cb.normal.x < 0) {
                                const limit = fixedEdge - 100 - startMovingEdge;
                                if (limit < maxDeltaX) maxDeltaX = limit;
                            }
                        }

                        if (validDeltaX < minDeltaX) validDeltaX = minDeltaX;
                        if (validDeltaX > maxDeltaX) validDeltaX = maxDeltaX;

                        connectedBlocks.forEach(cb => {
                            if (cb.type !== 'resize') return;
                            const startMovingEdge = cb.startBox.x + (cb.startBox.w/2) * cb.normal.x;
                            const fixedEdge = cb.startBox.x - (cb.startBox.w/2) * cb.normal.x;
                            const movingEdge = startMovingEdge + validDeltaX;
                            
                            cb.block.w = Math.abs(movingEdge - fixedEdge);
                            cb.block.x = (movingEdge + fixedEdge) / 2;
                            if (cb.block.id === extrudeTargetId) tooltipText = `間口: ${(cb.block.w / 1000).toFixed(2)} m`; 
                        });

                    } else if (extrudeNormal.z !== 0) {
                        const deltaZ = target.z - extrudeStartPt.z;
                        let validDeltaZ = Math.round(deltaZ / currentSnap) * currentSnap; // ★変更
                        let minDeltaZ = -Infinity;
                        let maxDeltaZ = Infinity;

                        for (let cb of connectedBlocks) {
                            if (cb.type !== 'resize') continue;
                            const startMovingEdge = cb.startBox.z + (cb.startBox.d/2) * cb.normal.z;
                            const fixedEdge = cb.startBox.z - (cb.startBox.d/2) * cb.normal.z;

                            if (cb.normal.z > 0) {
                                const limit = fixedEdge + 100 - startMovingEdge;
                                if (limit > minDeltaZ) minDeltaZ = limit;
                            } else if (cb.normal.z < 0) {
                                const limit = fixedEdge - 100 - startMovingEdge;
                                if (limit < maxDeltaZ) maxDeltaZ = limit;
                            }
                        }

                        if (validDeltaZ < minDeltaZ) validDeltaZ = minDeltaZ;
                        if (validDeltaZ > maxDeltaZ) validDeltaZ = maxDeltaZ;

                        connectedBlocks.forEach(cb => {
                            if (cb.type !== 'resize') return;
                            const startMovingEdge = cb.startBox.z + (cb.startBox.d/2) * cb.normal.z;
                            const fixedEdge = cb.startBox.z - (cb.startBox.d/2) * cb.normal.z;
                            const movingEdge = startMovingEdge + validDeltaZ;
                            
                            cb.block.d = Math.abs(movingEdge - fixedEdge);
                            cb.block.z = (movingEdge + fixedEdge) / 2;
                            if (cb.block.id === extrudeTargetId) tooltipText = `奥行: ${(cb.block.d / 1000).toFixed(2)} m`; 
                        });
                    }
                }
                
                AppState.updateAllLowerRoofs(); 
                rebuildMeshes(); 
                connectedBlocks.forEach(cb => window.setMeshActiveMaterial?.(cb.block.id));
                
                const mainB = AppState.buildingData.find(d => d.id === extrudeTargetId);
                if (mainB) updateHoverMesh(mainB, extrudeNormal);
                
                if (tooltip) {
                    tooltip.style.display = 'block';
                    tooltip.style.left = (e.clientX + 15) + 'px';
                    tooltip.style.top = (e.clientY + 15) + 'px';
                    tooltip.innerText = tooltipText;
                }

            } else if (currentTool === 'EXTRUDE' && !isExtruding) {
                raycaster.setFromCamera(pointer, camera);
                const interactiveMeshes = getInteractiveMeshes();
                const intersects = raycaster.intersectObjects(interactiveMeshes);
                
                let isHoverValid = false; 

                if (intersects.length > 0) {
                    const hit = intersects[0];
                    const hitId = hit.object.userData.id;
                    
                    if (AppState.selectedId && AppState.selectedId === hitId) {
                        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
                        
                        let hitFaceDir = null;
                        if (hit.object.userData.isRoof || normal.y > 0.5) hitFaceDir = 'top';
                        else if (normal.y < -0.5) hitFaceDir = 'bottom';
                        else if (normal.z > 0.5) hitFaceDir = 'pz';
                        else if (normal.z < -0.5) hitFaceDir = 'nz';
                        else if (normal.x > 0.5) hitFaceDir = 'px';
                        else if (normal.x < -0.5) hitFaceDir = 'nx';

                        if (AppState.selectedFaceDir && AppState.selectedFaceDir === hitFaceDir) {
                            isHoverValid = true;
                            const b = AppState.buildingData.find(d => d.id === hitId);
                            if (b) {
                                let nDir = new THREE.Vector3();
                                if (hitFaceDir === 'top') nDir.set(0,1,0);
                                else if (hitFaceDir === 'bottom') nDir.set(0,-1,0);
                                else if (hitFaceDir === 'px') nDir.set(1,0,0);
                                else if (hitFaceDir === 'nx') nDir.set(-1,0,0);
                                else if (hitFaceDir === 'pz') nDir.set(0,0,1);
                                else if (hitFaceDir === 'nz') nDir.set(0,0,-1);

                                if (nDir.y > 0) {
                                    if (b.roof) {
                                        hoverMesh.visible = false; 
                                    } else {
                                        updateHoverMesh(b, nDir);  
                                    }
                                    document.body.style.cursor = e.shiftKey ? 'copy' : 'ns-resize'; 
                                } else if (nDir.x !== 0) {
                                    updateHoverMesh(b, nDir);
                                    document.body.style.cursor = e.shiftKey ? 'copy' : 'ew-resize';
                                } else if (nDir.z !== 0) {
                                    updateHoverMesh(b, nDir);
                                    document.body.style.cursor = e.shiftKey ? 'copy' : 'ns-resize'; 
                                }
                            }
                        }
                    }
                }

                if (!isHoverValid) {
                    hoverMesh.visible = false;
                    document.body.style.cursor = 'default';
                }
                window.renderAllViews?.();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (currentTool === 'EXTRUDE' && !isExtruding && hoverMesh.visible && e.key === 'Shift') {
                document.body.style.cursor = 'copy'; 
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedId !== null) {
                AppState.buildingData = AppState.buildingData.filter(b => b.id !== AppState.selectedId);
                AppState.selectedId = null;
                saveState(); 
                rebuildMeshes();
                UIController.hideFloatingMenu();    
                UIController.updateStatusDisplay(currentTool); 
            }
        });

        window.addEventListener('keyup', (e) => {
            if (currentTool === 'EXTRUDE' && !isExtruding && e.key === 'Shift' && hoverMesh.visible) {
                if (hoverMesh.rotation.x === -Math.PI/2) document.body.style.cursor = 'ns-resize'; 
                else if (hoverMesh.rotation.y === Math.PI/2 || hoverMesh.rotation.y === -Math.PI/2) document.body.style.cursor = 'ew-resize';
                else document.body.style.cursor = 'ns-resize';
            }
        });

        window.addEventListener('pointerup', (e) => {
            if (document.getElementById('cesium-overlay').style.display === 'block') return;

            const upPointer = new THREE.Vector2(e.clientX, e.clientY);
            const isClick = downPointer.distanceTo(upPointer) < 5; 

            if (isClick && e.target.tagName === 'CANVAS') {
                if (currentTool === null) {
                    const p = getMainPointer(e);
                    if (!p) return;
                    pointer.x = p.x;
                    pointer.y = p.y;
                    raycaster.setFromCamera(pointer, camera);
                    
                    const houseGroup = window.getHouseGroup?.() || scene;
                    const intersects = raycaster.intersectObject(houseGroup, true);

                    if (intersects.length > 0) {
                        const hit = intersects[0];
                        const hitId = hit.object.userData.id;
                        const targetBlock = AppState.buildingData.find(d => d.id === hitId);

                        if (targetBlock && targetBlock.h >= 100) {
                            AppState.selectedId = hitId;
                            
                            let faceType = null;
                            let faceDir = null;
                            let clickedDecoType = null;

                            if (hit.object.userData.isRoof) {
                                faceType = 'top';
                                AppState.selectedFaceDir = 'top';
                            } else if (hit.object.userData.isDeco) {
                                clickedDecoType = hit.object.userData.type; 
                                
                                if (clickedDecoType === 'lowerRoof') {
                                    faceType = 'top';
                                    AppState.selectedFaceDir = 'top';
                                } else {
                                    faceType = 'side';
                                    faceDir = hit.object.userData.dir;
                                    
                                    if (!faceDir && hit.point) {
                                        const dx = hit.point.x - targetBlock.x;
                                        const dz = hit.point.z - targetBlock.z;
                                        if (Math.abs(dz) / targetBlock.d > Math.abs(dx) / targetBlock.w) {
                                            faceDir = dz > 0 ? 'pz' : 'nz';
                                        } else {
                                            faceDir = dx > 0 ? 'px' : 'nx';
                                        }
                                    }
                                    AppState.selectedFaceDir = faceDir;
                                }
                            } else {
                                const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
                                if (normal.y > 0.5) { faceType = 'top'; AppState.selectedFaceDir = 'top'; }
                                else if (normal.y < -0.5) { faceType = 'bottom'; AppState.selectedFaceDir = 'bottom'; }
                                else {
                                    faceType = 'side';
                                    if (normal.z > 0.5) faceDir = 'pz';
                                    else if (normal.z < -0.5) faceDir = 'nz';
                                    else if (normal.x > 0.5) faceDir = 'px';
                                    else if (normal.x < -0.5) faceDir = 'nx';
                                    AppState.selectedFaceDir = faceDir;
                                }
                            }

                            UIController.showFloatingMenu(e.clientX, e.clientY, targetBlock, faceType, faceDir);

                            if (faceType === 'top') {
                                if (targetBlock.roof) UIController.updateGUI(targetBlock, 'roof');
                                else if (targetBlock.lowerRoof) UIController.updateGUI(targetBlock, 'lowerRoof');
                                else UIController.clearGUI();
                            } else if (faceType === 'side') {
                                if (clickedDecoType) {
                                    if (clickedDecoType === 'visor' || clickedDecoType === 'flatVisor') {
                                        UIController.updateGUI(targetBlock, 'side', faceDir);
                                    } else {
                                        UIController.updateGUI(targetBlock, clickedDecoType, faceDir);
                                    }
                                }
                                else if (targetBlock.balconies && targetBlock.balconies[faceDir]) {
                                    UIController.updateGUI(targetBlock, 'balcony', faceDir);
                                } else if (targetBlock.pilasters && targetBlock.pilasters[faceDir]) { 
                                    UIController.updateGUI(targetBlock, 'pilaster', faceDir);
                                } else if (targetBlock.windows && targetBlock.windows[faceDir]) {
                                    UIController.updateGUI(targetBlock, 'window', faceDir);
                                } else if (targetBlock.doors && targetBlock.doors[faceDir]) {
                                    UIController.updateGUI(targetBlock, 'door', faceDir);
                                } else {
                                    UIController.updateGUI(targetBlock, 'side', faceDir);
                                }
                            } else {
                                UIController.clearGUI();
                            }
                        } else {
                            AppState.selectedId = null; AppState.selectedFaceDir = null; UIController.hideFloatingMenu(); UIController.clearGUI(); 
                        }
                    } else {
                        AppState.selectedId = null; AppState.selectedFaceDir = null; UIController.hideFloatingMenu(); UIController.clearGUI(); 
                    }
                    
                    rebuildMeshes();
                    UIController.updateStatusDisplay(currentTool);
                }
                else {
                    if (!isDrawing && !isExtruding) {
                        this.setTool(null); 
                    }
                }
            }

            if (isDrawing) {
                isDrawing = false;
                controls.enabled = true;
                if (tooltip) tooltip.style.display = 'none'; 
                
                if (currentDrawObj && currentDrawObj.w > 0 && currentDrawObj.d > 0) {
                    AppState.buildingData.push({
                        id: Date.now().toString(),
                        x: currentDrawObj.x,
                        y: 0, 
                        z: currentDrawObj.z,
                        w: currentDrawObj.w,
                        d: currentDrawObj.d,
                        h: currentDrawObj.h
                    });
                    saveState(); 
                }

                // ==========================================
                // ★追加：作図が終わったら、一時的な平面（ゴースト）をシーンから完全に消去する
                if (currentDrawObj) {
                    scene.remove(currentDrawObj.mesh, currentDrawObj.line);
                    if (currentDrawObj.mesh.geometry) currentDrawObj.mesh.geometry.dispose();
                }
                // ==========================================

                currentDrawObj = null;
                rebuildMeshes();
                this.setTool(null); 
            }

            if (isExtruding) {
                isExtruding = false;
                controls.enabled = true;
                if (tooltip) tooltip.style.display = 'none'; 
                hoverMesh.visible = false;   
                document.body.style.cursor = 'default';

                extrudeTargetId = null;
                connectedBlocks = [];
                saveState(); 
                rebuildMeshes();
                this.setTool(null); 

                const currentGUI = window.currentGUI; 
                if (currentGUI && AppState.selectedId) {
                    const b = AppState.buildingData.find(d => d.id === AppState.selectedId);
                    if (currentGUI._title.includes('つけ柱')) {
                        UIController.updateGUI(b, 'pilaster', AppState.selectedFaceDir);
                    } else if (currentGUI._title.includes('バルコニー')) {
                        UIController.updateGUI(b, 'balcony', AppState.selectedFaceDir);
                    }
                }
            }
        });
    }
};