// cesiumApp.js
// CesiumJSによる広域配置と高精度マグネットスナップを管理するモジュール

let viewer = null;
let targetEntity = null;
// ★追加：透過モード用の状態変数
export let isTransparencyMode = false;
let selectedFeature = null;
let modifiedFeatures = [];
// ★ギズモ（操作ハンドル）用の変数
let gizmoX = null;
let gizmoY = null;
let gizmoZ = null;

const JAPAN_TERRAIN_ID = 2767062;
const PLATEAU_BLDG_ID = 2602291;

// 初期配置地点（デフォルトは京都駅周辺）
const KYOTO_STATION = { lng: 135.7588, lat: 34.9858 };

// キーボードの入力状態を保持
const keys = { w: false, a: false, s: false, d: false, q: false, e: false };

/**
 * Cesiumの初期化と画面表示を行う関数
 */
export async function initCesium(containerId, token, location = KYOTO_STATION) {
    // ==========================================================
    // ★修正：すでに viewer が存在する場合でも、カメラ位置だけは新しい場所に更新する
    // ==========================================================
    if (viewer) {
        viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(location.lng, location.lat - 0.003, 300),
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 }
        });
        return;
    }

    Cesium.Ion.defaultAccessToken = token;

    viewer = new Cesium.Viewer(containerId, {
        animation: false, 
        timeline: false, 
        infoBox: false, 
        selectionIndicator: false,
        msaaSamples: 4 // ★アンチエイリアス（ギザギザ軽減）
    });
    viewer.scene.globe.depthTestAgainstTerrain = true;

    // ==========================================================
    // ★カメラ操作をThree.js (OrbitControls) 風に変更
    // ==========================================================
    const controller = viewer.scene.screenSpaceCameraController;

    // 1. ズーム操作を「ホイール」と「ピンチ」のみに限定
    controller.zoomEventTypes = [
        Cesium.CameraEventType.WHEEL,
        Cesium.CameraEventType.PINCH
    ];

    // 2. パン操作（平行移動）を「右ドラッグ」と「Shift + 左ドラッグ」に割り当て
    controller.rotateEventTypes = [
        Cesium.CameraEventType.RIGHT_DRAG,
        {
            eventType: Cesium.CameraEventType.LEFT_DRAG,
            modifier: Cesium.KeyboardEventModifier.SHIFT // ★Shiftキーを押している時
        }
    ];

    // 3. オービット操作（注視点を中心とした回転・傾き）を「左ドラッグ」に割り当て
    controller.tiltEventTypes = [
        Cesium.CameraEventType.LEFT_DRAG,
        Cesium.CameraEventType.MIDDLE_DRAG
    ];

    // 4. 操作の慣性（滑り具合）をThree.jsに近い感覚に調整
    controller.inertiaSpin = 0.85;
    controller.inertiaTranslate = 0.85;
    controller.inertiaZoom = 0.85;

    // 5. 見上げの許可と、接近距離の緩和
    controller.minimumZoomDistance = 2;   // ★10m→2mに変更（建物のギリギリまで寄れるようにする）
    // controller.maximumPitch = 0;       // ★削除（コメントアウト）して、空を見上げる操作を許可する

    // ★新規追加：カメラが地盤面（地形）の下に潜るのを強力に防ぐ安全装置
    viewer.scene.preRender.addEventListener(() => {
        const cameraCarto = viewer.camera.positionCartographic;
        // 現在のカメラの真下にある地形（Terrain）の標高を取得
        const terrainHeight = viewer.scene.globe.getHeight(cameraCarto) || 0;
        
        // カメラが地形より1.5m以下に潜ろうとしたら、強制的に「地表+1.5m」の高さに押し戻す
        if (cameraCarto.height < terrainHeight + 1.5) {
            viewer.camera.position = Cesium.Cartesian3.fromRadians(
                cameraCarto.longitude, 
                cameraCarto.latitude, 
                terrainHeight + 1.5
            );
        }
    });

    try {
        viewer.scene.setTerrain(new Cesium.Terrain(Cesium.CesiumTerrainProvider.fromIonAssetId(JAPAN_TERRAIN_ID)));
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(PLATEAU_BLDG_ID);
        viewer.scene.primitives.add(tileset);

        // 2D地図で選んだ location にカメラを向ける
        viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(location.lng, location.lat - 0.003, 300),
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 }
        });

        setupKeyListeners();
        setupDragAndDrop();
        setupPegman();
        setupTransparencyControl(); // ★ここに追加：透過機能の初期化
    } catch (e) {
        console.error("Cesium初期化エラー:", e);
    }
}

/**
 * Three.jsから書き出されたGLBモデルをCesium上に配置する関数（フリーズ対策＆自動スナップ版）
 */
export function placeModelOnEarth(glbUrl, location = KYOTO_STATION) {
    if (!viewer) return;

    if (targetEntity) viewer.entities.remove(targetEntity);
    removeGizmos(); // 既存のギズモがあれば削除

    // 2D地図で選んだ location を使用する
    const lonRad = Cesium.Math.toRadians(location.lng);
    const latRad = Cesium.Math.toRadians(location.lat);
    const originCarto = new Cesium.Cartographic(lonRad, latRad, 2000.0);

    // 1. まずはエラーを回避するため、地形（Terrain）のおおよその高さに「仮配置」する
    let fallbackHeight = viewer.scene.globe.getHeight(originCarto) || 30.0;

    targetEntity = viewer.entities.add({
        name: 'Exported_Building',
        position: Cesium.Cartesian3.fromRadians(lonRad, latRad, fallbackHeight),
        model: { 
            uri: glbUrl, 
            scale: 0.001 // スケール修正（mm -> m）
        }
    });

    createGizmos(); // ギズモの生成

    // 2. 画面の描画が追いつき、PLATEAUの建物が読み込まれた後（0.5秒後）にレーザーを撃つ
    setTimeout(() => {
        try {
            viewer.scene.render(); 
            
            const origin = Cesium.Cartographic.toCartesian(originCarto);
            const normal = viewer.scene.globe.ellipsoid.geodeticSurfaceNormal(origin);
            const direction = Cesium.Cartesian3.negate(normal, new Cesium.Cartesian3());
            const downRay = new Cesium.Ray(origin, direction);

            const earthPos = getTrueGroundPosition(downRay);
            
            if (Cesium.defined(earthPos)) {
                const snapHeight = Cesium.Cartographic.fromCartesian(earthPos).height;
                targetEntity.position = Cesium.Cartesian3.fromRadians(lonRad, latRad, snapHeight);
            }
        } catch (e) {
            console.warn("初期スナップに失敗しましたが、動作は継続します。", e);
        }
    }, 500);
}

/**
 * 3軸ギズモ（操作用ハンドル）の生成：完全透過ラベル付き版
 */
function createGizmos() {
    const getScale = (center) => {
        const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, center);
        return Math.max(2.5, distance * 0.075);
    };

    gizmoX = viewer.entities.add({
        name: 'Gizmo_X',
        show: false,
        position: new Cesium.CallbackProperty(() => {
            if(!targetEntity) return Cesium.Cartesian3.ZERO;
            const center = targetEntity.position.getValue(viewer.clock.currentTime);
            const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
            const s = getScale(center);
            return Cesium.Matrix4.multiplyByPoint(transform, new Cesium.Cartesian3(s, 0, 5), new Cesium.Cartesian3());
        }, false),
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                if(!targetEntity) return [];
                const center = targetEntity.position.getValue(viewer.clock.currentTime);
                const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
                const s = getScale(center);
                const start = Cesium.Matrix4.multiplyByPoint(transform, new Cesium.Cartesian3(0, 0, 5), new Cesium.Cartesian3());
                const end = Cesium.Matrix4.multiplyByPoint(transform, new Cesium.Cartesian3(s, 0, 5), new Cesium.Cartesian3());
                return [start, end];
            }, false),
            width: 30,
            material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.RED)
        },
        label: {
            text: 'X',
            font: 'bold 18px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.RED,
            outlineWidth: 4,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(20, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });

    gizmoY = viewer.entities.add({
        name: 'Gizmo_Y',
        show: false,
        position: new Cesium.CallbackProperty(() => {
            if(!targetEntity) return Cesium.Cartesian3.ZERO;
            const center = targetEntity.position.getValue(viewer.clock.currentTime);
            const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
            const s = getScale(center);
            return Cesium.Matrix4.multiplyByPoint(transform, new Cesium.Cartesian3(0, s, 5), new Cesium.Cartesian3());
        }, false),
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                if(!targetEntity) return [];
                const center = targetEntity.position.getValue(viewer.clock.currentTime);
                const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
                const s = getScale(center);
                const start = Cesium.Matrix4.multiplyByPoint(transform, new Cesium.Cartesian3(0, 0, 5), new Cesium.Cartesian3());
                const end = Cesium.Matrix4.multiplyByPoint(transform, new Cesium.Cartesian3(0, s, 5), new Cesium.Cartesian3());
                return [start, end];
            }, false),
            width: 30,
            material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.GREEN)
        },
        label: {
            text: 'Y',
            font: 'bold 18px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.GREEN,
            outlineWidth: 4,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -20),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });

    gizmoZ = viewer.entities.add({
        name: 'Gizmo_Z',
        show: false,
        position: new Cesium.CallbackProperty(() => {
            if(!targetEntity) return Cesium.Cartesian3.ZERO;
            const center = targetEntity.position.getValue(viewer.clock.currentTime);
            const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
            const s = getScale(center);
            return Cesium.Matrix4.multiplyByPoint(transform, new Cesium.Cartesian3(0, 0, 5 + s), new Cesium.Cartesian3());
        }, false),
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                if(!targetEntity) return [];
                const center = targetEntity.position.getValue(viewer.clock.currentTime);
                const transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);
                const s = getScale(center);
                const start = Cesium.Matrix4.multiplyByPoint(transform, new Cesium.Cartesian3(0, 0, 5), new Cesium.Cartesian3());
                const end = Cesium.Matrix4.multiplyByPoint(transform, new Cesium.Cartesian3(0, 0, 5 + s), new Cesium.Cartesian3());
                return [start, end];
            }, false),
            width: 30,
            material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.DODGERBLUE)
        },
        label: {
            text: 'Z',
            font: 'bold 18px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.DODGERBLUE,
            outlineWidth: 4,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -20),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
}

function removeGizmos() {
    if (gizmoX) viewer.entities.remove(gizmoX);
    if (gizmoY) viewer.entities.remove(gizmoY);
    if (gizmoZ) viewer.entities.remove(gizmoZ);
    gizmoX = gizmoY = gizmoZ = null;
}

/**
 * ギズモも透過して本物の地形を探知する関数
 */
function getTrueGroundPosition(ray) {
    const hits = viewer.scene.drillPickFromRay(ray, 10);
    const ignoreIds = [targetEntity, gizmoX, gizmoY, gizmoZ];

    for (let i = 0; i < hits.length; i++) {
        if (hits[i].object && ignoreIds.includes(hits[i].object.id)) continue;
        if (hits[i].position) return hits[i].position;
    }
    return viewer.scene.globe.pick(ray, viewer.scene);
}

function setupKeyListeners() {
    window.addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if (k in keys) keys[k] = true; });
    window.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k in keys) keys[k] = false; });
}

function setGizmoVisibility(visible) {
    if (gizmoX) gizmoX.show = visible;
    if (gizmoY) gizmoY.show = visible;
    if (gizmoZ) gizmoZ.show = visible;
}

/**
 * マウスによるドラッグ＆ドロップ（ギズモ対応版）
 */
function setupDragAndDrop() {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    let dragging = false;
    let virtualHeight = 0; 
    let isZDragging = false;
    let activeGizmo = null; 
    const elevationText = document.getElementById('elevationText');

    handler.setInputAction((click) => {
        if (isTransparencyMode) return;
        const picked = viewer.scene.pick(click.position);
        
        if (Cesium.defined(picked) && picked.id) {
            if (picked.id === targetEntity) {
                dragging = true; 
                activeGizmo = 'FREE';
                setGizmoVisibility(true); 
            }
            else if (picked.id === gizmoX) { dragging = true; activeGizmo = 'X'; }
            else if (picked.id === gizmoY) { dragging = true; activeGizmo = 'Y'; }
            else if (picked.id === gizmoZ) { dragging = true; activeGizmo = 'Z'; }
            else {
                setGizmoVisibility(false);
            }
            
            if (dragging) {
                viewer.scene.screenSpaceCameraController.enableInputs = false;
                document.body.style.cursor = 'grabbing';
            }
        } else {
            setGizmoVisibility(false);
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((move) => {
        if (!dragging || !targetEntity) return;

        const currentCartesian = targetEntity.position.getValue(viewer.clock.currentTime);
        const currentCartographic = Cesium.Cartographic.fromCartesian(currentCartesian);

        const isXLocked = keys.a || keys.d || activeGizmo === 'X';
        const isYLocked = keys.w || keys.s || activeGizmo === 'Y';
        const isZLocked = keys.q || keys.e || activeGizmo === 'Z';

        if (isXLocked || isYLocked || isZLocked) {
            // 【Z軸】
            if (isZLocked) {
                if (!isZDragging) {
                    isZDragging = true;
                    virtualHeight = currentCartographic.height; 
                }

                const deltaY = move.endPosition.y - move.startPosition.y;
                virtualHeight -= deltaY * 0.5;

                const originCarto = new Cesium.Cartographic(currentCartographic.longitude, currentCartographic.latitude, 2000.0);
                const origin = Cesium.Cartographic.toCartesian(originCarto);
                const normal = viewer.scene.globe.ellipsoid.geodeticSurfaceNormal(origin);
                const direction = Cesium.Cartesian3.negate(normal, new Cesium.Cartesian3());
                const downRay = new Cesium.Ray(origin, direction);

                const earthPos = getTrueGroundPosition(downRay);
                let snapHeight = Cesium.defined(earthPos) ? Cesium.Cartographic.fromCartesian(earthPos).height : viewer.scene.globe.getHeight(originCarto) || 0;

                let appliedHeight = virtualHeight;
                let isSnapped = false;
                if (Math.abs(virtualHeight - snapHeight) < 8.0) {
                    appliedHeight = snapHeight; 
                    isSnapped = true;
                }

                if (virtualHeight < snapHeight) {
                    appliedHeight = snapHeight;
                    virtualHeight = snapHeight; 
                    isSnapped = true;
                }

                targetEntity.position = Cesium.Cartesian3.fromRadians(currentCartographic.longitude, currentCartographic.latitude, appliedHeight);
                
                if (elevationText) {
                    elevationText.innerHTML = isSnapped ? `[Z軸] 📌 地盤面にスナップ中 (高度: 約 ${appliedHeight.toFixed(2)} m)` : `[Z軸] ☁️ 浮遊中 (高度: 約 ${appliedHeight.toFixed(2)} m)`;
                    elevationText.className = isSnapped ? "snap-active" : "";
                }
                return;
            } else {
                isZDragging = false;
            }

            // 【X軸/Y軸】
            const ray = viewer.camera.getPickRay(move.endPosition);
            const normal = viewer.scene.globe.ellipsoid.geodeticSurfaceNormal(currentCartesian);
            const plane = Cesium.Plane.fromPointNormal(currentCartesian, normal);
            const targetCartesian = Cesium.IntersectionTests.rayPlane(ray, plane);

            if (targetCartesian) {
                const targetCartographic = Cesium.Cartographic.fromCartesian(targetCartesian);
                let newLon = currentCartographic.longitude;
                let newLat = currentCartographic.latitude;

                if (isXLocked) {
                    newLon = targetCartographic.longitude;
                    if (elevationText) elevationText.innerHTML = `[X軸] 東西方向にスライド中`;
                } else if (isYLocked) {
                    newLat = targetCartographic.latitude;
                    if (elevationText) elevationText.innerHTML = `[Y軸] 南北方向にスライド中`;
                }
                
                if (elevationText) elevationText.className = "";
                targetEntity.position = Cesium.Cartesian3.fromRadians(newLon, newLat, currentCartographic.height);
            }
        } 
        // 【フリー移動】
        else {
            isZDragging = false;
            const ray = viewer.camera.getPickRay(move.endPosition);
            const earthPosition = getTrueGroundPosition(ray);

            if (Cesium.defined(earthPosition)) {
                targetEntity.position = earthPosition;
                const carto = Cesium.Cartographic.fromCartesian(earthPosition);
                if (elevationText) {
                    elevationText.innerHTML = `フリー移動: 高度 約 ${carto.height.toFixed(2)} m`;
                    elevationText.className = "";
                }
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
        if (dragging) {
            dragging = false;
            isZDragging = false;
            activeGizmo = null;
            viewer.scene.screenSpaceCameraController.enableInputs = true;
            // ==========================================================
            // ★新規追記：ドラッグ終了時の最新座標を2D地図（index.html側）に同期する
            // ==========================================================
            if (targetEntity) {
                const currentCartesian = targetEntity.position.getValue(viewer.clock.currentTime);
                if (Cesium.defined(currentCartesian)) {
                    const carto = Cesium.Cartographic.fromCartesian(currentCartesian);
                    
                    // ラジアンから度数法（普段使う緯度経度）に変換
                    const latestLng = Cesium.Math.toDegrees(carto.longitude);
                    const latestLat = Cesium.Math.toDegrees(carto.latitude);

                    // index.html側にある「lastPlacedLocation」がグローバルに存在すれば上書き
                    if (typeof window.lastPlacedLocation !== 'undefined') {
                        window.lastPlacedLocation = {
                            lat: latestLat,
                            lng: latestLng
                        };
                        console.log(`[同期完了] 3Dドラッグ位置を2D地図に反映しました: ${latestLat}, ${latestLng}`);
                    }
                }
            }
            // ==========================================================

            // 地面に自動再スナップさせる
            manualSnapToGround();
        }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
}

// =========================================================================
// ここから下は独立した関数
// =========================================================================

/**
 * 手動で現在位置の真下にスナップし直す関数
 */
export function manualSnapToGround() {
    if (!viewer || !targetEntity) return;

    const currentCartesian = targetEntity.position.getValue(viewer.clock.currentTime);
    const currentCartographic = Cesium.Cartographic.fromCartesian(currentCartesian);

    const lonRad = currentCartographic.longitude;
    const latRad = currentCartographic.latitude;

    const originCarto = new Cesium.Cartographic(lonRad, latRad, 2000.0);
    const origin = Cesium.Cartographic.toCartesian(originCarto);
    const normal = viewer.scene.globe.ellipsoid.geodeticSurfaceNormal(origin);
    const direction = Cesium.Cartesian3.negate(normal, new Cesium.Cartesian3());
    const downRay = new Cesium.Ray(origin, direction);

    const earthPos = getTrueGroundPosition(downRay);
    let snapHeight = 0;

    if (Cesium.defined(earthPos)) {
        snapHeight = Cesium.Cartographic.fromCartesian(earthPos).height;
    } else {
        snapHeight = viewer.scene.globe.getHeight(originCarto) || 0;
    }

    targetEntity.position = Cesium.Cartesian3.fromRadians(lonRad, latRad, snapHeight);
    
    const elevationText = document.getElementById('elevationText');
    if (elevationText) {
        elevationText.innerHTML = `[Z軸] 📌 再スナップ完了 (高度: 約 ${snapHeight.toFixed(2)} m)`;
        elevationText.className = "snap-active";
    }
}

/**
 * 配置したモデルにカメラをスムーズにフォーカスさせる関数
 */
export function focusOnModel() {
    if (!viewer || !targetEntity) return;

    viewer.flyTo(targetEntity, {
        duration: 1.5, 
        offset: new Cesium.HeadingPitchRange(
            viewer.camera.heading,         
            Cesium.Math.toRadians(-35),   
            300.0                          
        )
    });
}

// =========================================================================
// ★新規追加：ストリートビュー（ペグマン）機能
// =========================================================================

let isPegmanSetup = false;

function setupPegman() {
    if (isPegmanSetup) return; // 2回実行されるのを防ぐ
    isPegmanSetup = true;

    const pegman = document.getElementById('pegman');
    if (!pegman) return;

    // ドラッグ開始時
    pegman.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', 'pegman');
        e.dataTransfer.effectAllowed = 'copy';
        pegman.style.opacity = '0.5'; // 半透明にして掴んでる感を出す
    });

    pegman.addEventListener('dragend', () => {
        pegman.style.opacity = '1.0';
    });

    // 画面全体でドロップを受け入れる設定
    window.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        e.dataTransfer.dropEffect = 'copy';
    });

    // 地図上でドロップされた瞬間
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.getData('text/plain') !== 'pegman') return;

        // ドロップされた画面座標から、Cesium空間への見えないレイ（光線）を飛ばす
        const screenPos = new Cesium.Cartesian2(e.clientX, e.clientY);
        const ray = viewer.camera.getPickRay(screenPos);
        
        // 既存の「高精度レーザー」関数を使い回して、クリックした地点の正確な座標を取得
        const dropCartesian = getTrueGroundPosition(ray);

        if (Cesium.defined(dropCartesian)) {
            enterStreetView(dropCartesian);
        }
    });
}

function enterStreetView(dropCartesian) {
    if (!viewer || !targetEntity) return;

    // 1. ドロップした場所の経緯度を取得
    const dropCarto = Cesium.Cartographic.fromCartesian(dropCartesian);
    const lonRad = dropCarto.longitude;
    const latRad = dropCarto.latitude;

    // 2. その地点の上空から真下へレーザーを撃ち、地盤面や建物の正確な高さを取得
    const originCarto = new Cesium.Cartographic(lonRad, latRad, 2000.0);
    const origin = Cesium.Cartographic.toCartesian(originCarto);
    const normal = viewer.scene.globe.ellipsoid.geodeticSurfaceNormal(origin);
    const direction = Cesium.Cartesian3.negate(normal, new Cesium.Cartesian3());
    const downRay = new Cesium.Ray(origin, direction);

    const trueGround = getTrueGroundPosition(downRay);
    let groundHeight = Cesium.defined(trueGround) 
        ? Cesium.Cartographic.fromCartesian(trueGround).height 
        : (viewer.scene.globe.getHeight(originCarto) || 0);

    // 3. カメラの最終位置を設定（指定通り「地盤面 + 1.5m」の歩行者アイレベル）
    const cameraHeight = groundHeight + 1.5;
    const cameraPosition = Cesium.Cartesian3.fromRadians(lonRad, latRad, cameraHeight);

    // 4. カメラの向きを「配置した建物」に向けるための角度計算
    const targetPos = targetEntity.position.getValue(viewer.clock.currentTime);
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(cameraPosition);
    const invTransform = Cesium.Matrix4.inverseTransformation(transform, new Cesium.Matrix4());
    
    // カメラのローカル座標系（X:東, Y:北, Z:上）での建物の相対位置を計算
    const localTarget = Cesium.Matrix4.multiplyByPoint(invTransform, targetPos, new Cesium.Cartesian3());

    const heading = Math.atan2(localTarget.x, localTarget.y); // 方位角（北から東へ）
    const distance2D = Math.sqrt(localTarget.x * localTarget.x + localTarget.y * localTarget.y);
    const pitch = Math.atan2(localTarget.z, distance2D); // 仰角/俯角

    // 5. 2秒かけてフワッと歩行者視点へ移動するアニメーション
    viewer.camera.flyTo({
        destination: cameraPosition,
        orientation: { heading: heading, pitch: pitch, roll: 0.0 },
        duration: 2.0 
    });
    
    // UI文字の更新
    const elevationText = document.getElementById('elevationText');
    if (elevationText) {
        elevationText.innerHTML = `🚶 歩行者視点 (高度: 約 ${cameraHeight.toFixed(2)} m)`;
        elevationText.className = "snap-active";
    }
}

// =========================================================================
// ★新規追加：PLATEAU建物の個別透過コントロール機能
// =========================================================================
function setupTransparencyControl() {
    const toggleBtn = document.getElementById('toggleTransparencyBtn');
    const resetBtn = document.getElementById('resetTransparencyBtn');
    const sliderPanel = document.getElementById('opacitySliderPanel');
    const slider = document.getElementById('opacitySlider');
    const closeBtn = document.getElementById('closeOpacitySliderBtn');

    if (!toggleBtn) return;

    // 1. モード切替ボタンの処理
    toggleBtn.addEventListener('click', () => {
        isTransparencyMode = !isTransparencyMode;
        
        if (isTransparencyMode) {
            toggleBtn.style.background = '#007acc';
            toggleBtn.style.color = '#fff';
            toggleBtn.style.borderColor = '#005999';
            toggleBtn.innerHTML = '✅ 透過モード中 (建物をクリック)';
            resetBtn.style.display = 'block';
            document.body.style.cursor = 'crosshair'; // カーソルを十字にする
        } else {
            toggleBtn.style.background = '#eee';
            toggleBtn.style.color = '#000';
            toggleBtn.style.borderColor = '#ccc';
            toggleBtn.innerHTML = '🌫️ 透過モード ON';
            document.body.style.cursor = 'default';
            sliderPanel.style.display = 'none';
            selectedFeature = null;
        }
    });

    // 2. 建物クリック時の処理
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((click) => {
        if (!isTransparencyMode) return;

        // クリックした場所にある3Dオブジェクトを取得
        const pickedFeature = viewer.scene.pick(click.position);

        // PLATEAUの建物（Cesium3DTileFeature）かどうかを判定
        if (pickedFeature instanceof Cesium.Cesium3DTileFeature) {
            selectedFeature = pickedFeature;

            // 元の色（不透明状態）をバックアップとして保存しておく
            if (!selectedFeature.originalColor) {
                selectedFeature.originalColor = selectedFeature.color.clone();
            }

            // スライダーの値を、現在のその建物の透明度に合わせる
            slider.value = selectedFeature.color.alpha;

            // スライダーパネルをクリックした位置の近くに表示する
            sliderPanel.style.display = 'block';
            sliderPanel.style.left = (click.position.x + 20) + 'px';
            sliderPanel.style.top = (click.position.y - 20) + 'px';

            // リセット用に、変更した建物のリストに加える
            if (!modifiedFeatures.includes(selectedFeature)) {
                modifiedFeatures.push(selectedFeature);
            }
        } else {
            // 空や地形、自分の建物をクリックした場合はスライダーを隠す
            sliderPanel.style.display = 'none';
            selectedFeature = null;
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 3. スライダーを動かした時のリアルタイム反映処理
    slider.addEventListener('input', (e) => {
        if (selectedFeature) {
            const alpha = parseFloat(e.target.value);
            const c = selectedFeature.originalColor || selectedFeature.color;
            // RGBはそのままに、Alpha（透明度）だけを上書き
            selectedFeature.color = new Cesium.Color(c.red, c.green, c.blue, alpha);
        }
    });

    // 4. 確定ボタンの処理
    closeBtn.addEventListener('click', () => {
        sliderPanel.style.display = 'none';
        selectedFeature = null;
        
        // ★新規追加：確定と同時に「透過モード ON」ボタンを自動クリックして通常モードに戻す
        toggleBtn.click();
    });

    // 5. すべてリセットボタンの処理
    resetBtn.addEventListener('click', () => {
        modifiedFeatures.forEach(feature => {
            if (feature.originalColor) {
                feature.color = feature.originalColor;
            }
        });
        modifiedFeatures = []; // リストを空にする
        sliderPanel.style.display = 'none';
        
        // モードを終了させる（任意）
        toggleBtn.click();
    });
}