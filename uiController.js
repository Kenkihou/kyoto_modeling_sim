// uiController.js
import { GUI } from 'lil-gui';
import { AppState } from './appState.js';

let currentGUI = null;
let lastMenuX = 0;
let lastMenuY = 0;

// index.html側から関数を受け取るための変数
let rebuildMeshes = () => {};
let setTool = () => {};

const defaultRoofParams = {
    '切妻': { eaves: 600, keraba: 300, slope: 4, rotate90: false, ridgeOffset: 0 },
    '寄棟': { eaves: 600, keraba: 600, slope: 4 },
    'パラペット修景': { pHeight: 300, slope: 3, out_px: 600, in_px: 400 },
    '陸屋根': { pHeight: 300 }
};

export const UIController = {
    /**
     * 初期化：index.htmlから必要な関数を受け取る
     */
    init(rebuildFn, setToolFn) {
        rebuildMeshes = rebuildFn;
        setTool = setToolFn;
        this.setupGlobalToggles();
    },

    updateActionButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (!undoBtn || !redoBtn) return; 

        if (AppState.historyIndex > 0) undoBtn.classList.remove('disabled');
        else undoBtn.classList.add('disabled');

        if (AppState.historyIndex < AppState.history.length - 1) redoBtn.classList.remove('disabled');
        else redoBtn.classList.add('disabled');
    },

    clearGUI() {
        if (currentGUI) {
            currentGUI.destroy();
            currentGUI = null;
        }
    },

    updateGUI(b, targetType = 'roof', faceDir = null) {
        this.clearGUI();
        if (!b) return; 

        const onChange = () => rebuildMeshes();
        const onFinishChange = () => { AppState.saveState(); this.updateActionButtons(); };

        if (targetType === 'roof') {
            if (!b.roof) return;
            currentGUI = new GUI({ title: '大屋根の寸法設定' });
            currentGUI.domElement.style.position = 'absolute';
            currentGUI.domElement.style.top = '10px';
            currentGUI.domElement.style.right = '10px';

            const type = b.roof.type;
            const params = b.roof.params[type];

            const resetObj = {
                reset: () => {
                    const currentRot = (type === '切妻') ? b.roof.params['切妻'].rotate90 : false;
                    b.roof.params[type] = JSON.parse(JSON.stringify(defaultRoofParams[type]));
                    if (type === '切妻') b.roof.params['切妻'].rotate90 = currentRot;
                    onFinishChange();
                    rebuildMeshes();
                    this.updateGUI(b, 'roof'); 
                }
            };

            if (type === '切妻') {
                currentGUI.add(params, 'eaves', 0, 2000, 100).name('軒の出 (mm)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(params, 'keraba', 0, 2000, 100).name('ケラバ (mm)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(params, 'slope', 0, 10, 0.5).name('屋根勾配 (寸)').onChange(onChange).onFinishChange(onFinishChange);
                const ridgeCtrl = currentGUI.add(params, 'ridgeOffset', -50, 50, 1).name('棟の位置 (%)');
                ridgeCtrl.onChange((val) => {
                // -5% 〜 5% の範囲に入ったら 0%（中央の切妻）にスナップ
                if (val > -5 && val < 5 && val !== 0) {
                    params.ridgeOffset = 0;
                    ridgeCtrl.updateDisplay(); // スライダーの見た目も強制的に0に合わせる
                }
                onChange();
            }).onFinishChange(onFinishChange);
            } else if (type === '寄棟') {
                currentGUI.add(params, 'eaves', 0, 2000, 100).name('軒の出 (mm)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(params, 'slope', 0, 10, 0.5).name('屋根勾配 (寸)').onChange(onChange).onFinishChange(onFinishChange);
            } else if (type === 'パラペット修景') {
                currentGUI.add(params, 'pHeight', 150, 1000, 50).name('パラペット高さ (mm)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(params, 'slope', 0, 10, 0.5).name('笠木勾配 (寸)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(params, 'out_px', 0, 2000, 100).name('外方向の出幅 (mm)').onChange(onChange).onFinishChange(onFinishChange);
                const maxIn = Math.floor(Math.min(b.w / 2, b.d / 2) / 50) * 50; 
                if (params.in_px > maxIn) params.in_px = maxIn;
                currentGUI.add(params, 'in_px', 0, maxIn, 50).name('内方向の寸法 (mm)').onChange(onChange).onFinishChange(onFinishChange);
            } else if (type === '陸屋根') {
                currentGUI.add(params, 'pHeight', 150, 1000, 50).name('パラペット高さ (mm)').onChange(onChange).onFinishChange(onFinishChange);
            }
            currentGUI.add(resetObj, 'reset').name('↺ デフォルトに戻す');
        }
        else if (targetType === 'lowerRoof') {
            if (!b.lowerRoof) return;
            currentGUI = new GUI({ title: '下屋の寸法設定' });
            currentGUI.domElement.style.position = 'absolute';
            currentGUI.domElement.style.top = '10px';
            currentGUI.domElement.style.right = '10px';

            const lr = b.lowerRoof;
            const resetObj = {
                reset: () => {
                    b.lowerRoof.eaves = 600; b.lowerRoof.keraba = 300; b.lowerRoof.slope = 4;
                    onFinishChange(); rebuildMeshes(); this.updateGUI(b, 'lowerRoof'); 
                }
            };
            currentGUI.add(lr, 'eaves', 0, 1000, 100).name('軒の出 (mm)').onChange(onChange).onFinishChange(onFinishChange);
            currentGUI.add(lr, 'keraba', 0, 600, 100).name('ケラバ (mm)').onChange(onChange).onFinishChange(onFinishChange);
            currentGUI.add(lr, 'slope', 3, 4.5, 0.5).name('屋根勾配 (寸)').onChange(onChange).onFinishChange(onFinishChange);
            currentGUI.add(resetObj, 'reset').name('↺ デフォルトに戻す');
        }
        else if (targetType === 'side') {
            if (!faceDir) return;
            const isVisor = (b.visors || []).includes(faceDir);
            const isFlatVisor = (b.flatVisors || []).includes(faceDir);
            const dName = { 'pz': '手前', 'nz': '奥', 'px': '右', 'nx': '左' }[faceDir] || faceDir;

            if (isVisor) {
                currentGUI = new GUI({ title: `軒庇の設定 (${dName})` });
                currentGUI.domElement.style.position = 'absolute';
                currentGUI.domElement.style.top = '10px'; currentGUI.domElement.style.right = '10px';
                const p = b.visorParams[faceDir];
                const resetObj = { reset: () => { b.visorParams[faceDir] = { eaves: 600, keraba: 300, slope: 4 }; onFinishChange(); rebuildMeshes(); this.updateGUI(b, 'side', faceDir); }};
                currentGUI.add(p, 'eaves', 100, 1000, 100).name('軒の出 (mm)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(p, 'keraba', 0, 600, 100).name('ケラバ (mm)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(p, 'slope', 3, 4.5, 0.5).name('屋根勾配 (寸)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(resetObj, 'reset').name('↺ デフォルトに戻す');
            } 
            else if (isFlatVisor) {
                currentGUI = new GUI({ title: `水平庇の設定 (${dName})` });
                currentGUI.domElement.style.position = 'absolute';
                currentGUI.domElement.style.top = '10px'; currentGUI.domElement.style.right = '10px';
                const p = b.flatVisorParams[faceDir];
                const resetObj = { reset: () => { b.flatVisorParams[faceDir] = { depth: 300, offsetY: 0, margin: 0 }; onFinishChange(); rebuildMeshes(); this.updateGUI(b, 'side', faceDir); }};
                currentGUI.add(p, 'depth', 100, 1000, 100).name('出寸法 (mm)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(p, 'offsetY', -300, 0, 100).name('設置位置 (mm)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(p, 'margin', 0, 300, 100).name('両端空き (mm)').onChange(onChange).onFinishChange(onFinishChange);
                currentGUI.add(resetObj, 'reset').name('↺ デフォルトに戻す');
            }
        }
        else if (targetType === 'balcony') {
            if (!faceDir || !b.balconies || !b.balconies[faceDir]) return;
            const dName = { 'pz': '手前', 'nz': '奥', 'px': '右', 'nx': '左' }[faceDir] || faceDir;
            const typeName = b.balconies[faceDir] === 'glass' ? 'ガラス' : '縦格子';

            currentGUI = new GUI({ title: `バルコニー設定 [${typeName}] (${dName})` });
            currentGUI.domElement.style.position = 'absolute';
            currentGUI.domElement.style.top = '10px'; currentGUI.domElement.style.right = '10px';

            const p = b.balcParams[faceDir];
            const maxSideH = Math.max(1100, b.h - 200);
            let previousHandrailH = p.h_handrail;

            currentGUI.add(p, 'depth', 900, 1500, 100).name('奥行 (mm)').onChange(onChange).onFinishChange(onFinishChange);
            const handrailCtrl = currentGUI.add(p, 'h_handrail', 1100, 1300, 50).name('手すり高 (mm)');
            const sideCtrl = currentGUI.add(p, 'h_side', 1100, maxSideH, 10).name('側面壁高 (mm)');

            handrailCtrl.onChange((newVal) => {
                if (p.h_side === previousHandrailH) { p.h_side = newVal; sideCtrl.updateDisplay(); }
                previousHandrailH = newVal; rebuildMeshes();
            }).onFinishChange(onFinishChange);
            sideCtrl.onChange(onChange).onFinishChange(onFinishChange);

            const resetObj = { reset: () => { b.balcParams[faceDir] = { depth: 1000, h_handrail: 1100, h_side: 1100 }; onFinishChange(); rebuildMeshes(); this.updateGUI(b, 'balcony', faceDir); }};
            currentGUI.add(resetObj, 'reset').name('↺ デフォルトに戻す');
        }
        else if (targetType === 'pilaster') {
            if (!faceDir || !b.pilasters || !b.pilasters[faceDir]) return;
            const dName = { 'pz': '手前', 'nz': '奥', 'px': '右', 'nx': '左' }[faceDir] || faceDir;

            currentGUI = new GUI({ title: `つけ柱・梁 設定 (${dName})` });
            currentGUI.domElement.style.position = 'absolute';
            currentGUI.domElement.style.top = '10px'; currentGUI.domElement.style.right = '10px';

            const p = b.pilasterParams[faceDir];
            currentGUI.add(p, 'pitch', 900, 2000, 100).name('柱の間隔 (mm)').onChange(onChange).onFinishChange(() => { onFinishChange(); this.updateGUI(b, 'pilaster', faceDir); });
            currentGUI.add(p, 'beamY', 100, b.h - 100, 10).name('梁の高さ (mm)').onChange(onChange).onFinishChange(onFinishChange);

            const pillarFolder = currentGUI.addFolder('柱の個別表示');
            const L = (faceDir === 'pz' || faceDir === 'nz') ? b.w : b.d;
            const N = Math.max(1, Math.round((L - 100) / p.pitch));
            if (!p.visiblePillars) p.visiblePillars = [];
            for(let i=0; i<=N; i++) {
                if (p.visiblePillars[i] === undefined) p.visiblePillars[i] = true;
                const obj = { v: p.visiblePillars[i] };
                pillarFolder.add(obj, 'v').name(`柱 ${i+1} (${i===0?'左端':i===N?'右端':'中間'})`).onChange((val) => { p.visiblePillars[i] = val; onChange(); }).onFinishChange(onFinishChange);
            }
            const resetObj = { reset: () => { b.pilasterParams[faceDir] = { pitch: 1000, beamY: b.h - 100, visiblePillars: [] }; onFinishChange(); rebuildMeshes(); this.updateGUI(b, 'pilaster', faceDir); }};
            currentGUI.add(resetObj, 'reset').name('↺ デフォルトに戻す');
        }
        else if (targetType === 'window') {
            if (!faceDir || !b.windows || !b.windows[faceDir]) return;
            const dName = { 'pz': '手前', 'nz': '奥', 'px': '右', 'nx': '左' }[faceDir] || faceDir;

            currentGUI = new GUI({ title: `窓 設定 (${dName})` });
            currentGUI.domElement.style.position = 'absolute';
            currentGUI.domElement.style.top = '10px'; currentGUI.domElement.style.right = '10px';

            const p = b.windowParams[faceDir];
            const L = (faceDir === 'pz' || faceDir === 'nz') ? b.w : b.d;
            const limitX = Math.max(0, (L - 1970) / 2);
            let limitY_min = p.height - 2000; 
            const limitY_max = Math.max(limitY_min, b.h - 2100); 

            if (p.offsetX > limitX) p.offsetX = limitX;
            if (p.offsetX < -limitX) p.offsetX = -limitX;
            if (p.offsetY > limitY_max) p.offsetY = limitY_max;
            if (p.offsetY < limitY_min) p.offsetY = limitY_min;

            const heightCtrl = currentGUI.add(p, 'height', 900, 2000, 100).name('窓の高さ (mm)');
            const xCtrl = currentGUI.add(p, 'offsetX', -limitX, limitX, 10).name('ヨコ位置 (mm)');
            const yCtrl = currentGUI.add(p, 'offsetY', limitY_min, limitY_max, 10).name('タテ位置 (mm)');

            heightCtrl.onChange((newHeight) => {
                limitY_min = newHeight - 2000;
                if (yCtrl.min) yCtrl.min(limitY_min); 
                if (p.offsetY < limitY_min) { p.offsetY = limitY_min; yCtrl.updateDisplay(); }
                onChange();
            }).onFinishChange(onFinishChange);

            xCtrl.onChange(onChange).onFinishChange(onFinishChange);
            yCtrl.onChange(onChange).onFinishChange(onFinishChange);

            const resetObj = { reset: () => { b.windowParams[faceDir] = { height: 2000, offsetX: 0, offsetY: 0 }; onFinishChange(); rebuildMeshes(); this.updateGUI(b, 'window', faceDir); }};
            currentGUI.add(resetObj, 'reset').name('↺ デフォルトに戻す');
        }
        else if (targetType === 'door') {
            if (!faceDir || !b.doors || !b.doors[faceDir]) return;
            const dName = { 'pz': '手前', 'nz': '奥', 'px': '右', 'nx': '左' }[faceDir] || faceDir;

            currentGUI = new GUI({ title: `玄関 設定 (${dName})` });
            currentGUI.domElement.style.position = 'absolute';
            currentGUI.domElement.style.top = '10px'; currentGUI.domElement.style.right = '10px';

            const p = b.doorParams[faceDir];
            const L = (faceDir === 'pz' || faceDir === 'nz') ? b.w : b.d;
            const limitX = Math.max(0, (L - 1500) / 2);

            if (p.offsetX > limitX) p.offsetX = limitX;
            if (p.offsetX < -limitX) p.offsetX = -limitX;

            currentGUI.add(p, 'offsetX', -limitX, limitX, 10).name('ヨコ位置 (mm)').onChange(onChange).onFinishChange(onFinishChange);

            const resetObj = { reset: () => { b.doorParams[faceDir] = { offsetX: 0 }; onFinishChange(); rebuildMeshes(); this.updateGUI(b, 'door', faceDir); }};
            currentGUI.add(resetObj, 'reset').name('↺ デフォルトに戻す');
        }
    },

    showFloatingMenu(x, y, block, faceType, faceDir) {
        lastMenuX = x;
        lastMenuY = y;

        const menu = document.getElementById('floating-menu');
        menu.innerHTML = ''; 
        menu.style.display = 'flex';
        menu.style.left = (x + 80) + 'px'; 
        menu.style.top = (y + 40) + 'px';

        const btnExtrude = document.createElement('div');
        btnExtrude.className = 'float-btn black';
        btnExtrude.innerText = '⇧ プッシュプル';
        btnExtrude.onclick = () => { setTool('EXTRUDE'); this.hideFloatingMenu(); };
        menu.appendChild(btnExtrude);

        if (block.h <= 100) return;

        if (faceType === 'top') {
            if (AppState.isTopClear(block)) {
                const btnRoof = document.createElement('div');
                btnRoof.className = 'float-btn';
                if (!block.roof) {
                    btnRoof.innerText = '大屋根を追加'; 
                } else {
                    btnRoof.classList.add('warning'); 
                    if (block.roof.type === '切妻' && !block.roof.params['切妻'].rotate90) btnRoof.innerText = '屋根変更 (→ 切妻90度)';
                    else if (block.roof.type === '切妻' && block.roof.params['切妻'].rotate90) btnRoof.innerText = '屋根変更 (→ 寄棟)';
                    else if (block.roof.type === '寄棟') btnRoof.innerText = '屋根変更 (→ パラペット修景)';
                    else if (block.roof.type === 'パラペット修景') btnRoof.innerText = '屋根変更 (→ 陸屋根)';
                    else { btnRoof.innerText = '大屋根を削除'; btnRoof.classList.remove('warning'); btnRoof.classList.add('danger'); }
                }
                btnRoof.onclick = () => { window.toggleRoof(); };
                menu.appendChild(btnRoof);
            } else {
                const btnLowerRoof = document.createElement('div');
                btnLowerRoof.className = 'float-btn';
                btnLowerRoof.innerText = block.lowerRoof ? '下屋を削除' : '下屋を追加';
                if (block.lowerRoof) btnLowerRoof.classList.add('danger');
                btnLowerRoof.onclick = () => { window.toggleLowerRoof(); };
                menu.appendChild(btnLowerRoof);
            }
        } 
        else if (faceType === 'side') {
            const isVisor = block.visors && block.visors.includes(faceDir);
            const isFlat = block.flatVisors && block.flatVisors.includes(faceDir);
            const btnVisor = document.createElement('div');
            btnVisor.className = 'float-btn';
            if (!isVisor && !isFlat) { btnVisor.innerText = '軒庇・水平庇を追加'; }
            else if (isVisor) { btnVisor.innerText = '庇を変更 (→ 水平庇)'; btnVisor.classList.add('warning'); }
            else { btnVisor.innerText = '庇を削除'; btnVisor.classList.add('danger'); }
            btnVisor.onclick = () => { window.cycleVisor(faceDir); };
            menu.appendChild(btnVisor);

            const balcType = block.balconies && block.balconies[faceDir];
            const btnBalcony = document.createElement('div');
            btnBalcony.className = 'float-btn';
            if (!balcType) { btnBalcony.innerText = 'バルコニーを追加'; }
            else if (balcType === 'glass') { btnBalcony.innerText = 'バルコニー変更 (→ 縦格子)'; btnBalcony.classList.add('warning'); }
            else { btnBalcony.innerText = 'バルコニーを削除'; btnBalcony.classList.add('danger'); }
            btnBalcony.onclick = () => { window.toggleBalcony(faceDir); };
            menu.appendChild(btnBalcony);

            const hasPillar = block.pilasters && block.pilasters[faceDir];
            const btnPillar = document.createElement('div');
            btnPillar.className = 'float-btn';
            btnPillar.innerText = hasPillar ? '付け柱・付け梁を削除' : '付け柱・付け梁を追加';
            if (hasPillar) btnPillar.classList.add('danger');
            btnPillar.onclick = () => { window.togglePilaster(faceDir); };
            menu.appendChild(btnPillar);

            const hasWindow = block.windows && block.windows[faceDir];
            const btnWindow = document.createElement('div');
            btnWindow.className = 'float-btn';
            btnWindow.innerText = hasWindow ? '窓を削除' : '窓を追加';
            if (hasWindow) btnWindow.classList.add('danger');
            btnWindow.onclick = () => { window.toggleWindow(faceDir); };
            menu.appendChild(btnWindow);

            if (!block.y || Math.abs(block.y) < 1) { 
                const hasDoor = block.doors && block.doors[faceDir];
                const btnDoor = document.createElement('div');
                btnDoor.className = 'float-btn';
                btnDoor.innerText = hasDoor ? '玄関を削除' : '玄関を追加';
                if (hasDoor) btnDoor.classList.add('danger');
                btnDoor.onclick = () => { window.toggleDoor(faceDir); };
                menu.appendChild(btnDoor);
            }
        }
    },

    hideFloatingMenu() {
        const menu = document.getElementById('floating-menu');
        if(menu) menu.style.display = 'none';
    },

    updateStatusDisplay(currentTool) {
        const statusText = document.getElementById('status-text');
        if (!statusText) return;

        if (currentTool === 'DRAW') {
            statusText.innerHTML = "▶ 床面をドラッグして平面を作図します<br>▶ 背景クリックでキャンセル";
        } else if (currentTool === 'EXTRUDE') {
            statusText.innerHTML = "▶ 面をドラッグして建物をプッシュプルします<br>▶ 面＋Shiftキーで新規ブロックを追加";
        } else if (AppState.selectedId !== null) {
            const b = AppState.buildingData.find(d => d.id === AppState.selectedId);
            if (!b) return;

            let msgs = ["▶ オブジェクトを選択中 (Deleteキーで削除)"];
            if (b.h === 100) msgs.push("▶ 面をクリックしてプッシュプルが可能です");
            else if (AppState.isTopClear(b)) msgs.push("▶ 大屋根の追加・切り替え または 軒庇の追加が可能です");
            else msgs.push("▶ 下屋 または 軒庇の追加が可能です");
            statusText.innerHTML = msgs.join("<br>");
        } else {
            statusText.innerHTML = "▶ オブジェクトを選択するか、ツールを選んでください";
        }
    },

    /**
     * トグル系の関数を window に登録する
     */
    setupGlobalToggles() {
        const executeAction = (action) => {
            if (!AppState.selectedId) return;
            const b = AppState.buildingData.find(d => d.id === AppState.selectedId);
            if (!b) return;
            action(b);
            AppState.saveState();
            AppState.updateAllLowerRoofs(); 
            rebuildMeshes();
            this.updateActionButtons();
        };

        window.addRoof = (type) => executeAction((b) => {
            if (!AppState.isTopClear(b)) return alert('上に別のブロックが乗っているため、大屋根は配置できません。');
            b.roof = { type: type, params: JSON.parse(JSON.stringify(defaultRoofParams)) };
            this.updateGUI(b, 'roof');
        });

        window.toggleRoof = () => executeAction((b) => {
            if (!AppState.isTopClear(b)) return alert('上に別のブロックが乗っているため、大屋根は配置できません。');
            if (!b.roof) b.roof = { type: '切妻', params: JSON.parse(JSON.stringify(defaultRoofParams)) };
            else if (b.roof.type === '切妻' && !b.roof.params['切妻'].rotate90) b.roof.params['切妻'].rotate90 = true;
            else if (b.roof.type === '切妻' && b.roof.params['切妻'].rotate90) b.roof.type = '寄棟';
            else if (b.roof.type === '寄棟') b.roof.type = 'パラペット修景'; 
            else if (b.roof.type === 'パラペット修景') b.roof.type = '陸屋根'; 
            else { delete b.roof; this.clearGUI(); }
            this.showFloatingMenu(lastMenuX, lastMenuY, b, 'top', null);
            if (b.roof) this.updateGUI(b, 'roof');
        });

        window.toggleLowerRoof = () => executeAction((b) => {
            if (b.lowerRoof) { delete b.lowerRoof; this.clearGUI(); } 
            else { b.lowerRoof = { eaves: 600, slope: 4, thick: 150, keraba: 300, out_nx: 0, out_px: 0, out_nz: 0, out_pz: 0 }; }
            this.showFloatingMenu(lastMenuX, lastMenuY, b, 'top', null);
            if (b.lowerRoof) this.updateGUI(b, 'lowerRoof'); 
        });

        window.toggleBalcony = (dir) => executeAction((b) => {
            if (!b.balconies) { b.balconies = {}; b.balcParams = {}; }
            const current = b.balconies[dir];
            if (!current) { b.balconies[dir] = 'glass'; b.balcParams[dir] = { depth: 1000, h_handrail: 1100, h_side: 1100 }; } 
            else if (current === 'glass') { b.balconies[dir] = 'lattice'; } 
            else { delete b.balconies[dir]; delete b.balcParams[dir]; }
            if (Object.keys(b.balconies).length === 0) { delete b.balconies; delete b.balcParams; }
            this.showFloatingMenu(lastMenuX, lastMenuY, b, 'side', dir);
            if (b.balconies && b.balconies[dir]) this.updateGUI(b, 'balcony', dir); else this.clearGUI();
        });

        window.togglePilaster = (dir) => executeAction((b) => {
            if (!b.pilasters) { b.pilasters = {}; b.pilasterParams = {}; }
            if (!b.pilasters[dir]) { b.pilasters[dir] = true; b.pilasterParams[dir] = { pitch: 1000, beamY: b.h - 100, visiblePillars: [] }; } 
            else { delete b.pilasters[dir]; delete b.pilasterParams[dir]; }
            if (Object.keys(b.pilasters).length === 0) { delete b.pilasters; delete b.pilasterParams; }
            this.showFloatingMenu(lastMenuX, lastMenuY, b, 'side', dir);
            if (b.pilasters && b.pilasters[dir]) this.updateGUI(b, 'pilaster', dir); else this.clearGUI();
        });

        window.toggleWindow = (dir) => executeAction((b) => {
            if (!b.windows) { b.windows = {}; b.windowParams = {}; }
            if (!b.windows[dir]) { b.windows[dir] = true; b.windowParams[dir] = { height: 2000, offsetX: 0, offsetY: 0 }; } 
            else { delete b.windows[dir]; delete b.windowParams[dir]; }
            if (Object.keys(b.windows).length === 0) { delete b.windows; delete b.windowParams; }
            this.showFloatingMenu(lastMenuX, lastMenuY, b, 'side', dir);
            if (b.windows && b.windows[dir]) this.updateGUI(b, 'window', dir); else this.clearGUI();
        });

        window.toggleDoor = (dir) => executeAction((b) => {
            if (!b.doors) { b.doors = {}; b.doorParams = {}; }
            if (!b.doors[dir]) { b.doors[dir] = true; b.doorParams[dir] = { offsetX: 0 }; } 
            else { delete b.doors[dir]; delete b.doorParams[dir]; }
            if (Object.keys(b.doors).length === 0) { delete b.doors; delete b.doorParams; }
            this.showFloatingMenu(lastMenuX, lastMenuY, b, 'side', dir);
            if (b.doors && b.doors[dir]) this.updateGUI(b, 'door', dir); else this.clearGUI();
        });

        window.cycleVisor = (dir) => executeAction((b) => {
            if (!b.visors) b.visors = []; if (!b.flatVisors) b.flatVisors = [];
            if (!b.visorParams) b.visorParams = {}; if (!b.flatVisorParams) b.flatVisorParams = {};
            const vIdx = b.visors.indexOf(dir); const fIdx = b.flatVisors.indexOf(dir);

            if (vIdx === -1 && fIdx === -1) { b.visors.push(dir); b.visorParams[dir] = { eaves: 600, keraba: 300, slope: 4 }; } 
            else if (vIdx > -1) { b.visors.splice(vIdx, 1); delete b.visorParams[dir]; b.flatVisors.push(dir); b.flatVisorParams[dir] = { depth: 300, offsetY: 0, margin: 0 }; } 
            else if (fIdx > -1) { b.flatVisors.splice(fIdx, 1); delete b.flatVisorParams[dir]; }

            if (b.visors.length === 0) delete b.visors; if (b.flatVisors.length === 0) delete b.flatVisors;
            if (Object.keys(b.visorParams).length === 0) delete b.visorParams; if (Object.keys(b.flatVisorParams).length === 0) delete b.flatVisorParams;
            
            this.showFloatingMenu(lastMenuX, lastMenuY, b, 'side', dir);
            if ((b.visors && b.visors.includes(dir)) || (b.flatVisors && b.flatVisors.includes(dir))) this.updateGUI(b, 'side', dir); else this.clearGUI();
        });

        window.removeRoof = () => executeAction((b) => {
            let removed = false;
            ['roof', 'lowerRoof', 'visors', 'flatVisors', 'balconies', 'visorParams', 'flatVisorParams'].forEach(key => {
                if (b[key]) { delete b[key]; removed = true; }
            });
            if (removed) this.clearGUI();
        });
    }
};