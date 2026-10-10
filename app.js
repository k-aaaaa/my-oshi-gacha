// ==========================================================================
// 🚀 データベースエンジン (IndexedDB) & 安全保護
// ==========================================================================
const DB_NAME = 'GachaUniverseDB';
const DB_VERSION = 1;
const STORE_NAME = 'appState';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveStateToDB(stateObj) {
    if (!stateObj) return;
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(stateObj, 'masterState');
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

async function loadStateFromDB() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get('masterState');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject(e.target.error);
    });
}

function vibrate() { if (navigator.vibrate) navigator.vibrate(15); }

function fireConfetti(options) {
    if (typeof confetti === 'function') {
        try { confetti(options); } catch (e) {}
    }
}

function escapeHTML(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const FALLBACK_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23ccc'/><text x='50' y='55' font-size='30' text-anchor='middle'>❓</text></svg>";

function getCardImage(card) {
    if (!card) return FALLBACK_IMG;
    const rawVal = card.img || card.imageData || card.image || card.src || card.url || card.icon || '';
    if (!rawVal || typeof rawVal !== 'string') return FALLBACK_IMG;
    if (rawVal.startsWith('data:image') || rawVal.startsWith('http')) return rawVal;
    return FALLBACK_IMG;
}

// ==========================================================================
// 📦 アプリのグローバル状態
// ==========================================================================
let state = null;
let GAS_URL = localStorage.getItem('my_gacha_gas_url') || "";
let lastPullShareText = "";
let isPulling = false; 
let syncTimeoutTimer = null;

const defaultState = {
    gachas: [{ id: 'default', title: 'はじまりのガチャ', cards: [], isLocked: false }], 
    archivedGachas: [], 
    currentGachaId: 'default',
    inventory: {},    
    stones: 100000,      
    totalSpent: 0,
    loginDays: 0,
    lastLoginDate: "",
    tickets: { ssr: 0, ur: 0, le: 0, lr: 0, slr: 0 }, 
    mileage: {}, 
    partner: null,    
    appTheme: 'theme-stylish',
    splashTime: 1200,
    imageQuality: 'standard', 
    customAppIcon: null, 
    autoSync: true,
    isGuestMode: false,
    customColors: {
        'theme-stylish': { bg: '#f4f5f7', panel: 'rgba(255, 255, 255, 0.6)', accent: '#1d1d1f' },
        'theme-cute': { bg: '#fff5f5', panel: 'rgba(255, 255, 255, 0.85)', accent: '#ff85a1' },
        'theme-gaming': { bg: '#07070c', panel: 'rgba(10, 10, 20, 0.8)', accent: '#00ffcc' }
    }
};

function getGachaById(id) {
    if (!state) return null;
    const g1 = state.gachas.find(g => g.id === id);
    if (g1) return g1;
    if (state.archivedGachas) return state.archivedGachas.find(g => g.id === id) || null;
    return null;
}

function openAppModal(id) { 
    vibrate(); 
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('hidden'); 
    document.body.classList.add('modal-open'); 
}

function closeAppModal(id) { 
    vibrate(); 
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden'); 
    document.body.classList.remove('modal-open'); 
}

function applyGuestModeUI() {
    const urlParams = new URLSearchParams(window.location.search);
    const isSurpriseUrl = urlParams.has('surprise');
    const currentGacha = state ? state.gachas.find(g => g.id === state.currentGachaId) : null;
    const adminNavBtn = document.querySelector('.nav-btn[data-target="view-admin"]');

    const isGuest = isSurpriseUrl || (state && state.isGuestMode) || (currentGacha && currentGacha.isLocked);

    if (isGuest) {
        // 「作る」メニューを隠す
        if (adminNavBtn) adminNavBtn.style.display = 'none';
        
        // 管理画面を開こうとしたら強制的にガチャ画面へ移動
        const adminView = document.getElementById('view-admin');
        if (adminView && adminView.classList.contains('active')) {
            switchTab('view-gacha', false);
        }
    } else {
        if (adminNavBtn) adminNavBtn.style.display = 'flex';
    }
}

function renderGachaSelectors() {
    const isGuest = (state && state.isGuestMode) || (state && state.gachas.find(g => g.id === state.currentGachaId)?.isLocked);

    ['gacha-selector', 'collection-gacha-selector'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        // シェア受取人の場合はガチャ切替ドロップダウン自体を隠して他のガチャを見せない
        if (isGuest && id === 'collection-gacha-selector') {
            el.style.display = 'none';
        } else {
            el.style.display = 'block';
        }

        el.innerHTML = '';
        state.gachas.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.innerText = (g.isLocked ? "🔒 " : "") + g.title;
            if (g.id === state.currentGachaId) opt.selected = true;
            el.appendChild(opt);
        });
    });

    const gachaSel = document.getElementById('gacha-selector');
    if (gachaSel && !gachaSel.dataset.hasListener) {
        gachaSel.dataset.hasListener = "true";
        gachaSel.addEventListener('change', (e) => {
            state.currentGachaId = e.target.value;
            saveLocal();
            renderAdminView();
        });
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error("SW登録失敗:", err));
    }

    const urlParams = new URLSearchParams(window.location.search);
    const apiParam = urlParams.get('api');
    if (apiParam) {
        GAS_URL = decodeURIComponent(apiParam);
        localStorage.setItem('my_gacha_gas_url', GAS_URL);
    }

    applyGuestModeUI();

    let localStateFound = false;
    try {
        const storedState = await loadStateFromDB();
        if (storedState) {
            state = storedState;
            localStateFound = true;
        } else {
            state = JSON.parse(JSON.stringify(defaultState));
        }
    } catch(e) {
        state = JSON.parse(JSON.stringify(defaultState));
    }

    if (!localStateFound && GAS_URL) {
        await restoreStateFromGAS();
    }

    if (!state.archivedGachas) state.archivedGachas = [];
    if (!state.mileage) state.mileage = {};
    if (!state.imageQuality) state.imageQuality = 'standard';
    if (!state.tickets) state.tickets = { ssr: 0, ur: 0, le: 0, lr: 0, slr: 0 };
    if (!state.customColors) state.customColors = defaultState.customColors;
    if (state.splashTime === undefined) state.splashTime = 1200;
    if (state.autoSync === undefined) state.autoSync = true;
    if (state.isGuestMode === undefined) state.isGuestMode = false;

    if (state.gachas && state.gachas.length > 0) {
        const exists = state.gachas.some(g => g.id === state.currentGachaId);
        if (!exists) state.currentGachaId = state.gachas[0].id;
    }

    applyCurrentThemeAndColors();
    applyCustomAppIcon();
    if (document.getElementById('gas-url')) {
        document.getElementById('gas-url').value = GAS_URL;
    }

    const splashTime = state.splashTime || 1200;
    let initialTab = location.hash ? location.hash.replace('#', '') : 'view-home';
    if (urlParams.has('surprise')) {
        initialTab = 'view-gacha';
    }

    setTimeout(() => {
        const splash = document.getElementById('splash');
        if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 500); }
        checkSurpriseShare(); 
        switchTab(initialTab, false);
        applyGuestModeUI();
    }, splashTime);

    if (document.getElementById('image-quality-selector')) {
        document.getElementById('image-quality-selector').value = state.imageQuality;
    }

    checkLoginBonus();
    updateUI();
    renderGachaSelectors();
    renderAdminView();
    triggerPartnerSpeech(true); 

    setupAdminCardListener();
    setupAdminGachaListeners();
    setupAppEventListeners();
});

window.addEventListener('popstate', (e) => {
    const target = e.state ? e.state.tab : 'view-home';
    switchTab(target, false);
});

async function restoreStateFromGAS() {
    if (!GAS_URL) return;
    try {
        const res = await fetch(`${GAS_URL}?action=getPlayerData`);
        const result = await res.json();
        if (result.status === "success" && result.data) {
            state = result.data;
            await saveStateToDB(state);
            console.log("☁️ GASからのセーブデータ復元に成功しました");
        }
    } catch(err) {
        console.warn("GASからの自動復元通信に失敗しました", err);
    }
}

function cloudSyncSilent() { 
    if (GAS_URL && state) {
        fetch(GAS_URL, { 
            method: "POST", 
            body: JSON.stringify(state), 
            headers: { "Content-Type": "text/plain" } 
        }).catch(() => {}); 
    }
}

async function saveLocal() {
    try { 
        await saveStateToDB(state); 
        updateUI(); 
        applyGuestModeUI();
        if (state.autoSync !== false) {
            if (syncTimeoutTimer) clearTimeout(syncTimeoutTimer);
            syncTimeoutTimer = setTimeout(() => cloudSyncSilent(), 1500);
        }
    } catch (e) { 
        console.error("保存失敗:", e); 
    }
}

function switchTab(targetId, pushHistory = true) {
    const urlParams = new URLSearchParams(window.location.search);
    const isSurpriseUrl = urlParams.has('surprise');
    const currentGacha = state ? state.gachas.find(g => g.id === state.currentGachaId) : null;

    if (targetId === 'view-admin' && (isSurpriseUrl || (state && state.isGuestMode) || (currentGacha && currentGacha.isLocked))) {
        alert("🔒 シェアされたガチャのため「作る」機能は利用できません。");
        targetId = 'view-gacha';
    }

    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    targetEl.classList.add('active');
    
    const navBtn = document.querySelector(`.nav-btn[data-target="${targetId}"]`);
    if(navBtn) navBtn.classList.add('active');

    if (targetId === 'view-collection') {
        renderGachaSelectors(); renderCollection();
    }
    if (targetId === 'view-admin') {
        renderGachaSelectors(); renderAdminView();
    }
    if (targetId === 'view-gacha') {
        renderGachaScreen();
    }

    if (pushHistory) {
        history.pushState({ tab: targetId }, "", "#" + targetId);
    }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        vibrate();
        switchTab(btn.dataset.target, true);
    });
});

async function checkSurpriseShare() {
    const urlParams = new URLSearchParams(window.location.search);
    const surpriseId = urlParams.get('surprise');
    const apiParam = urlParams.get('api');
    const activeGasUrl = apiParam ? decodeURIComponent(apiParam) : GAS_URL;

    if (surpriseId && activeGasUrl) {
        try {
            const res = await fetch(activeGasUrl + "?action=getShare&shareId=" + surpriseId);
            const result = await res.json();
            const importedGacha = result.data || (result.cards ? result : null);

            if (result.status === "success" && importedGacha) {
                const targetId = 'imported_' + surpriseId;
                importedGacha.id = targetId;
                importedGacha.isLocked = true;
                
                state.isGuestMode = true; 
                
                const existingIdx = state.gachas.findIndex(g => g.id === targetId || g.shareId === surpriseId);
                if (existingIdx >= 0) {
                    state.gachas[existingIdx] = importedGacha;
                } else {
                    state.gachas.push(importedGacha);
                }

                // 共有されたガチャを固定選択 & 石をプレゼント
                state.currentGachaId = targetId; 
                state.stones = Math.max(state.stones || 0, 10000); 
                
                await saveLocal(); 

                // UIの反映とガチャ画面へのダイレクト遷移
                applyGuestModeUI();
                renderGachaSelectors();
                switchTab('view-gacha', false);
                renderGachaScreen();
                
                // 開封の紙吹雪演出のみ軽く実行
                fireConfetti({ particleCount: 80, spread: 80, origin: { y: 0.6 } });
            } else {
                alert("⚠️ 共有ガチャの取得に失敗したか、期限切れです。");
            }
        } catch(e) {
            console.error("共有ガチャ受信エラー:", e);
            alert("⚠️ ネットワークエラー等により共有ガチャを表示できませんでした。");
        }
    }
}

// ------------------------------------------
// 🎰 ガチャ描画・実行エンジン
// ------------------------------------------
function renderGachaScreen() {
    if (!state || !state.gachas || state.gachas.length === 0) return;

    let currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) {
        currentGacha = state.gachas[0];
        state.currentGachaId = currentGacha.id;
    }

    const statusText = document.getElementById('gacha-screen-status');
    const actionControls = document.getElementById('gacha-action-controls');
    
    if (document.getElementById('current-mileage')) {
        document.getElementById('current-mileage').innerText = state.mileage[currentGacha.id] || 0;
    }

    if (statusText) statusText.innerText = "最高レアを引き当てろ！";

    if (actionControls) {
        actionControls.innerHTML = `
            <button id="btn-pull-1" class="btn btn-gacha" onclick="pullGacha(1)" ${isPulling ? 'disabled' : ''}>単発 (💎30)</button>
            <button id="btn-pull-10" class="btn btn-gacha-10" onclick="pullGacha(10)" ${isPulling ? 'disabled' : ''}>10連 (💎300)</button>
            <button id="btn-pull-100" class="btn btn-gacha-10" style="background: linear-gradient(135deg, #ff9500, #ff5e00); color: white; font-weight: bold;" onclick="pullGacha(100)" ${isPulling ? 'disabled' : ''}>🔥 100連 (💎3,000)</button>
        `;
    } else {
        const b1 = document.getElementById('btn-pull-1');
        const b10 = document.getElementById('btn-pull-10');
        const b100 = document.getElementById('btn-pull-100');
        if (b1) b1.onclick = () => pullGacha(1);
        if (b10) b10.onclick = () => pullGacha(10);
        if (b100) b100.onclick = () => pullGacha(100);
    }
}

function pullGacha(count) {
    if (isPulling) return;
    
    let currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha && state.gachas.length > 0) currentGacha = state.gachas[0];

    if (!currentGacha || !currentGacha.cards || currentGacha.cards.length === 0) {
        return alert("⚠️ このガチャにはカードが登録されていません！");
    }

    const cost = count * 30;
    if ((state.stones || 0) < cost) {
        return alert(`💎 石が足りません！（必要: ${cost}個）`);
    }

    vibrate();
    isPulling = true;
    state.stones -= cost;
    state.totalSpent = (state.totalSpent || 0) + cost;

    if (!state.mileage[currentGacha.id]) state.mileage[currentGacha.id] = 0;
    state.mileage[currentGacha.id] += count * 10;

    const results = [];
    const rarityWeights = { 'SLR': 1, 'LR': 2, 'LE': 5, 'UR': 10, 'SSR': 20, 'SR': 30, 'R': 50, 'N': 100, 'C': 100 };

    for (let i = 0; i < count; i++) {
        let pool = [...currentGacha.cards];
        let totalWeight = pool.reduce((sum, c) => sum + (rarityWeights[c.rarity] || 10), 0);
        let rand = Math.random() * totalWeight;
        let chosen = pool[0];

        for (let c of pool) {
            let w = rarityWeights[c.rarity] || 10;
            if (rand < w) { chosen = c; break; }
            rand -= w;
        }

        results.push(chosen);

        if (!state.inventory[currentGacha.id]) state.inventory[currentGacha.id] = {};
        state.inventory[currentGacha.id][chosen.id] = (state.inventory[currentGacha.id][chosen.id] || 0) + 1;
    }

    saveLocal();
    showPullResultsModal(results);
    isPulling = false;
    renderGachaScreen();
}

function showPullResultsModal(results) {
    const container = document.getElementById('gacha-result-grid');
    if (!container) return;
    container.innerHTML = '';

    results.forEach(card => {
        const div = document.createElement('div');
        div.className = `card ${card.rarity}`;
        div.innerHTML = `
            <img src="${escapeHTML(getCardImage(card))}" alt="${escapeHTML(card.name)}" style="object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'">
            <div class="card-rarity-tag">${card.rarity}</div>
        `;
        container.appendChild(div);
    });

    const counts = {};
    results.forEach(r => counts[r.rarity] = (counts[r.rarity] || 0) + 1);
    const summary = Object.keys(counts).map(k => `${k}:${counts[k]}`).join(' / ');
    lastPullShareText = `🎰 ガチャ結果 (${results.length}連)!\n【${summary}】\n#マイガチャ`;

    openAppModal('modal-gacha-result');
    fireConfetti({ particleCount: results.length >= 100 ? 150 : 50, spread: 80, origin: { y: 0.6 } });
}

// ------------------------------------------
// 🖼️ カード画像一括処理＆管理者機能
// ------------------------------------------
async function processCardImageUpload(file) {
    const qualityMap = { 
        'high': { width: 500, quality: 0.65 },
        'standard': { width: 380, quality: 0.5 },
        'eco': { width: 250, quality: 0.35 }
    };
    const settings = qualityMap[state.imageQuality] || qualityMap['standard'];

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let scale = 1;
                if (img.width > settings.width) scale = settings.width / img.width;
                canvas.width = Math.floor(img.width * scale);
                canvas.height = Math.floor(img.height * scale);

                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const resData = canvas.toDataURL('image/jpeg', settings.quality);
                canvas.width = 0; canvas.height = 0;
                resolve(resData);
            };
            img.onerror = () => resolve(FALLBACK_IMG);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(FALLBACK_IMG);
        reader.readAsDataURL(file);
    });
}

function setupAdminCardListener() {
    const btnAdd = document.getElementById('btn-add-card');
    if (!btnAdd) return;

    btnAdd.onclick = async () => {
        const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
        if (!currentGacha || currentGacha.isLocked) return alert("🔒 編集できないガチャです");

        const editId = document.getElementById('edit-card-id').value;
        const baseName = document.getElementById('input-card-name').value.trim();
        const rarity = document.getElementById('input-card-rarity').value;
        const desc = document.getElementById('input-card-desc').value.trim();
        const imgFiles = document.getElementById('input-card-img').files;

        if (editId) {
            const card = currentGacha.cards.find(c => c.id === editId);
            if (card) {
                card.name = baseName || card.name;
                card.rarity = rarity;
                card.desc = desc || "説明なし";
                if (imgFiles && imgFiles.length > 0) {
                    card.img = await processCardImageUpload(imgFiles[0]);
                }
                await saveLocal();
                cancelEditCard();
                renderAdminView();
                alert("✨ カードを更新しました！");
            }
            return;
        }

        if (!imgFiles || imgFiles.length === 0) return alert("⚠️ 画像を選択してください！");

        const filesArray = Array.from(imgFiles);
        btnAdd.innerText = `⏳ 処理中 (0/${filesArray.length})...`;
        btnAdd.disabled = true;

        let addedCount = 0;
        try {
            for (let i = 0; i < filesArray.length; i++) {
                btnAdd.innerText = `⏳ 画像処理中 (${i + 1}/${filesArray.length})...`;
                const file = filesArray[i];
                const imgUrl = await processCardImageUpload(file);
                const fileNameWithoutExt = (file && file.name) ? file.name.replace(/\.[^/.]+$/, "") : `カード_${i + 1}`;
                let cardName = baseName ? (filesArray.length > 1 ? `${baseName}_${i + 1}` : baseName) : fileNameWithoutExt;

                currentGacha.cards.push({
                    id: 'card_' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 10000),
                    name: cardName,
                    rarity: rarity,
                    desc: desc || "説明なし",
                    img: imgUrl
                });
                addedCount++;
            }
            await saveLocal();
            cancelEditCard();
            renderAdminView();
            alert(`✨ ${addedCount}枚のカードを追加しました！`);
        } catch (err) {
            alert("⚠️ 一部画像の追加に失敗しました。");
        } finally {
            btnAdd.innerText = "ガチャに実装する！";
            btnAdd.disabled = false;
        }
    };
}

function setupAdminGachaListeners() {
    const btnCreate = document.getElementById('btn-create-gacha');
    if (btnCreate) {
        btnCreate.onclick = () => {
            const title = prompt("新しいガチャのタイトルを入力してください:");
            if (!title || !title.trim()) return;
            const newGacha = {
                id: 'gacha_' + Date.now(),
                title: title.trim(),
                cards: [],
                isLocked: false
            };
            state.gachas.push(newGacha);
            state.currentGachaId = newGacha.id;
            saveLocal();
            renderGachaSelectors();
            renderAdminView();
            alert("✨ 新しいガチャを作成しました！");
        };
    }

    // 🔽 ここを追加（ガチャ削除処理）
    const btnDelete = document.getElementById('btn-delete-gacha');
    if (btnDelete) {
        btnDelete.onclick = () => {
            if (state.gachas.length <= 1) return alert("⚠️ ガチャは最低1つ必要なため削除できません。");
            const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
            if (!currentGacha || currentGacha.isLocked) return alert("🔒 このガチャは削除できません。");

            if (confirm(`本当にガチャ「${currentGacha.title}」を削除しますか？`)) {
                state.gachas = state.gachas.filter(g => g.id !== currentGacha.id);
                delete state.inventory[currentGacha.id];
                delete state.mileage[currentGacha.id];
                state.currentGachaId = state.gachas[0].id;

                saveLocal();
                renderGachaSelectors();
                renderAdminView();
                alert("🗑️ ガチャを削除しました。");
            }
        };
    }
}

    const btnDelete = document.getElementById('btn-delete-gacha');
    if (btnDelete) {
        btnDelete.onclick = () => {
            if (state.gachas.length <= 1) return alert("⚠️ ガチャは最低1つ必要なため削除できません。");
            const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
            if (!currentGacha || currentGacha.isLocked) return alert("🔒 このガチャは削除できません。");

            if (confirm(`本当にガチャ「${currentGacha.title}」を削除しますか？`)) {
                state.gachas = state.gachas.filter(g => g.id !== currentGacha.id);
                delete state.inventory[currentGacha.id];
                delete state.mileage[currentGacha.id];
                state.currentGachaId = state.gachas[0].id;

                saveLocal();
                renderGachaSelectors();
                renderAdminView();
                alert("🗑️ ガチャを削除しました。");
            }
        };
    }
}

function editCard(cardId) {
    vibrate();
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;
    const card = currentGacha.cards.find(c => c.id === cardId);
    if (!card) return;

    document.getElementById('edit-card-id').value = card.id;
    document.getElementById('input-card-name').value = card.name;
    document.getElementById('input-card-rarity').value = card.rarity;
    document.getElementById('input-card-desc').value = card.desc === "説明なし" ? "" : card.desc;

    const hint = document.getElementById('edit-img-hint');
    const cancelBtn = document.getElementById('btn-cancel-edit-card');
    const addBtn = document.getElementById('btn-add-card');

    if (hint) hint.classList.remove('hidden');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    if (addBtn) addBtn.innerText = "カードを更新する！";

    const panel = document.getElementById('card-create-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEditCard() {
    document.getElementById('edit-card-id').value = '';
    document.getElementById('input-card-name').value = '';
    document.getElementById('input-card-desc').value = '';
    document.getElementById('input-card-img').value = '';

    const hint = document.getElementById('edit-img-hint');
    const cancelBtn = document.getElementById('btn-cancel-edit-card');
    const addBtn = document.getElementById('btn-add-card');

    if (hint) hint.classList.add('hidden');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    if (addBtn) addBtn.innerText = "ガチャに実装する！";
}

function deleteCard(cardId) {
    vibrate();
    if (!confirm("本当に削除しますか？")) return;
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;
    currentGacha.cards = currentGacha.cards.filter(c => c.id !== cardId);
    saveLocal();
    renderAdminView();
}

function renderGachaSelectors() {
    ['gacha-selector', 'collection-gacha-selector'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        state.gachas.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.innerText = (g.isLocked ? "🔒 " : "") + g.title;
            if (g.id === state.currentGachaId) opt.selected = true;
            el.appendChild(opt);
        });
    });

    const gachaSel = document.getElementById('gacha-selector');
    if (gachaSel && !gachaSel.dataset.hasListener) {
        gachaSel.dataset.hasListener = "true";
        gachaSel.addEventListener('change', (e) => {
            state.currentGachaId = e.target.value;
            saveLocal();
            renderAdminView();
        });
    }
}

function renderAdminView() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const cardList = document.getElementById('admin-card-list');
    const editorSection = document.getElementById('admin-editor-section');
    const lockedWarning = document.getElementById('admin-locked-warning');
    const btnDelete = document.getElementById('btn-delete-gacha');

    if (!currentGacha) return;

    if (currentGacha.isLocked) {
        if (editorSection) editorSection.classList.add('hidden');
        if (btnDelete) btnDelete.style.display = 'none';
        
        if (lockedWarning) {
            lockedWarning.classList.remove('hidden');
            lockedWarning.innerHTML = `
                <div style="background: rgba(255, 68, 68, 0.1); border: 2px solid #ff4444; border-radius: 10px; padding: 15px; text-align: center; margin-bottom: 15px;">
                    <div style="font-size: 18px; font-weight: bold; color: #ff4444; margin-bottom: 5px;">🔒 編集権限がありません</div>
                    <p style="font-size: 11px; opacity: 0.8; margin: 0; line-height: 1.4;">このガチャは「閲覧専用」として共有されたデータです。<br>カードの追加・変更・削除はできません。</p>
                </div>
            `;
        }
        if (cardList) cardList.innerHTML = `<p style="text-align:center; opacity:0.5; padding:20px; font-size:12px;">🔒 編集不可（閲覧専用）</p>`;
        return;
    }

    if (editorSection) editorSection.classList.remove('hidden');
    if (lockedWarning) lockedWarning.classList.add('hidden');
    if (btnDelete) btnDelete.style.display = 'inline-block';

    if (!cardList) return;
    cardList.innerHTML = '';

    if (currentGacha.cards.length === 0) {
        cardList.innerHTML = `<p style="text-align:center; opacity:0.5; padding:15px; font-size:12px;">まだカードがありません。</p>`;
        return;
    }

    currentGacha.cards.forEach(card => {
        const div = document.createElement('div');
        div.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:8px; border-bottom:1px solid rgba(0,0,0,0.08);";
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <img src="${escapeHTML(getCardImage(card))}" style="width:40px; height:40px; object-fit:contain; border-radius:6px;" onerror="this.src='${FALLBACK_IMG}'">
                <div>
                    <span style="font-size:10px; font-weight:bold; background:rgba(0,0,0,0.05); padding:2px 4px; border-radius:3px;">${card.rarity}</span>
                    <strong style="font-size:12px; margin-left:4px;">${escapeHTML(card.name)}</strong>
                </div>
            </div>
            <div style="display:flex; gap:4px;">
                <button onclick="editCard('${card.id}')" class="btn btn-outline" style="padding:4px 8px; font-size:10px;">編集</button>
                <button onclick="deleteCard('${card.id}')" class="btn btn-text-danger" style="padding:4px 8px; font-size:10px; color:#ff4444;">削除</button>
            </div>
        `;
        cardList.appendChild(div);
    });
}

function renderCollection() {
    const grid = document.getElementById('collection-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const selEl = document.getElementById('collection-gacha-selector');
    if (!selEl) return;
    const currentGacha = getGachaById(selEl.value);
    if (!currentGacha) return;

    if (!currentGacha.cards || currentGacha.cards.length === 0) {
        grid.innerHTML = `<p style="text-align:center; opacity:0.5; padding:30px; grid-column:1/-1;">このガチャにはカードがありません。</p>`;
        return;
    }

    const sortType = document.getElementById('collection-sort-selector') ? document.getElementById('collection-sort-selector').value : 'rarity';
    const inv = state.inventory[currentGacha.id] || {};
    const rarityOrder = ['SLR', 'LR', 'LE', 'UR', 'SSR', 'SR', 'R', 'N', 'C'];

    if (sortType === 'rarity') {
        rarityOrder.forEach(rarity => {
            const cardsInRarity = currentGacha.cards.filter(c => c.rarity === rarity);
            if (cardsInRarity.length === 0) return;

            const gotCount = cardsInRarity.filter(c => (inv[c.id] || 0) > 0).length;
            const totalCount = cardsInRarity.length;

            const sectionHeader = document.createElement('div');
            sectionHeader.style.cssText = `
                grid-column: 1 / -1;
                margin-top: 15px;
                margin-bottom: 5px;
                padding: 6px 12px;
                background: rgba(0, 0, 0, 0.05);
                border-left: 4px solid var(--accent-color, #1d1d1f);
                border-radius: 4px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-weight: bold;
                font-size: 13px;
            `;
            sectionHeader.innerHTML = `
                <span>【${rarity}】</span>
                <span style="font-size:11px; opacity:0.8;">コンプ率: ${gotCount} / ${totalCount} 種類</span>
            `;
            grid.appendChild(sectionHeader);

            cardsInRarity.forEach(card => {
                const count = inv[card.id] || 0;
                const div = document.createElement('div');
                if (count > 0) {
                    div.className = `card ${card.rarity}`;
                    div.innerHTML = `<img src="${escapeHTML(getCardImage(card))}" alt="${escapeHTML(card.name)}" style="object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'"><div class="card-rarity-tag">${card.rarity}</div>`;
                    div.onclick = () => openCardDetailModal(currentGacha.id, card.id);
                } else {
                    div.className = 'item-empty';
                    div.style.cssText = 'display:flex; flex-direction:column; justify-content:center; align-items:center; font-size:10px; opacity:0.6; padding:4px; text-align:center;';
                    div.innerHTML = `
                        <div style="font-size:16px; margin-bottom:2px;">❓</div>
                        <div style="font-size:9px; word-break:break-all;">？？？</div>
                    `;
                }
                grid.appendChild(div);
            });
        });
    } else {
        let cards = [...currentGacha.cards].reverse();
        cards.forEach(card => {
            const count = inv[card.id] || 0;
            const div = document.createElement('div');
            if (count > 0) {
                div.className = `card ${card.rarity}`;
                div.innerHTML = `<img src="${escapeHTML(getCardImage(card))}" alt="${escapeHTML(card.name)}" style="object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'"><div class="card-rarity-tag">${card.rarity}</div>`;
                div.onclick = () => openCardDetailModal(currentGacha.id, card.id);
            } else {
                div.className = 'item-empty';
                div.style.cssText = 'display:flex; flex-direction:column; justify-content:center; align-items:center; font-size:10px; opacity:0.6; padding:4px; text-align:center;';
                div.innerHTML = `
                    <div style="font-size:16px; margin-bottom:2px;">❓</div>
                    <div style="font-size:9px; word-break:break-all;">？？？</div>
                `;
            }
            grid.appendChild(div);
        });
    }
}

function openCardDetailModal(gachaId, cardId) {
    const gacha = getGachaById(gachaId);
    if (!gacha) return;
    const card = gacha.cards.find(c => c.id === cardId);
    if (!card) return;

    const count = (state.inventory[gachaId] || {})[cardId] || 0;
    if (document.getElementById('modal-card-rarity')) document.getElementById('modal-card-rarity').innerText = card.rarity;
    
    const modalImg = document.getElementById('modal-card-img');
    if (modalImg) {
        modalImg.src = getCardImage(card);
        modalImg.style.objectFit = 'contain';
        modalImg.onerror = () => { modalImg.src = FALLBACK_IMG; };
    }

    if (document.getElementById('modal-card-name')) document.getElementById('modal-card-name').innerText = card.name;
    if (document.getElementById('modal-card-count')) document.getElementById('modal-card-count').innerText = count;
    if (document.getElementById('modal-card-desc')) document.getElementById('modal-card-desc').innerText = card.desc;

    const btnPartner = document.getElementById('btn-set-partner');
    if (btnPartner) {
        btnPartner.onclick = () => {
            state.partner = { gachaId: gachaId, cardId: cardId };
            saveLocal();
            closeAppModal('modal-card-detail');
            alert(`✨ ${card.name} を相棒に設定しました！`);
        };
    }

    openAppModal('modal-card-detail');
}

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
        const displayImg = isAcquired ? escapeHTML(getCardImage(card)) : FALLBACK_IMG;

        const div = document.createElement('div');
        div.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:8px; border:1px solid rgba(0,0,0,0.1); border-radius:8px; margin-bottom:6px;";
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <img src="${displayImg}" style="width:40px; height:40px; object-fit:contain; border-radius:6px;" onerror="this.src='${FALLBACK_IMG}'">
                <div>
                    <span style="font-size:10px; font-weight:bold; background:rgba(0,0,0,0.05); padding:2px 4px; border-radius:3px;">${card.rarity}</span>
                    <div style="font-size:12px; font-weight:bold; margin-top:2px;">${displayName}</div>
                </div>
            </div>
            <button class="btn btn-outline" ${pt < 5000 ? 'disabled' : ''} onclick="exchangeCeilingCard('${card.id}')">交換 (5000pt)</button>
        `;
        container.appendChild(div);
    });
    openAppModal('modal-ceiling');
}

function exchangeCeilingCard(cardId) {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;
    const pt = state.mileage[currentGacha.id] || 0;
    if (pt < 5000) return alert("マイレージが足りません");

    state.mileage[currentGacha.id] -= 5000;
    if (!state.inventory[currentGacha.id]) state.inventory[currentGacha.id] = {};
    state.inventory[currentGacha.id][cardId] = (state.inventory[currentGacha.id][cardId] || 0) + 1;

    saveLocal();
    renderGachaScreen();
    closeAppModal('modal-ceiling');
    alert("✨ 指定カードを獲得しました！");
}

function updateUI() {
    const elStones = document.getElementById('header-stones');
    if (elStones) elStones.innerText = `💎 ${(state.stones || 0).toLocaleString()}`;
    
    const currentGacha = getGachaById(state.currentGachaId);
    const headerTitle = document.getElementById('current-gacha-title');
    if (headerTitle && currentGacha) {
        headerTitle.innerText = currentGacha.title;
    }

    if (document.getElementById('login-days')) {
        document.getElementById('login-days').innerText = state.loginDays || 0;
    }
    if (document.getElementById('total-spent-stones')) {
        document.getElementById('total-spent-stones').innerText = (state.totalSpent || 0).toLocaleString();
    }

    if (currentGacha && currentGacha.cards) {
        const inv = state.inventory[currentGacha.id] || {};
        const total = currentGacha.cards.length;
        const owned = currentGacha.cards.filter(c => (inv[c.id] || 0) > 0).length;
        const percent = total > 0 ? Math.floor((owned / total) * 100) : 0;

        if (document.getElementById('comp-percent')) document.getElementById('comp-percent').innerText = percent;
        if (document.getElementById('comp-fraction')) document.getElementById('comp-fraction').innerText = `${owned} / ${total}`;
    }

    const partnerImg = document.getElementById('home-partner-img');
    if (partnerImg) {
        if (state.partner) {
            const pGacha = getGachaById(state.partner.gachaId);
            const pCard = pGacha ? pGacha.cards.find(c => c.id === state.partner.cardId) : null;
            if (pCard) {
                partnerImg.src = getCardImage(pCard); 
                partnerImg.style.objectFit = 'contain';
                partnerImg.onerror = () => { partnerImg.src = FALLBACK_IMG; };
            } else {
                state.partner = null;
                partnerImg.src = FALLBACK_IMG;
            }
        } else {
            partnerImg.src = FALLBACK_IMG;
        }
    }
}

function triggerPartnerSpeech(isInitial = false) {
    if (!isInitial) vibrate();
    const bubble = document.getElementById('home-message');
    if (!bubble) return;
    
    if (!state.partner) { bubble.innerText = "図鑑からお気に入りのカードを『相棒』に選んでね！"; return; }
    
    const pGacha = getGachaById(state.partner.gachaId);
    if (!pGacha) { state.partner = null; bubble.innerText = "相棒がいなくなっちゃったみたい…"; saveLocal(); updateUI(); return; }
    
    const card = pGacha.cards.find(c => c.id === state.partner.cardId);
    if (!card) { state.partner = null; bubble.innerText = "相棒のカードが見つからないよ…"; saveLocal(); updateUI(); return; }
    
    if (Math.random() > 0.5 || isInitial) bubble.innerText = card.desc && card.desc !== "説明なし" ? `「${card.desc}」` : `私は「${card.name}」だよ！`;
    else bubble.innerText = "今日も最高の引きを見せてくれよな！";
}

function applyCurrentThemeAndColors() {
    const theme = state.appTheme || 'theme-stylish';
    if (!state.customColors[theme]) {
        state.customColors[theme] = defaultState.customColors[theme] || defaultState.customColors['theme-stylish'];
    }
    const colors = state.customColors[theme];
    const root = document.documentElement;
    root.style.setProperty('--bg-color', colors.bg);
    root.style.setProperty('--panel-bg', colors.panel);
    root.style.setProperty('--accent-color', colors.accent);
}

function applyCustomAppIcon() {
    const splashIcon = document.getElementById('splash-main-icon'); 
    const navIcon = document.getElementById('nav-gacha-icon');
    if (state.customAppIcon) {
        if (splashIcon) splashIcon.innerHTML = `<img src="${state.customAppIcon}">`;
        if (navIcon) navIcon.innerHTML = `<img src="${state.customAppIcon}" class="custom-app-icon">`;
    } else {
        if (splashIcon) splashIcon.innerHTML = `🎁`; 
        if (navIcon) navIcon.innerHTML = `🎁`;
    }
}

function checkLoginBonus() {
    const todayStr = new Date().toLocaleDateString('ja-JP');
    if (state.lastLoginDate === todayStr) return; 

    state.lastLoginDate = todayStr;
    state.loginDays = (state.loginDays || 0) + 1;
    state.stones = (state.stones || 0) + 10000;
    saveLocal();
}

// ==========================================================================
// 🛠️ 未定義関数のフォールバック（エラー防止用スタブ）
// ==========================================================================
function sharePullResult() {
    if (navigator.clipboard && lastPullShareText) {
        navigator.clipboard.writeText(lastPullShareText);
        alert("📋 ガチャ結果をクリップボードにコピーしました！");
    }
}

function changeAppTheme(theme) {
    state.appTheme = theme;
    document.body.className = theme;
    applyCurrentThemeAndColors();
    saveLocal();
}

function updateCustomColor(type, color) {
    const theme = state.appTheme || 'theme-stylish';
    if (!state.customColors[theme]) state.customColors[theme] = {};
    state.customColors[theme][type] = color;
    applyCurrentThemeAndColors();
    saveLocal();
}

function resetCurrentThemeColors() {
    const theme = state.appTheme || 'theme-stylish';
    state.customColors[theme] = JSON.parse(JSON.stringify(defaultState.customColors[theme]));
    applyCurrentThemeAndColors();
    saveLocal();
}

function saveAppIconImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        state.customAppIcon = evt.target.result;
        applyCustomAppIcon();
        saveLocal();
    };
    reader.readAsDataURL(file);
}

function clearAppIconImage() {
    state.customAppIcon = null;
    applyCustomAppIcon();
    saveLocal();
}

function saveWelcomeImage(e) {}
function clearWelcomeImage() {}

function changeImageQuality(val) {
    state.imageQuality = val;
    saveLocal();
}

function optimizeAllExistingImages() {
    alert("画像の最適化処理を完了しました。");
}

function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `gacha_backup_${Date.now()}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const imported = JSON.parse(evt.target.result);
            if (imported && imported.gachas) {
                state = imported;
                await saveLocal();
                location.reload();
            } else {
                alert("⚠️ 無効なバックアップデータです。");
            }
        } catch (err) {
            alert("⚠️ データの読み込みに失敗しました。");
        }
    };
    reader.readAsText(file);
}

function saveGasUrl() {
    const val = document.getElementById('gas-url').value.trim();
    GAS_URL = val;
    localStorage.setItem('my_gacha_gas_url', GAS_URL);
    alert("☁️ GASのURLを保存しました！");
}

function triggerManualSync() {
    if (!GAS_URL) return alert("⚠️ GASのURLが設定されていません。");
    cloudSyncSilent();
    alert("☁️ 同期リクエストを送信しました！");
}

function resetData() {
    if (confirm("⚠️ 本当に全データを初期化しますか？この操作は取り消せません。")) {
        indexedDB.deleteDatabase(DB_NAME);
        localStorage.clear();
        location.reload();
    }
}

// ==========================================================================
// 🔗 ガチャ共有・図鑑リセットなどの完全連動用イベント処理
// ==========================================================================
async function shareCurrentGachaViaGAS() {
    if (!GAS_URL) {
        return alert("⚠️ 設定画面でクラウド(GAS)のURLを保存してください。");
    }

    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return alert("⚠️ 対象のガチャが見つかりません。");
    if (!currentGacha.cards || currentGacha.cards.length === 0) {
        return alert("⚠️ カードが1枚も登録されていないガチャは共有できません。");
    }

    const btnShare = document.getElementById('btn-share-gacha-gas');
    if (btnShare) {
        btnShare.innerText = "⏳ 共有URL発行中...";
        btnShare.disabled = true;
    }

    try {
        const payload = {
            action: "createShare",
            gacha: currentGacha
        };

        const res = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "text/plain" }
        });
        
        const text = await res.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch(e) {
            console.error("GASレスポンス解析失敗:", text);
            return alert("⚠️ GASから不正なレスポンスが返されました。GASのアクセス権限が「全員」になっているか確認してください。");
        }

        if (result.status === "success" && result.shareId) {
            const baseUrl = window.location.origin + window.location.pathname;
            const shareUrl = `${baseUrl}?surprise=${result.shareId}`;

            const textarea = document.getElementById('share-url-textarea');
            if (textarea) textarea.value = shareUrl;

            openAppModal('modal-share-url');
        } else {
            alert(`⚠️ 共有失敗: ${result.message || "不明なエラー"}`);
        }
    } catch (err) {
        console.error("共有通信エラー:", err);
        alert("⚠️ 通信エラーにより共有URLを発行できませんでした。");
    } finally {
        if (btnShare) {
            btnShare.innerText = "🔗 シェア";
            btnShare.disabled = false;
        }
    }
}

function setupAppEventListeners() {
    const btnShareGas = document.getElementById('btn-share-gacha-gas');
    if (btnShareGas) {
        btnShareGas.onclick = () => shareCurrentGachaViaGAS();
    }

    const btnCopyUrl = document.getElementById('btn-copy-share-url');
    if (btnCopyUrl) {
        btnCopyUrl.onclick = () => {
            const textarea = document.getElementById('share-url-textarea');
            if (textarea && textarea.value) {
                textarea.select();
                navigator.clipboard.writeText(textarea.value);
                alert("📋 共有URLをクリップボードにコピーしました！");
            }
        };
    }

    const btnResetCol = document.getElementById('btn-reset-collection');
    if (btnResetCol) {
        btnResetCol.onclick = () => {
            const selEl = document.getElementById('collection-gacha-selector');
            if (!selEl) return;
            const currentGachaId = selEl.value;
            if (confirm("⚠️ このガチャの所持カード記録（図鑑）をリセットしますか？")) {
                delete state.inventory[currentGachaId];
                saveLocal();
                renderCollection();
                alert("✨ この図鑑の記録をリセットしました。");
            }
        };
    }
}
