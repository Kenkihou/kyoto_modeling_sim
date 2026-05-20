// main.js
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { initCesium, placeModelOnEarth, manualSnapToGround, focusOnModel } from './cesiumApp.js';
import { openMapModal } from './mapApp.js'; 
import { ModelingEngine } from './modelingEngine.js';
import { AppState } from './appState.js';
import { UIController } from './uiController.js';
import { InteractionHandler } from './interactionHandler.js';
import { ViewManager } from './viewManager.js';
import { AppInit } from './init.js';

// --- UI・操作状態（画面固有のもの） ---
let interactiveMeshes = []; 
let meshMap = {}; 

// ==========================================
// 1. 環境の初期セットアップ (init.jsへ委譲)
// ==========================================
const { scene, camera, renderer, controls, materials, hoverMesh, houseGroup } = AppInit.run();
const { wallMat, activeMat, selectedMat, roofMat, edgeMat } = materials;

// ==========================================
// 2. UI・履歴・ステータスの連携
// ==========================================
function saveState() {
    AppState.saveState();
    UIController.updateActionButtons();
}

function undo() {
    if (AppState.undo()) {
        UIController.clearGUI();
        rebuildMeshes();
        UIController.updateActionButtons();
        UIController.updateStatusDisplay(InteractionHandler.getCurrentTool());
    }
}

function redo() {
    if (AppState.redo()) {
        UIController.clearGUI();
        rebuildMeshes();
        UIController.updateActionButtons();
        UIController.updateStatusDisplay(InteractionHandler.getCurrentTool());
    }
}

function rebuildMeshes() {
    while(houseGroup.children.length > 0){ 
        const child = houseGroup.children[0];
        houseGroup.remove(child); 
        
        child.traverse((obj) => {
            if (obj.geometry) {
                obj.geometry.dispose();
            }
        });
    }
    meshMap = {};
    interactiveMeshes = [];

    AppState.buildingData.forEach(b => {
        const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
        
        const mats = [wallMat, wallMat, wallMat, wallMat, wallMat, wallMat];
        if (b.id === AppState.selectedId && AppState.selectedFaceDir) {
            const fmap = { 'px':0, 'nx':1, 'top':2, 'bottom':3, 'pz':4, 'nz':5 };
            const idx = fmap[AppState.selectedFaceDir];
            if (idx !== undefined) mats[idx] = selectedMat;
        }
        
        const mesh = new THREE.Mesh(geo, mats);
        const baseY = b.y || 0;
        mesh.position.set(b.x, baseY + b.h / 2, b.z);
        mesh.userData.id = b.id; 

        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, edgeMat);
        line.position.copy(mesh.position);

        houseGroup.add(mesh, line);
        interactiveMeshes.push(mesh); 
        meshMap[b.id] = { mesh, line };

        if (baseY === 0 && b.h > 100) {
            const kisoY = 100;
            const pts = [
                new THREE.Vector3(-b.w/2, kisoY, b.d/2),
                new THREE.Vector3(b.w/2, kisoY, b.d/2),
                new THREE.Vector3(b.w/2, kisoY, -b.d/2),
                new THREE.Vector3(-b.w/2, kisoY, -b.d/2),
                new THREE.Vector3(-b.w/2, kisoY, b.d/2)
            ];
            const kisoGeo = new THREE.BufferGeometry().setFromPoints(pts);
            const kisoLine = new THREE.Line(kisoGeo, edgeMat);
            kisoLine.position.set(b.x, baseY, b.z);
            kisoLine.userData = { id: b.id };
            houseGroup.add(kisoLine);
        }

        const roofMaterials = { wallMat: wallMat, roofMat: roofMat, edgeMat: edgeMat };
        const roofsGroup = ModelingEngine.buildRoofs(b, baseY, AppState.buildingData, roofMaterials);
        
        roofsGroup.traverse(child => {
            if (child.isMesh && child.userData.isRoof) {
                interactiveMeshes.push(child);
            }
        });
        houseGroup.add(roofsGroup);

        const visorMaterials = { roofMat: roofMat, wallMat: wallMat, edgeMat: edgeMat };
        const visorsGroup = ModelingEngine.buildVisorsAndSkirts(b, baseY, visorMaterials);
        houseGroup.add(visorsGroup);

        const balcMaterials = { roofMat: roofMat, edgeMat: edgeMat };
        const balconiesGroup = ModelingEngine.buildBalconies(b, baseY, balcMaterials);
        houseGroup.add(balconiesGroup);

        const pilasterMaterials = { edgeMat: edgeMat };
        const pilastersGroup = ModelingEngine.buildPilasters(b, baseY, pilasterMaterials);
        houseGroup.add(pilastersGroup);

        const windowMaterials = { edgeMat: edgeMat };
        const windowsGroup = ModelingEngine.buildWindows(b, baseY, windowMaterials);
        houseGroup.add(windowsGroup);

        const doorMaterials = { edgeMat: edgeMat };
        const doorsGroup = ModelingEngine.buildDoors(b, baseY, doorMaterials);
        houseGroup.add(doorsGroup);
    });

    if (window.renderAllViews) window.renderAllViews();
}

// 履歴初期保存
AppState.saveState();

// ==========================================
// 3. インタラクションブリッジ ＆ ハンドラー初期化
// ==========================================
window.setMeshActiveMaterial = function(id) {
    if (meshMap[id]) meshMap[id].mesh.material = activeMat;
};
window.getHouseGroup = function() { return houseGroup; };
window.getEdgeMat = function() { return edgeMat; };

// ViewManagerの初期化
ViewManager.init({ scene, camera, renderer, houseGroup });
window.renderAllViews = () => ViewManager.renderAllViews();

// InteractionHandlerの初期化
InteractionHandler.init({
    camera, scene, controls, hoverMesh, activeMat, rebuildMeshes, saveState,
    getInteractiveMeshes: () => interactiveMeshes
});

// コントロール・リサイズイベントのバインド
controls.addEventListener('change', () => {
    if (window.renderAllViews) window.renderAllViews();
});

window.addEventListener('resize', () => {
    const subW = (window.innerHeight / 4) * 1.5;
    const mainW = window.innerWidth - subW;
    camera.aspect = mainW / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (window.renderAllViews) window.renderAllViews();
});        

// ツールバーボタン（HTML）用グローバルバインド
window.undo = undo;
window.redo = redo;

window.clearAll = function() {
    if(confirm('すべてのオブジェクトを消去しますか？')) {
        AppState.clearAll();
        window.setTool(null);
        rebuildMeshes();
        UIController.hideFloatingMenu(); 
        UIController.updateStatusDisplay(InteractionHandler.getCurrentTool());
        UIController.updateActionButtons();
    }
};

// ==========================================
// 4. エクスポート ＆ Cesium連携フロー
// ==========================================
window.lastPlacedLocation = { lat: 34.9858, lng: 135.7588 };

document.getElementById('btn-export-cesium').addEventListener('click', () => {
    if (houseGroup.children.length === 0) {
        return alert('配置する建物がありません。');
    }
    UIController.clearGUI();
    UIController.hideFloatingMenu();
    controls.enabled = false;

    openMapModal(window.lastPlacedLocation, 
        (selectedLocation) => {
            window.lastPlacedLocation = selectedLocation;
            const exporter = new GLTFExporter();
            exporter.parse(houseGroup, (gltf) => {
                const blob = new Blob([JSON.stringify(gltf)], { type: 'application/json' });
                const glbUrl = URL.createObjectURL(blob);

                document.getElementById('cesium-overlay').style.display = 'block';
                const myCesiumToken = import.meta.env.VITE_CESIUM_TOKEN;
                initCesium('cesiumContainer', myCesiumToken, selectedLocation).then(() => {
                    placeModelOnEarth(glbUrl, selectedLocation);
                });
            }, (err) => console.error(err), { binary: false });
        },
        () => { controls.enabled = true; }
    );
});

document.getElementById('btn-back-to-model').addEventListener('click', () => {
    document.getElementById('cesium-overlay').style.display = 'none';
    controls.enabled = true; 
});

const snapBtn = document.getElementById('snapRetryBtn');
if (snapBtn) {
    snapBtn.addEventListener('click', () => manualSnapToGround());
}

const focusBtn = document.getElementById('btn-focus-model');
if (focusBtn) {
    focusBtn.addEventListener('click', () => focusOnModel());
}

// UIController初期化 ＆ 初回描画
UIController.init(rebuildMeshes, window.setTool);
if (window.renderAllViews) window.renderAllViews();