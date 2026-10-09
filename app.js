// ==========================================
// PWA Gacha Maker - Recovery & Data Fix
// ==========================================

let GAS_URL = localStorage.getItem('gacha_gas_url') || "https://script.google.com/macros/s/AKfycby387y_CisxVLM2mIEqr7LLrI9pIn_jZVNf3KMaU_6E0kQ-6sYNUxO0A_K1OxGNbqug/exec";
const FALLBACK_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23eee'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='14' fill='%23aaa'>No Image</text></svg>";

let state = {
    gachas: [],
    currentGachaId: null,
    inventory: {},
    stones: 10000,
    mileage: {},
    lastLoginDate: null,
    loginDays: 0,
    totalSpentStones: 0,
    isGuestMode: false,
    partnerCardId: null
};

const RARITY_WEIGHTS = {
    'SLR': 0.01, 'LR': 0.04, 'LE': 0.15, 'UR': 0.5,
    'SSR': 3.8, 'SR': 10.5, 'R': 20.0, 'N': 50.0, 'C': 15.0
};

// ------------------------------------------
// 💾 IndexedDB (データの安全読み込み)
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
    const hideSplash = () => {
        const splash = document.getElementById('splash');
        if (splash) splash.classList.add('hidden');
    };

    try {
        // 1. ローカルデータを最優先で復元（画像のBase64データを含めて読み込み）
        await loadLocal();

        if (!state.gachas || state.gachas.length === 0) {
            initDefaultGacha();
        }

        // 2. イベントバインド＆ログボ
        setupEventListeners();
        checkLoginBonus();
        await checkSurpriseShare();

        // 3. UI描画
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

// 画像データのプロパティ補正用ヘルパー
function getCardImage(card) {
    if (!card) return FALLBACK_IMG;
    return card.img || card.imageData || card.src || FALLBACK_IMG;
}

// ------------------------------------------
// 🔗 イベントリスナー設定
// ------------------------------------------
function setupEventListeners() {
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
        btn.onclick = (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            if (target) switchTab(target);
        };
    });

    const selector = document.getElementById('gacha-selector');
    if (selector) {
        selector.onchange = (e) => {
            state.currentGachaId = e.target.value;
            saveLocal();
            applyGuestModeUI();
            renderAllUI();
        };
    }

    const btnCreate = document.getElementById('btn-create-new-gacha');
    if (btnCreate) btnCreate.onclick = createNewGachaPrompt;

    const btnDelete = document.getElementById('btn-delete-gacha');
    if (btnDelete) btnDelete.onclick = deleteCurrentGacha;

    const btnShare = document.getElementById('btn-share-gacha-gas');
    if (btnShare) btnShare.onclick = exportCurrentGachaShare;

    const btnCopyUrl = document.getElementById('btn-copy-share-url');
    if (btnCopyUrl) {
        btnCopyUrl.onclick = () => {
            const textarea = document.getElementById('share-url-textarea');
            if (textarea) {
                textarea.select();
                document.execCommand('copy');
                alert("📋 共有URLをコピーしました！");
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
// 📤 共有（シェア）処理
// ------------------------------------------
async function exportCurrentGachaShare() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;

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
            openAppModal('modal-share-url');
        } else {
            throw new Error(result.message || "Failed to save share");
        }
    } catch (e) {
        console.error("シェア発行エラー:", e);
        alert("⚠️ 共有URLの発行に失敗しました。GASのアクセス権限をご確認ください。");
    } finally {
        if (btnShare) btnShare.textContent = "🔗 シェア";
    }
}

// ------------------------------------------
// 🎁 共有受取処理
// ------------------------------------------
async function checkSurpriseShare() {
    const urlParams = new URLSearchParams(window.location.search);
    const surpriseId = urlParams.get('surprise');
    if (!surpriseId || !GAS_URL) return;

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
                };
            }
        }
    } catch(e) {
        console.error("受信エラー:", e);
    }
}

// ------------------------------------------
// 🏠 ホーム・コレクション・管理画面
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
    const pElem = document.getElementById('comp-percent');
    if (pElem) pElem.textContent = percent;

    const fElem = document.getElementById('comp-fraction');
    if (fElem) fElem.textContent = `${acquired} / ${total}`;

    const lElem = document.getElementById('login-days');
    if (lElem) lElem.textContent = state.loginDays || 1;

    const sElem = document.getElementById('total-spent-stones');
    if (sElem) sElem.textContent = (state.totalSpentStones || 0).toLocaleString();

    const partnerImgElem = document.getElementById('home-partner-img');
    if (partnerImgElem) {
        let partnerCard = null;
        if (currentGacha && currentGacha.cards) {
            partnerCard = currentGacha.cards.find(c => c.id === state.partnerCardId) || currentGacha.cards[0];
        }
        partnerImgElem.src = getCardImage(partnerCard);
    }
}

function renderGachaScreen() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const mElem = document.getElementById('current-mileage');
    if (mElem && currentGacha) {
        mElem.textContent = state.mileage[currentGacha.id] || 0;
    }
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
        const imgSrc = isAcquired ? getCardImage(card) : FALLBACK_IMG;

        const cardDiv = document.createElement('div');
        cardDiv.style.cssText = `display:inline-block; margin:8px; text-align:center; width:85px; padding:8px; border-radius:8px; background:${isAcquired ? '#fff' : 'rgba(0,0,0,0.05)'}; border:1px solid rgba(0,0,0,0.1); cursor:pointer;`;
        cardDiv.onclick = () => openCardDetailModal(card, count);

        cardDiv.innerHTML = `
            <div style="width:70px; height:70px; margin:0 auto; background:rgba(0,0,0,0.03); border-radius:6px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                <img src="${escapeHTML(imgSrc)}" style="max-width:100%; max-height:100%; object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'">
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
    const rElem = document.getElementById('modal-card-rarity');
    if (rElem) rElem.textContent = card.rarity;

    const iElem = document.getElementById('modal-card-img');
    if (iElem) iElem.src = isAcquired ? getCardImage(card) : FALLBACK_IMG;

    const nElem = document.getElementById('modal-card-name');
    if (nElem) nElem.textContent = isAcquired ? card.name : "？？？";

    const cElem = document.getElementById('modal-card-count');
    if (cElem) cElem.textContent = count;

    const dElem = document.getElementById('modal-card-desc');
    if (dElem) dElem.textContent = isAcquired ? (card.desc || "セリフなし") : "未所持のカードです。";

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
                <img src="${escapeHTML(getCardImage(card))}" style="width:32px; height:32px; object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'">
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
