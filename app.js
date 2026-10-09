// ==========================================
// PWA Gacha Maker - Main Application Logic
// ==========================================

const GAS_URL = "YOUR_GAS_WEB_APP_URL_HERE"; // ご自身のGASウェブアプリURLを設定してください
const FALLBACK_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23eee'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='14' fill='%23aaa'>No Image</text></svg>";

// アプリ共通ステート
let state = {
    gachas: [],
    currentGachaId: null,
    inventory: {}, // { gachaId: { cardId: count } }
    stones: 10000,
    mileage: {},   // { gachaId: points }
    lastLoginDate: null,
    loginDays: 0,
    isGuestMode: false
};

// ------------------------------------------
// 💾 IndexedDB ストレージ管理 (タスクキル完全対応)
// ------------------------------------------
const DB_NAME = 'GachaMakerDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveLocal() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        await new Promise((resolve, reject) => {
            const req = store.put(state, 'masterState');
            req.onsuccess = resolve;
            req.onerror = reject;
        });
    } catch (e) {
        console.error("Local save error:", e);
    }
}

async function loadLocal() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const savedState = await new Promise((resolve, reject) => {
            const req = store.get('masterState');
            req.onsuccess = () => resolve(req.result);
            req.onerror = reject;
        });
        if (savedState) {
            state = { ...state, ...savedState };
        }
    } catch (e) {
        console.error("Local load error:", e);
    }
}

// ------------------------------------------
// 🚀 アプリ初期化 & ログインチェック
// ------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    // 1. URLパラメータに surprise がある場合は初期化前から即座にゲスト表示準備
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('surprise')) {
        state.isGuestMode = true;
        applyGuestModeUI();
    }

    // 2. ローカルストレージ復元
    await loadLocal();

    // 3. ログインボーナスチェック
    checkLoginBonus();

    // 4. サプライズシェア受信確認
    await checkSurpriseShare();

    // 5. UI反映
    applyGuestModeUI();
    renderGachaSelectors();
    renderGachaScreen();
    updateUI();
});

// ログインボーナス処理
function checkLoginBonus() {
    const today = new Date().toLocaleDateString();
    if (state.lastLoginDate !== today) {
        state.lastLoginDate = today;
        state.loginDays = (state.loginDays || 0) + 1;
        state.stones = (state.stones || 0) + 1000; // 毎ログボ 1000石
        saveLocal();
    }
}

// ゲストモード（共有受取側）のUI制御
function applyGuestModeUI() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const isLocked = currentGacha && currentGacha.isLocked;

    if (state.isGuestMode || isLocked) {
        const adminTabBtn = document.getElementById('tab-btn-admin');
        if (adminTabBtn) adminTabBtn.style.display = 'none';
        
        const adminView = document.getElementById('view-admin');
        if (adminView && adminView.classList.contains('active')) {
            switchTab('view-gacha', false);
        }
    }
}

// ------------------------------------------
// 🎁 共有ガチャ受信 (重複スキップ & 通信エラー対策版)
// ------------------------------------------
async function checkSurpriseShare() {
    const urlParams = new URLSearchParams(window.location.search);
    const surpriseId = urlParams.get('surprise');
    const apiParam = urlParams.get('api');
    const activeGasUrl = apiParam ? decodeURIComponent(apiParam) : GAS_URL;

    if (!surpriseId) return;

    // 💡 すでに同じ共有IDのガチャを受け取り済みかチェック（スキップ処理）
    const alreadyImported = state.gachas.find(g => g.shareId === surpriseId || g.id === 'imported_' + surpriseId);
    
    if (alreadyImported) {
        state.currentGachaId = alreadyImported.id;
        state.isGuestMode = true;
        await saveLocal();
        
        // URLパラメータを綺麗に消去
        window.history.replaceState({}, document.title, window.location.pathname);
        
        applyGuestModeUI();
        renderGachaSelectors();
        switchTab('view-gacha', false);
        renderGachaScreen();
        return;
    }

    if (!activeGasUrl) return;

    try {
        const res = await fetch(`${activeGasUrl}?action=getShare&shareId=${surpriseId}`, {
            method: 'GET',
            redirect: 'follow'
        });
        
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

        const result = await res.json();
        const importedGacha = result.data;

        if (result.status === "success" && importedGacha) {
            openAppModal('modal-surprise');
            
            const openBtn = document.getElementById('btn-surprise-open');
            if (openBtn) {
                openBtn.onclick = async () => {
                    vibrate();
                    
                    const newId = 'imported_' + surpriseId;
                    importedGacha.id = newId;
                    importedGacha.shareId = surpriseId;
                    importedGacha.isLocked = true;
                    
                    state.isGuestMode = true; 
                    
                    const existingIdx = state.gachas.findIndex(g => g.id === newId);
                    if (existingIdx >= 0) {
                        state.gachas[existingIdx] = importedGacha;
                    } else {
                        state.gachas.push(importedGacha);
                    }

                    state.currentGachaId = newId; 
                    state.stones = (state.stones || 0) + 10000; // 初回プレゼント
                    
                    await saveLocal(); 
                    
                    closeAppModal('modal-surprise');
                    window.history.replaceState({}, document.title, window.location.pathname);
                    
                    applyGuestModeUI();
                    renderGachaSelectors(); 
                    switchTab('view-gacha', false);
                    renderGachaScreen();
                    
                    setTimeout(() => {
                        fireConfetti({ particleCount: 120, spread: 100, origin: { y: 0.6 } });
                        vibrate();
                    }, 100);

                    setTimeout(() => {
                        alert(`✨ ガチャ「${importedGacha.title}」を受け取りました！\n💎 石10,000個をプレゼント！`);
                    }, 400);
                };
            }
        } else {
            alert("⚠️ 共有データの取得に失敗したか、期限切れです。");
        }
    } catch(e) {
        console.error("共有ガチャ受信エラー:", e);
        alert("⚠️ ネットワークエラー等により共有ガチャが受け取れませんでした。");
    }
}

// ------------------------------------------
// 📤 共有データ送信（CORSエラー回避版）
// ------------------------------------------
async function shareGachaData(shareId, gachaData) {
    if (!GAS_URL) {
        alert("⚠️ GASのURLを設定してください。");
        return null;
    }

    const payload = {
        action: 'saveShare',
        shareId: shareId,
        gachaData: gachaData
    };

    try {
        // text/plain で送信することで CORS プリフライト(OPTIONS)を回避
        const res = await fetch(GAS_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error("シェア送信エラー:", e);
        throw e;
    }
}

// ------------------------------------------
// 🏛️ 天井交換モーダル（アスペクト比維持 & レイアウト固定）
// ------------------------------------------
function openCeilingModal() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;
    const pt = state.mileage[currentGacha.id] || 0;
    
    const container = document.getElementById('ceiling-list-container');
    if (!container) return;
    container.innerHTML = '';

    const inv = state.inventory[currentGacha.id] || {};
    const rarityOrder = ['SLR', 'LR', 'LE', 'UR', 'SSR', 'SR', 'R', 'N', 'C'];

    const sortedCards = [...currentGacha.cards].sort((a, b) => {
        let indexA = rarityOrder.indexOf(a.rarity);
        let indexB = rarityOrder.indexOf(b.rarity);
        if (indexA === -1) indexA = 99;
        if (indexB === -1) indexB = 99;
        return indexA - indexB;
    });

    sortedCards.forEach(card => {
        const count = inv[card.id] || 0;
        const isAcquired = count > 0;

        const displayName = isAcquired ? escapeHTML(card.name) : "？？？";
        const displayImg = isAcquired ? escapeHTML(card.img) : FALLBACK_IMG;

        const div = document.createElement('div');
        div.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border:1px solid rgba(0,0,0,0.1); border-radius:8px; margin-bottom:8px; height:60px; box-sizing:border-box; background:var(--panel-bg, #fff);";
        
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                <div style="width:44px; height:44px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.03); border-radius:6px; overflow:hidden;">
                    <img src="${displayImg}" style="max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'">
                </div>
                <div style="min-width:0; flex:1;">
                    <span style="font-size:10px; font-weight:bold; background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:4px; display:inline-block; margin-bottom:2px;">${escapeHTML(card.rarity)}</span>
                    <div style="font-size:12px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayName}</div>
                </div>
            </div>
            <button class="btn btn-outline" style="flex-shrink:0; margin-left:8px; font-size:11px; padding:6px 12px;" ${pt < 5000 ? 'disabled' : ''} onclick="exchangeCeilingCard('${card.id}')">交換 (5000pt)</button>
        `;
        container.appendChild(div);
    });
    openAppModal('modal-ceiling');
}

// ------------------------------------------
// 🎰 天井カード交換実行処理
// ------------------------------------------
async function exchangeCeilingCard(cardId) {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;

    const pt = state.mileage[currentGacha.id] || 0;
    if (pt < 5000) {
        alert("⚠️ 天井ポイントが足りません (5,000pt必要)");
        return;
    }

    const card = currentGacha.cards.find(c => c.id === cardId);
    if (!card) return;

    if (!confirm(`✨ 5000ptを消費して「${card.name}」と交換しますか？`)) return;

    // マイレージ減算 & カード付与
    state.mileage[currentGacha.id] -= 5000;
    
    if (!state.inventory[currentGacha.id]) {
        state.inventory[currentGacha.id] = {};
    }
    state.inventory[currentGacha.id][cardId] = (state.inventory[currentGacha.id][cardId] || 0) + 1;

    await saveLocal();

    vibrate();
    closeAppModal('modal-ceiling');
    renderGachaScreen();
    updateUI();

    setTimeout(() => {
        alert(`🎉 「${card.name}」を獲得しました！`);
    }, 200);
}

// ------------------------------------------
// 🛠️ UIレンダリング & 画面制御
// ------------------------------------------
function renderGachaSelectors() {
    const container = document.getElementById('gacha-selector-container');
    if (!container) return;
    container.innerHTML = '';

    state.gachas.forEach(g => {
        const btn = document.createElement('button');
        btn.className = `btn ${g.id === state.currentGachaId ? 'btn-primary' : 'btn-outline'}`;
        btn.style.marginRight = '8px';
        btn.style.marginBottom = '8px';
        btn.textContent = g.title;
        btn.onclick = () => {
            state.currentGachaId = g.id;
            saveLocal();
            applyGuestModeUI();
            renderGachaSelectors();
            renderGachaScreen();
        };
        container.appendChild(btn);
    });
}

function renderGachaScreen() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const titleElem = document.getElementById('gacha-title');
    const ptElem = document.getElementById('ceiling-points');

    if (titleElem) {
        titleElem.textContent = currentGacha ? currentGacha.title : 'ガチャを選択してください';
    }

    if (ptElem && currentGacha) {
        const pt = state.mileage[currentGacha.id] || 0;
        ptElem.textContent = pt;
    }
}

function updateUI() {
    const stoneElem = document.getElementById('user-stones');
    if (stoneElem) stoneElem.textContent = (state.stones || 0).toLocaleString();
    
    const loginElem = document.getElementById('user-login-days');
    if (loginElem) loginElem.textContent = state.loginDays || 1;
}

function switchTab(viewId, checkGuest = true) {
    if (checkGuest && viewId === 'view-admin') {
        const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
        if (state.isGuestMode || (currentGacha && currentGacha.isLocked)) return;
    }
    
    document.querySelectorAll('.view-screen').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.getElementById('nav-' + viewId);
    if (navBtn) navBtn.classList.add('active');
}

function openAppModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
}

function closeAppModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function vibrate() {
    if (navigator.vibrate) navigator.vibrate(15);
}
