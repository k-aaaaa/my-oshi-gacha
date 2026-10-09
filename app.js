// ==========================================
// PWA Gacha Maker - Full Logic Code
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

// 一時作業用カードリスト（ガチャ作成画面用）
let adminTempCards = [];

// レアリティの重み定義
const RARITY_WEIGHTS = {
    'SLR': 0.1,
    'LR': 0.5,
    'LE': 1.0,
    'UR': 3.0,
    'SSR': 5.0,
    'SR': 15.0,
    'R': 30.0,
    'N': 45.4
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
// 🚀 アプリ初期化
// ------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    // 1. URLパラメータに surprise がある場合はゲストモード準備
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('surprise')) {
        state.isGuestMode = true;
        applyGuestModeUI();
    }

    // 2. ローカルストレージ復元
    await loadLocal();

    // 3. デフォルトガチャの初期生成（初回起動時のみ）
    if (!state.gachas || state.gachas.length === 0) {
        initDefaultGacha();
    }

    // 4. ログインボーナスチェック
    checkLoginBonus();

    // 5. サプライズシェア受信確認
    await checkSurpriseShare();

    // 6. UI初期表示
    applyGuestModeUI();
    renderGachaSelectors();
    renderGachaScreen();
    renderAdminCardList();
    updateUI();
});

function initDefaultGacha() {
    const defaultGacha = {
        id: 'default_sample',
        title: 'サンプルガチャ',
        cards: [
            { id: 'c1', name: '伝説のドラゴン', rarity: 'SLR', img: FALLBACK_IMG },
            { id: 'c2', name: '大魔導士', rarity: 'SSR', img: FALLBACK_IMG },
            { id: 'c3', name: '見習い騎士', rarity: 'SR', img: FALLBACK_IMG },
            { id: 'c4', name: 'スライム', rarity: 'N', img: FALLBACK_IMG }
        ]
    };
    state.gachas = [defaultGacha];
    state.currentGachaId = 'default_sample';
    saveLocal();
}

// ログインボーナス処理
function checkLoginBonus() {
    const today = new Date().toLocaleDateString();
    if (state.lastLoginDate !== today) {
        state.lastLoginDate = today;
        state.loginDays = (state.loginDays || 0) + 1;
        state.stones = (state.stones || 0) + 1000;
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
    } else {
        const adminTabBtn = document.getElementById('tab-btn-admin');
        if (adminTabBtn) adminTabBtn.style.display = 'block';
    }
}

// ------------------------------------------
// 🎁 共有ガチャ受信 (重複自動スキップ & CORSエラー対策)
// ------------------------------------------
async function checkSurpriseShare() {
    const urlParams = new URLSearchParams(window.location.search);
    const surpriseId = urlParams.get('surprise');
    const apiParam = urlParams.get('api');
    const activeGasUrl = apiParam ? decodeURIComponent(apiParam) : GAS_URL;

    if (!surpriseId) return;

    // すでに同じ共有IDのガチャを受け取り済みかチェック（自動スキップ）
    const alreadyImported = state.gachas.find(g => g.shareId === surpriseId || g.id === 'imported_' + surpriseId);
    
    if (alreadyImported) {
        state.currentGachaId = alreadyImported.id;
        state.isGuestMode = true;
        await saveLocal();
        
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
                    state.stones = (state.stones || 0) + 10000;
                    
                    await saveLocal(); 
                    
                    closeAppModal('modal-surprise');
                    window.history.replaceState({}, document.title, window.location.pathname);
                    
                    applyGuestModeUI();
                    renderGachaSelectors(); 
                    switchTab('view-gacha', false);
                    renderGachaScreen();
                    
                    setTimeout(() => {
                        if (typeof fireConfetti === 'function') {
                            fireConfetti({ particleCount: 120, spread: 100, origin: { y: 0.6 } });
                        }
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
    if (!GAS_URL || GAS_URL.includes("YOUR_GAS_WEB_APP_URL_HERE")) {
        alert("⚠️ GASのURLが設定されていません。`app.js` の GAS_URL を設定してください。");
        return null;
    }

    const payload = {
        action: 'saveShare',
        shareId: shareId,
        gachaData: gachaData
    };

    try {
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
// 🎰 ガチャ実行処理 (1回 / 10連)
// ------------------------------------------
async function playGacha(count) {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha || !currentGacha.cards || currentGacha.cards.length === 0) {
        alert("⚠️ ガチャにカードが登録されていません。");
        return;
    }

    const cost = count * 100;
    if ((state.stones || 0) < cost) {
        alert(`⚠️ 所持石が足りません！（必要: ${cost}個）`);
        return;
    }

    // 消費とマイレージ（天井pt）加算
    state.stones -= cost;
    state.mileage[currentGacha.id] = (state.mileage[currentGacha.id] || 0) + (count * 100);

    const results = [];
    for (let i = 0; i < count; i++) {
        const card = drawOneCard(currentGacha.cards);
        results.push(card);

        // インベントリ登録
        if (!state.inventory[currentGacha.id]) {
            state.inventory[currentGacha.id] = {};
        }
        state.inventory[currentGacha.id][card.id] = (state.inventory[currentGacha.id][card.id] || 0) + 1;
    }

    await saveLocal();
    updateUI();
    renderGachaScreen();

    // 結果表示モーダル
    showGachaResultModal(results);
}

// 重み付き抽選ロジック
function drawOneCard(cards) {
    let totalWeight = 0;
    const weightedCards = cards.map(c => {
        const w = RARITY_WEIGHTS[c.rarity] || 10.0;
        totalWeight += w;
        return { card: c, weight: w };
    });

    let rand = Math.random() * totalWeight;
    for (const item of weightedCards) {
        if (rand < item.weight) {
            return item.card;
        }
        rand -= item.weight;
    }
    return cards[cards.length - 1];
}

// ガチャ結果表示
function showGachaResultModal(results) {
    const container = document.getElementById('gacha-result-container');
    if (!container) return;
    container.innerHTML = '';

    results.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.style.cssText = "display:inline-block; margin:6px; text-align:center; width:80px;";
        cardDiv.innerHTML = `
            <div style="width:70px; height:70px; margin:0 auto; background:rgba(0,0,0,0.05); border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                <img src="${escapeHTML(card.img || FALLBACK_IMG)}" style="max-width:100%; max-height:100%; object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'">
            </div>
            <div style="font-size:10px; font-weight:bold; margin-top:2px;">${escapeHTML(card.rarity)}</div>
            <div style="font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(card.name)}</div>
        `;
        container.appendChild(cardDiv);
    });

    vibrate();
    openAppModal('modal-result');
}

// ------------------------------------------
// 🏛️ 天井交換モーダル（縦横比維持 & レイアウト固定）
// ------------------------------------------
function openCeilingModal() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;
    const pt = state.mileage[currentGacha.id] || 0;
    
    const container = document.getElementById('ceiling-list-container');
    if (!container) return;
    container.innerHTML = '';

    const inv = state.inventory[currentGacha.id] || {};
    const rarityOrder = ['SLR', 'LR', 'LE', 'UR', 'SSR', 'SR', 'R', 'N'];

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
// 📖 図鑑（コレクション）機能
// ------------------------------------------
function renderCollection() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const container = document.getElementById('collection-container');
    if (!container) return;
    container.innerHTML = '';

    if (!currentGacha) {
        container.innerHTML = '<p style="text-align:center; color:#999;">ガチャを選択してください</p>';
        return;
    }

    const inv = state.inventory[currentGacha.id] || {};

    currentGacha.cards.forEach(card => {
        const count = inv[card.id] || 0;
        const isAcquired = count > 0;

        const cardDiv = document.createElement('div');
        cardDiv.style.cssText = `display:inline-block; margin:8px; text-align:center; width:90px; padding:8px; border-radius:8px; background:${isAcquired ? '#fff' : '#eee'}; opacity:${isAcquired ? '1' : '0.5'}; border:1px solid #ddd;`;
        
        cardDiv.innerHTML = `
            <div style="width:74px; height:74px; margin:0 auto; background:rgba(0,0,0,0.03); border-radius:6px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                <img src="${isAcquired ? escapeHTML(card.img || FALLBACK_IMG) : FALLBACK_IMG}" style="max-width:100%; max-height:100%; object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'">
            </div>
            <div style="font-size:10px; font-weight:bold; margin-top:4px;">${escapeHTML(card.rarity)}</div>
            <div style="font-size:11px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${isAcquired ? escapeHTML(card.name) : '？？？'}</div>
            <div style="font-size:10px; color:#666;">所持: ${count}</div>
        `;
        container.appendChild(cardDiv);
    });
}

// ------------------------------------------
// 🛠️ ガチャ作成・管理機能 (Admin)
// ------------------------------------------
function addCardToTempList() {
    const nameInput = document.getElementById('admin-card-name');
    const rarityInput = document.getElementById('admin-card-rarity');
    const imgInput = document.getElementById('admin-card-img');

    if (!nameInput || !nameInput.value.trim()) {
        alert("⚠️ カード名を入力してください。");
        return;
    }

    const newCard = {
        id: 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: nameInput.value.trim(),
        rarity: rarityInput ? rarityInput.value : 'N',
        img: (imgInput && imgInput.value.trim()) ? imgInput.value.trim() : FALLBACK_IMG
    };

    adminTempCards.push(newCard);
    
    // 入力欄クリア
    nameInput.value = '';
    if (imgInput) imgInput.value = '';

    renderAdminCardList();
}

function renderAdminCardList() {
    const container = document.getElementById('admin-card-list');
    if (!container) return;
    container.innerHTML = '';

    adminTempCards.forEach((card, idx) => {
        const div = document.createElement('div');
        div.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:6px 10px; border-bottom:1px solid #eee;";
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <img src="${escapeHTML(card.img)}" style="width:30px; height:30px; object-fit:contain;">
                <span>[${escapeHTML(card.rarity)}] ${escapeHTML(card.name)}</span>
            </div>
            <button class="btn btn-danger" style="padding:2px 6px; font-size:10px;" onclick="removeTempCard(${idx})">削除</button>
        `;
        container.appendChild(div);
    });
}

function removeTempCard(idx) {
    adminTempCards.splice(idx, 1);
    renderAdminCardList();
}

async function saveNewGacha() {
    const titleInput = document.getElementById('admin-gacha-title');
    if (!titleInput || !titleInput.value.trim()) {
        alert("⚠️ ガチャタイトルを入力してください。");
        return;
    }

    if (adminTempCards.length === 0) {
        alert("⚠️ カードを少なくとも1枚追加してください。");
        return;
    }

    const newGacha = {
        id: 'gacha_' + Date.now(),
        title: titleInput.value.trim(),
        cards: [...adminTempCards]
    };

    state.gachas.push(newGacha);
    state.currentGachaId = newGacha.id;
    
    // クリア
    titleInput.value = '';
    adminTempCards = [];
    renderAdminCardList();

    await saveLocal();

    applyGuestModeUI();
    renderGachaSelectors();
    renderGachaScreen();
    switchTab('view-gacha', false);

    alert("✨ 新しいガチャを作成しました！");
}

// 画像ファイル選択＆Driveアップロード
async function handleImageUpload(fileInputId, targetInputId) {
    const fileInput = document.getElementById(fileInputId);
    const targetInput = document.getElementById(targetInputId);

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        const base64Data = e.target.result;
        
        // ローディング表示
        if (targetInput) targetInput.value = "アップロード中...";

        try {
            const payload = {
                action: 'uploadImage',
                file: base64Data,
                filename: file.name
            };

            const res = await fetch(GAS_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            const result = await res.json();
            if (result.status === 'success' && result.url) {
                if (targetInput) targetInput.value = result.url;
                alert("✅ 画像のアップロードが完了しました！");
            } else {
                throw new Error(result.message || "Upload failed");
            }
        } catch (err) {
            console.error("Upload error:", err);
            // 失敗時はBase64をフォールバック設定
            if (targetInput) targetInput.value = base64Data;
            alert("⚠️ オンライン保存に失敗したため、ローカル画像として読み込みました。");
        }
    };

    reader.readAsDataURL(file);
}

// ガチャ共有リンク発行
async function exportCurrentGachaShare() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;

    const shareId = 'share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    try {
        const res = await shareGachaData(shareId, currentGacha);
        if (res && res.status === 'success') {
            const shareUrl = `${window.location.origin}${window.location.pathname}?surprise=${shareId}`;
            
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(shareUrl);
                alert(`✨ 共有URLを発行してクリップボードにコピーしました！\n\n${shareUrl}`);
            } else {
                prompt("✨ 以下の共有URLをコピーしてシェアしてください:", shareUrl);
            }
        } else {
            throw new Error("Failed to save share");
        }
    } catch (e) {
        alert("⚠️ 共有URLの発行に失敗しました。GASの設定を確認してください。");
    }
}

// ------------------------------------------
// 🛠️ 画面制御 & ユーティリティ
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

    renderCollection();
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
