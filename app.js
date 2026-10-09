// ==========================================
// PWA Gacha Maker - Full Logic Code (Fix Only)
// ==========================================

let GAS_URL = localStorage.getItem('gacha_gas_url') || "YOUR_GAS_WEB_APP_URL_HERE";
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
    totalSpentStones: 0,
    isGuestMode: false,
    partnerCardId: null
};

// レアリティの重み定義
const RARITY_WEIGHTS = {
    'SLR': 0.01,
    'LR': 0.04,
    'LE': 0.15,
    'UR': 0.5,
    'SSR': 3.8,
    'SR': 10.5,
    'R': 20.0,
    'N': 50.0,
    'C': 15.0
};

// ------------------------------------------
// 💾 IndexedDB ストレージ管理 (データ完全保持)
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
// 🚀 アプリ初期化 (フリーズ防止策適用)
// ------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    // 画面フリーズ（プレゼント画面で停止）を絶対防ぐ安全タイマー
    const hideSplash = () => {
        const splash = document.getElementById('splash');
        if (splash) splash.classList.add('hidden');
    };
    setTimeout(hideSplash, 600);

    try {
        // 1. ローカルストレージ復元（データ保護）
        await loadLocal();

        // 2. デフォルトガチャ初期化（初回のみ）
        if (!state.gachas || state.gachas.length === 0) {
            initDefaultGacha();
        }

        // 3. イベントとログインボーナス設定
        setupEventListeners();
        checkLoginBonus();

        // 4. サプライズシェア確認
        await checkSurpriseShare();

        // 5. UI更新
        applyGuestModeUI();
        renderAllUI();
    } catch (err) {
        console.error("Initialization Error:", err);
    } finally {
        hideSplash();
    }
});

function initDefaultGacha() {
    const defaultGacha = {
        id: 'gacha_default',
        title: '推しコレガチャ',
        cards: [
            { id: 'c1', name: '伝説のパートナー', rarity: 'SLR', img: FALLBACK_IMG, desc: 'いつも応援してるよ！' },
            { id: 'c2', name: 'おねむりシナモン', rarity: 'SSR', img: FALLBACK_IMG, desc: 'すやすや…' },
            { id: 'c3', name: '見習いちゃん', rarity: 'SR', img: FALLBACK_IMG, desc: '頑張ります！' },
            { id: 'c4', name: 'ノーマルカード', rarity: 'N', img: FALLBACK_IMG, desc: '日常の一コマ' }
        ]
    };
    state.gachas = [defaultGacha];
    state.currentGachaId = defaultGacha.id;
    saveLocal();
}

function checkLoginBonus() {
    const today = new Date().toLocaleDateString();
    if (state.lastLoginDate !== today) {
        state.lastLoginDate = today;
        state.loginDays = (state.loginDays || 0) + 1;
        state.stones = (state.stones || 0) + 1000;
        saveLocal();
    }
}

function renderAllUI() {
    updateHeaderUI();
    renderHomeView();
    renderAdminView();
    renderGachaScreen();
    renderCollection();
}

function updateHeaderUI() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    
    const titleElem = document.getElementById('current-gacha-title');
    if (titleElem) titleElem.textContent = currentGacha ? currentGacha.title : 'マイガチャ';

    const stoneElem = document.getElementById('header-stones');
    if (stoneElem) stoneElem.textContent = `💎 ${(state.stones || 0).toLocaleString()}`;
}

// ------------------------------------------
// 🔗 index.html 要素との安全なイベント紐付け
// ------------------------------------------
function setupEventListeners() {
    // ナビゲーション切り替え
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            if (target) switchTab(target);
        });
    });

    // ガチャ切り替え
    const selector = document.getElementById('gacha-selector');
    if (selector) {
        selector.addEventListener('change', (e) => {
            state.currentGachaId = e.target.value;
            saveLocal();
            applyGuestModeUI();
            renderAllUI();
        });
    }

    // 各種ボタンのハンドラー登録（Nullガード付き）
    const btnCreate = document.getElementById('btn-create-new-gacha');
    if (btnCreate) btnCreate.onclick = createNewGachaPrompt;

    const btnDelete = document.getElementById('btn-delete-gacha');
    if (btnDelete) btnDelete.onclick = deleteCurrentGacha;

    // 修正点: index.htmlの btn-share-gacha-gas と正しく連結
    const btnShare = document.getElementById('btn-share-gacha-gas');
    if (btnShare) btnShare.onclick = exportCurrentGachaShare;

    const btnCopyUrl = document.getElementById('btn-copy-share-url');
    if (btnCopyUrl) {
        btnCopyUrl.onclick = () => {
            const textarea = document.getElementById('share-url-textarea');
            if (textarea) {
                textarea.select();
                document.execCommand('copy');
                alert("📋 共有URLをクリップボードにコピーしました！");
            }
        };
    }

    const btnAddCard = document.getElementById('btn-add-card');
    if (btnAddCard) btnAddCard.onclick = addOrUpdateCard;
}

function switchTab(viewId) {
    if (viewId === 'view-admin') {
        const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
        if (state.isGuestMode || (currentGacha && currentGacha.isLocked)) {
            alert("🔒 共有されたガチャの編集はできません。");
            return;
        }
    }

    document.querySelectorAll('main.main-container .view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');

    document.querySelectorAll('.bottom-nav .nav-btn').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`.bottom-nav .nav-btn[data-target="${viewId}"]`);
    if (navBtn) navBtn.classList.add('active');
}

// ------------------------------------------
// 📤 共有（シェア）処理 - 修正対応箇所
// ------------------------------------------
async function exportCurrentGachaShare() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) {
        alert("⚠️ 共有するガチャが選択されていません。");
        return;
    }

    if (!GAS_URL || GAS_URL.includes("YOUR_GAS_WEB_APP_URL_HERE")) {
        alert("⚠️ GASのURLが未設定です。「設定」タブでGASのURLを入力してください。");
        switchTab('view-settings');
        return;
    }

    const btnShare = document.getElementById('btn-share-gacha-gas');
    if (btnShare) btnShare.textContent = "⏳ 発行中...";

    const shareId = 'share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    try {
        const payload = {
            action: 'saveShare',
            shareId: shareId,
            gachaData: currentGacha
        };

        const res = await fetch(GAS_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const result = await res.json();

        if (result.status === 'success') {
            const shareUrl = `${window.location.origin}${window.location.pathname}?surprise=${shareId}`;
            const textarea = document.getElementById('share-url-textarea');
            if (textarea) textarea.value = shareUrl;
            
            // index.html の modal-share-url を表示
            openAppModal('modal-share-url');
        } else {
            throw new Error(result.message || "Failed to save share");
        }
    } catch (e) {
        console.error("シェア発行エラー:", e);
        alert("⚠️ 共有URLの発行に失敗しました。GASのURLおよびデプロイ権限（全員）をご確認ください。");
    } finally {
        if (btnShare) btnShare.textContent = "🔗 シェア";
    }
}

// ------------------------------------------
// 🎁 共有ガチャ受取処理
// ------------------------------------------
async function checkSurpriseShare() {
    const urlParams = new URLSearchParams(window.location.search);
    const surpriseId = urlParams.get('surprise');
    if (!surpriseId) return;

    const alreadyImported = state.gachas.find(g => g.shareId === surpriseId || g.id === 'imported_' + surpriseId);
    if (alreadyImported) {
        state.currentGachaId = alreadyImported.id;
        state.isGuestMode = true;
        await saveLocal();
        window.history.replaceState({}, document.title, window.location.pathname);
        applyGuestModeUI();
        switchTab('view-gacha');
        return;
    }

    if (!GAS_URL || GAS_URL.includes("YOUR_GAS_WEB_APP_URL_HERE")) return;

    try {
        const res = await fetch(`${GAS_URL}?action=getShare&shareId=${surpriseId}`, {
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
                    renderAllUI();
                    switchTab('view-gacha');

                    setTimeout(() => {
                        if (typeof confetti === 'function') confetti({ particleCount: 120, spread: 100, origin: { y: 0.6 } });
                        vibrate();
                    }, 100);
                };
            }
        }
    } catch(e) {
        console.error("受信エラー:", e);
    }
}

// ------------------------------------------
// 🎰 ガチャ・描画・その他標準機能
// ------------------------------------------
function renderHomeView() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    let acquired = 0, total = 0;
    if (currentGacha && currentGacha.cards) {
        total = currentGacha.cards.length;
        const inv = state.inventory[currentGacha.id] || {};
        currentGacha.cards.forEach(c => { if ((inv[c.id] || 0) > 0) acquired++; });
    }

    const percent = total > 0 ? Math.floor((acquired / total) * 100) : 0;
    const percentElem = document.getElementById('comp-percent');
    if (percentElem) percentElem.textContent = percent;

    const fractionElem = document.getElementById('comp-fraction');
    if (fractionElem) fractionElem.textContent = `${acquired} / ${total}`;

    const loginElem = document.getElementById('login-days');
    if (loginElem) loginElem.textContent = state.loginDays || 1;

    const spentElem = document.getElementById('total-spent-stones');
    if (spentElem) spentElem.textContent = (state.totalSpentStones || 0).toLocaleString();

    const partnerImgElem = document.getElementById('home-partner-img');
    if (partnerImgElem) {
        let partnerCard = null;
        if (currentGacha && currentGacha.cards) {
            partnerCard = currentGacha.cards.find(c => c.id === state.partnerCardId) || currentGacha.cards[0];
        }
        partnerImgElem.src = partnerCard ? (partnerCard.img || FALLBACK_IMG) : FALLBACK_IMG;
    }
}

function triggerPartnerSpeech() {
    vibrate();
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    let partnerCard = null;
    if (currentGacha && currentGacha.cards) {
        partnerCard = currentGacha.cards.find(c => c.id === state.partnerCardId) || currentGacha.cards[0];
    }

    const bubble = document.getElementById('home-message');
    if (bubble) {
        bubble.textContent = partnerCard && partnerCard.desc ? partnerCard.desc : "今日も一緒にがんばろう！";
    }
}

function renderGachaScreen() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const mileageElem = document.getElementById('current-mileage');
    if (mileageElem && currentGacha) {
        mileageElem.textContent = state.mileage[currentGacha.id] || 0;
    }
}

function pullGacha(count) {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha || !currentGacha.cards || currentGacha.cards.length === 0) {
        alert("⚠️ このガチャにはカードが登録されていません。");
        return;
    }

    const cost = count === 1 ? 30 : 300;
    if ((state.stones || 0) < cost) {
        alert(`⚠️ 石が足りません！（必要: 💎${cost}）`);
        return;
    }

    state.stones -= cost;
    state.totalSpentStones = (state.totalSpentStones || 0) + cost;
    state.mileage[currentGacha.id] = (state.mileage[currentGacha.id] || 0) + (count * 10);

    const results = [];
    for (let i = 0; i < count; i++) {
        const card = drawOneCard(currentGacha.cards);
        results.push(card);

        if (!state.inventory[currentGacha.id]) {
            state.inventory[currentGacha.id] = {};
        }
        state.inventory[currentGacha.id][card.id] = (state.inventory[currentGacha.id][card.id] || 0) + 1;
    }

    saveLocal();
    renderAllUI();

    const container = document.getElementById('gacha-result-container');
    if (container) {
        container.innerHTML = '';
        results.forEach(card => {
            const cardDiv = document.createElement('div');
            cardDiv.style.cssText = "display:inline-block; margin:6px; text-align:center; width:75px;";
            cardDiv.innerHTML = `
                <div style="width:65px; height:65px; margin:0 auto; background:rgba(255,255,255,0.1); border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                    <img src="${escapeHTML(card.img || FALLBACK_IMG)}" style="max-width:100%; max-height:100%; object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'">
                </div>
                <div style="font-size:10px; font-weight:bold; margin-top:2px;">${escapeHTML(card.rarity)}</div>
                <div style="font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(card.name)}</div>
            `;
            container.appendChild(cardDiv);
        });
    }

    const btnResultShare = document.getElementById('btn-share-pull-result');
    if (btnResultShare) btnResultShare.classList.remove('hidden');

    vibrate();
}

function drawOneCard(cards) {
    let totalWeight = 0;
    const weighted = cards.map(c => {
        const w = RARITY_WEIGHTS[c.rarity] || 10.0;
        totalWeight += w;
        return { card: c, weight: w };
    });

    let rand = Math.random() * totalWeight;
    for (const item of weighted) {
        if (rand < item.weight) return item.card;
        rand -= item.weight;
    }
    return cards[cards.length - 1];
}

function renderCollection() {
    const selector = document.getElementById('collection-gacha-selector');
    if (selector) {
        selector.innerHTML = '';
        state.gachas.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.title;
            if (g.id === state.currentGachaId) opt.selected = true;
            selector.appendChild(opt);
        });
    }

    const container = document.getElementById('collection-grid');
    if (!container) return;
    container.innerHTML = '';

    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;

    const inv = state.inventory[currentGacha.id] || {};

    currentGacha.cards.forEach(card => {
        const count = inv[card.id] || 0;
        const isAcquired = count > 0;

        const cardDiv = document.createElement('div');
        cardDiv.style.cssText = `display:inline-block; margin:8px; text-align:center; width:85px; padding:8px; border-radius:8px; background:${isAcquired ? '#fff' : 'rgba(0,0,0,0.05)'}; border:1px solid rgba(0,0,0,0.1); cursor:pointer;`;
        cardDiv.onclick = () => openCardDetailModal(card, count);

        cardDiv.innerHTML = `
            <div style="width:70px; height:70px; margin:0 auto; background:rgba(0,0,0,0.03); border-radius:6px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                <img src="${isAcquired ? escapeHTML(card.img || FALLBACK_IMG) : FALLBACK_IMG}" style="max-width:100%; max-height:100%; object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'">
            </div>
            <div style="font-size:10px; font-weight:bold; margin-top:4px;">${escapeHTML(card.rarity)}</div>
            <div style="font-size:11px; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${isAcquired ? escapeHTML(card.name) : '？？？'}</div>
            <div style="font-size:10px; color:#666;">所持: ${count}</div>
        `;
        container.appendChild(cardDiv);
    });
}

function openCardDetailModal(card, count) {
    const isAcquired = count > 0;
    
    const rarityElem = document.getElementById('modal-card-rarity');
    if (rarityElem) rarityElem.textContent = card.rarity;

    const imgElem = document.getElementById('modal-card-img');
    if (imgElem) imgElem.src = isAcquired ? (card.img || FALLBACK_IMG) : FALLBACK_IMG;

    const nameElem = document.getElementById('modal-card-name');
    if (nameElem) nameElem.textContent = isAcquired ? card.name : "？？？";

    const countElem = document.getElementById('modal-card-count');
    if (countElem) countElem.textContent = count;

    const descElem = document.getElementById('modal-card-desc');
    if (descElem) descElem.textContent = isAcquired ? (card.desc || "セリフなし") : "未所持のカードです。";

    const setPartnerBtn = document.getElementById('btn-set-partner');
    if (setPartnerBtn) {
        setPartnerBtn.style.display = isAcquired ? 'block' : 'none';
        setPartnerBtn.onclick = () => {
            state.partnerCardId = card.id;
            saveLocal();
            renderHomeView();
            closeAppModal('modal-card-detail');
            alert(`🏠 「${card.name}」をホームの相棒に設定しました！`);
        };
    }

    openAppModal('modal-card-detail');
}

function renderAdminView() {
    const selector = document.getElementById('gacha-selector');
    if (selector) {
        selector.innerHTML = '';
        state.gachas.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.title + (g.isLocked ? " 🔒(閲覧専用)" : "");
            if (g.id === state.currentGachaId) opt.selected = true;
            selector.appendChild(opt);
        });
    }

    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const container = document.getElementById('admin-card-list');
    if (!container) return;
    container.innerHTML = '';

    if (!currentGacha || !currentGacha.cards) return;

    currentGacha.cards.forEach((card, idx) => {
        const div = document.createElement('div');
        div.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:6px 10px; border-bottom:1px solid #eee; font-size:12px;";
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                <img src="${escapeHTML(card.img || FALLBACK_IMG)}" style="width:32px; height:32px; object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'">
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">[${escapeHTML(card.rarity)}] ${escapeHTML(card.name)}</span>
            </div>
            <button class="btn btn-outline btn-danger" style="padding:2px 6px; font-size:10px; flex-shrink:0;" onclick="removeCardFromGacha(${idx})">削除</button>
        `;
        container.appendChild(div);
    });
}

function applyGuestModeUI() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const isLocked = currentGacha && currentGacha.isLocked;

    const warningElem = document.getElementById('admin-locked-warning');
    const editorSection = document.getElementById('admin-editor-section');

    if (state.isGuestMode || isLocked) {
        if (warningElem) {
            warningElem.classList.remove('hidden');
            warningElem.innerHTML = `<div class="panel" style="background:#fff3cd; color:#856404; text-align:center; font-size:12px;">🔒 共有されたガチャのためカードの編集・削除はロックされています。</div>`;
        }
        if (editorSection) editorSection.classList.add('hidden');
    } else {
        if (warningElem) warningElem.classList.add('hidden');
        if (editorSection) editorSection.classList.remove('hidden');
    }
}

async function addOrUpdateCard() {
    const nameInput = document.getElementById('input-card-name');
    const rarityInput = document.getElementById('input-card-rarity');
    const descInput = document.getElementById('input-card-desc');
    const fileInput = document.getElementById('input-card-img');

    if (!nameInput || !nameInput.value.trim()) {
        alert("⚠️ カード名を入力してください。");
        return;
    }

    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;

    let imgUrl = FALLBACK_IMG;
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        imgUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    const newCard = {
        id: 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: nameInput.value.trim(),
        rarity: rarityInput ? rarityInput.value : 'N',
        desc: descInput ? descInput.value.trim() : '',
        img: imgUrl
    };

    if (!currentGacha.cards) currentGacha.cards = [];
    currentGacha.cards.push(newCard);

    nameInput.value = '';
    if (descInput) descInput.value = '';
    if (fileInput) fileInput.value = '';

    await saveLocal();
    renderAllUI();
    alert(`✨ カード「${newCard.name}」を追加しました！`);
}

async function removeCardFromGacha(idx) {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha || !currentGacha.cards) return;
    if (!confirm(`🗑️ 「${currentGacha.cards[idx].name}」を削除しますか？`)) return;

    currentGacha.cards.splice(idx, 1);
    await saveLocal();
    renderAllUI();
}

function createNewGachaPrompt() {
    const title = prompt("新しいガチャのタイトルを入力してください:");
    if (!title || !title.trim()) return;

    const newGacha = { id: 'gacha_' + Date.now(), title: title.trim(), cards: [] };
    state.gachas.push(newGacha);
    state.currentGachaId = newGacha.id;
    state.isGuestMode = false;

    saveLocal();
    applyGuestModeUI();
    renderAllUI();
}

async function deleteCurrentGacha() {
    if (state.gachas.length <= 1) {
        alert("⚠️ 最低1つのガチャを残す必要があります。");
        return;
    }

    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!confirm(`🗑️ ガチャ「${currentGacha ? currentGacha.title : ''}」を削除しますか？`)) return;

    state.gachas = state.gachas.filter(g => g.id !== state.currentGachaId);
    state.currentGachaId = state.gachas[0].id;

    await saveLocal();
    applyGuestModeUI();
    renderAllUI();
}

// ------------------------------------------
// 🏛️ モーダル & 補助関数
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
        div.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border:1px solid rgba(0,0,0,0.1); border-radius:8px; height:60px; box-sizing:border-box; background:var(--panel-bg, #fff);";
        
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
        alert("⚠️ マイレージポイントが不足しています (5,000pt必要)");
        return;
    }

    const card = currentGacha.cards.find(c => c.id === cardId);
    if (!card) return;

    if (!confirm(`✨ 5,000ptを消費して「${card.name}」を獲得しますか？`)) return;

    state.mileage[currentGacha.id] -= 5000;
    if (!state.inventory[currentGacha.id]) state.inventory[currentGacha.id] = {};
    state.inventory[currentGacha.id][cardId] = (state.inventory[currentGacha.id][cardId] || 0) + 1;

    await saveLocal();
    closeAppModal('modal-ceiling');
    renderAllUI();

    alert(`🎉 「${card.name}」を獲得しました！`);
}

function saveGasUrl() {
    const input = document.getElementById('gas-url');
    if (input && input.value.trim()) {
        GAS_URL = input.value.trim();
        localStorage.setItem('gacha_gas_url', GAS_URL);
        alert("✅ GASのURLを保存しました！");
    }
}

function openAppModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('hidden');
}

function closeAppModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('hidden');
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function vibrate() {
    if (navigator.vibrate) navigator.vibrate(15);
}
