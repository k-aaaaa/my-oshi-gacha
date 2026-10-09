// ==========================================================================
// 🚀 データベースエンジン (IndexedDB)
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
    stones: 10000,      
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
    autoSync: false,
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
    if (state.archivedGachas) return state.archivedGachas.find(g => g.id === id);
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

// 🔒 共有受け取りユーザー（ゲスト）の場合、「作る」タブを画面から消去する関数
function applyGuestModeUI() {
    const currentGacha = state ? state.gachas.find(g => g.id === state.currentGachaId) : null;
    const adminNavBtn = document.querySelector('.nav-btn[data-target="view-admin"]');

    if ((state && state.isGuestMode) || (currentGacha && currentGacha.isLocked)) {
        if (adminNavBtn) adminNavBtn.style.display = 'none';
        const adminView = document.getElementById('view-admin');
        if (adminView && adminView.classList.contains('active')) {
            switchTab('view-home', false);
        }
    } else {
        if (adminNavBtn) adminNavBtn.style.display = 'flex';
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error("SW登録失敗:", err));
    }

    try {
        const storedState = await loadStateFromDB();
        state = storedState ? storedState : JSON.parse(JSON.stringify(defaultState));
        
        if (!state.archivedGachas) state.archivedGachas = [];
        if (!state.mileage) state.mileage = {};
        if (!state.imageQuality) state.imageQuality = 'standard';
        if (!state.tickets) state.tickets = { ssr: 0, ur: 0, le: 0, lr: 0, slr: 0 };
        if (state.tickets.lr === undefined) state.tickets.lr = 0;
        if (state.tickets.slr === undefined) state.tickets.slr = 0;
        if (!state.customColors) state.customColors = defaultState.customColors;
        if (state.splashTime === undefined) state.splashTime = 1200;
        if (state.autoSync === undefined) state.autoSync = false;
        if (state.isGuestMode === undefined) state.isGuestMode = false;
        
    } catch(e) {
        state = JSON.parse(JSON.stringify(defaultState));
    }

    applyCurrentThemeAndColors();
    applyCustomAppIcon();
    if (document.getElementById('gas-url')) {
        document.getElementById('gas-url').value = GAS_URL;
    }

    const imgData = localStorage.getItem('my_gacha_welcome_img');
    const splashTime = state.splashTime || 1200;
    if (imgData) {
        const splashDef = document.getElementById('splash-default');
        const customImg = document.getElementById('splash-custom');
        if (splashDef) splashDef.classList.add('hidden');
        if (customImg) {
            customImg.src = imgData;
            customImg.classList.remove('hidden');
        }
        if (document.getElementById('welcome-img-preview')) {
            document.getElementById('welcome-img-preview').src = imgData;
            document.getElementById('welcome-img-preview-container').classList.remove('hidden');
        }
    }
    
    const initialTab = location.hash ? location.hash.replace('#', '') : 'view-home';

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
});

window.addEventListener('popstate', (e) => {
    const target = e.state ? e.state.tab : 'view-home';
    switchTab(target, false);
});

function switchTab(targetId, pushHistory = true) {
    const currentGacha = state ? state.gachas.find(g => g.id === state.currentGachaId) : null;
    if (targetId === 'view-admin' && ((state && state.isGuestMode) || (currentGacha && currentGacha.isLocked))) {
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
        const btnShareResult = document.getElementById('btn-share-pull-result');
        if (btnShareResult) btnShareResult.classList.add('hidden');
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

async function saveLocal() {
    try { 
        await saveStateToDB(state); 
        updateUI(); 
        applyGuestModeUI();
        if (state.autoSync) {
            if (syncTimeoutTimer) clearTimeout(syncTimeoutTimer);
            syncTimeoutTimer = setTimeout(() => cloudSyncSilent(), 1000);
        }
    } catch (e) { 
        console.error("保存失敗:", e); 
    }
}

function exportData() {
    vibrate();
    const dataStr = JSON.stringify(state);
    const blob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MY_GACHA_BACKUP_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(e) {
    vibrate();
    const file = e.target.files[0];
    if(!file) return;
    
    if(!confirm("⚠️ データを読み込むと、現在のデータはすべて上書きされます！よろしいですか？")) {
        e.target.value = ''; return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const importedState = JSON.parse(ev.target.result);
            state = { ...defaultState, ...importedState };
            await saveLocal();
            alert("✨ データの復元に成功しました！");
            location.reload();
        } catch(err) {
            alert("⚠️ 読み込みエラー: ファイルが壊れています。");
            e.target.value = ''; 
        }
    };
    reader.readAsText(file);
}

function resetData() {
    vibrate();
    if(!confirm("⚠️ 本当にすべてのデータを初期化しますか？")) return;
    localStorage.removeItem('my_gacha_gas_url');
    localStorage.removeItem('my_gacha_welcome_img');
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = function () { alert("データを消去しました。"); location.reload(); };
}

function applyCurrentThemeAndColors() {
    const theme = state.appTheme || 'theme-stylish';
    const themeSel = document.getElementById('theme-selector');
    if (themeSel) themeSel.value = theme;

    if (!state.customColors[theme]) {
        state.customColors[theme] = defaultState.customColors[theme] || defaultState.customColors['theme-stylish'];
    }

    const colors = state.customColors[theme];
    const root = document.documentElement;
    root.style.setProperty('--bg-color', colors.bg);
    root.style.setProperty('--panel-bg', colors.panel);
    root.style.setProperty('--accent-color', colors.accent);
    
    const hexToLuma = (color) => {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
        return [0.299 * r, 0.587 * g, 0.114 * b].reduce((a, b) => a + b) / 255;
    };
    root.style.setProperty('--text-color', hexToLuma(colors.bg) > 0.5 ? '#1d1d1f' : '#ffffff');

    if (document.getElementById('custom-color-bg')) document.getElementById('custom-color-bg').value = colors.bg;
    if (document.getElementById('custom-color-panel')) document.getElementById('custom-color-panel').value = colors.panel;
    if (document.getElementById('custom-color-accent')) document.getElementById('custom-color-accent').value = colors.accent;
}

function updateCustomColor(type, value) { state.customColors[state.appTheme || 'theme-stylish'][type] = value; applyCurrentThemeAndColors(); saveLocal(); }
function resetCurrentThemeColors() { vibrate(); state.customColors[state.appTheme || 'theme-stylish'] = { ...defaultState.customColors[state.appTheme || 'theme-stylish'] }; applyCurrentThemeAndColors(); saveLocal(); }
function changeAppTheme(themeName) { vibrate(); state.appTheme = themeName; applyCurrentThemeAndColors(); saveLocal(); }
function changeImageQuality(val) { vibrate(); state.imageQuality = val; saveLocal(); }

function saveAppIconImage(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100; 
            const ctx = canvas.getContext('2d'); const size = Math.min(img.width, img.height);
            ctx.drawImage(img, (img.width - size)/2, (img.height - size)/2, size, size, 0, 0, 100, 100);
            state.customAppIcon = canvas.toDataURL('image/jpeg', 0.8);
            saveLocal(); applyCustomAppIcon(); alert("アプリアイコンを変更しました！");
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function clearAppIconImage() { vibrate(); state.customAppIcon = null; saveLocal(); applyCustomAppIcon(); }

function applyCustomAppIcon() {
    const splashIcon = document.getElementById('splash-main-icon'); const navIcon = document.getElementById('nav-gacha-icon');
    if(state.customAppIcon) {
        if(splashIcon) splashIcon.innerHTML = `<img src="${state.customAppIcon}">`;
        if(navIcon) navIcon.innerHTML = `<img src="${state.customAppIcon}" class="custom-app-icon">`;
    } else {
        if(splashIcon) splashIcon.innerHTML = `🎁`; if(navIcon) navIcon.innerHTML = `🎁`;
    }
}

function saveWelcomeImage(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 500;
            let scaleSize = 1;
            if (img.width > MAX_WIDTH) { scaleSize = MAX_WIDTH / img.width; }
            canvas.width = img.width * scaleSize;
            canvas.height = img.height * scaleSize;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

            try {
                localStorage.setItem('my_gacha_welcome_img', compressedBase64);
                if (document.getElementById('welcome-img-preview')) {
                    document.getElementById('welcome-img-preview').src = compressedBase64;
                    document.getElementById('welcome-img-preview-container').classList.remove('hidden');
                }
                alert("🖼️ スプラッシュ画像を保存しました！");
            } catch(err) {
                alert("⚠️ 画像サイズが大きすぎます。");
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function clearWelcomeImage() { vibrate(); localStorage.removeItem('my_gacha_welcome_img'); if(document.getElementById('welcome-img-preview-container')) document.getElementById('welcome-img-preview-container').classList.add('hidden'); }
function saveGasUrl() { GAS_URL = document.getElementById('gas-url').value.trim(); localStorage.setItem('my_gacha_gas_url', GAS_URL); alert("☁️ GASのURLを保存しました。"); }

function cloudSyncSilent() { 
    if (GAS_URL) fetch(GAS_URL, { method: "POST", body: JSON.stringify(state), headers: { "Content-Type": "text/plain" } }).catch(()=>{}); 
}

function triggerManualSync() {
    vibrate(); 
    if (!GAS_URL) return alert("⚠️ 先にGASのURLを登録してください");
    fetch(GAS_URL, { method: "POST", body: JSON.stringify(state), headers: { "Content-Type": "text/plain" } })
    .then(res => res.json())
    .then(result => { alert("☁️ バックアップが完了しました！"); })
    .catch(() => alert("⚠️ 通信に失敗しました。"));
}

async function processCardImageUpload(file) {
    const qualityMap = { 
        'high': { width: 500, quality: 0.65 },
        'standard': { width: 380, quality: 0.5 },
        'eco': { width: 250, quality: 0.35 }
    };
    const settings = qualityMap[state.imageQuality] || qualityMap['standard'];

    const compressedBase64 = await new Promise((resolve) => {
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

    if (!GAS_URL) return compressedBase64;

    try {
        const payload = JSON.stringify({
            action: 'uploadImage',
            filename: `card_${Date.now()}.jpg`,
            file: compressedBase64
        });

        const res = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: payload
        });

        const result = await res.json();
        if (result.status === 'success' && result.url) return result.url;
    } catch (e) {
        console.warn("GAS送信失敗、Base64で保存します", e);
    }
    return compressedBase64;
}

async function optimizeAllExistingImages() {
    vibrate();
    if (!state || !state.gachas || state.gachas.length === 0) return alert("データがありません");

    let heavyCards = [];
    state.gachas.forEach(gacha => {
        if (gacha.cards) {
            gacha.cards.forEach(card => {
                if (card.img && card.img.startsWith('data:image/')) {
                    heavyCards.push(card);
                }
            });
        }
    });

    if (heavyCards.length === 0) return alert("✨ 圧縮が必要な重い画像はありません！");

    if (!confirm(`重い画像（${heavyCards.length}枚）を1枚ずつ安全に軽量化します。実行しますか？`)) return;

    let successCount = 0;
    for (let i = 0; i < heavyCards.length; i++) {
        const card = heavyCards[i];
        await new Promise(resolve => setTimeout(resolve, 150));

        try {
            const compressed = await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let scale = 1;
                    if (img.width > 350) scale = 350 / img.width;
                    canvas.width = Math.floor(img.width * scale);
                    canvas.height = Math.floor(img.height * scale);
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const res = canvas.toDataURL('image/jpeg', 0.5);
                    canvas.width = 0; canvas.height = 0;
                    resolve(res);
                };
                img.onerror = () => resolve(card.img);
                img.src = card.img;
            });
            card.img = compressed;
            successCount++;
            if (i % 3 === 0) await saveLocal();
        } catch(e) {}
    }

    await saveLocal();
    renderAdminView();
    alert(`✨ ${successCount}枚の画像を軽量化しました！`);
}

if(document.getElementById('btn-share-gacha-gas')) {
    document.getElementById('btn-share-gacha-gas').addEventListener('click', async () => {
        vibrate();
        if(isPulling) return;
        if(!GAS_URL) return alert("⚠️ 設定画面からGASのURLを登録してください！");
        const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
        if (!currentGacha || currentGacha.cards.length === 0) return alert("カードが1枚もありません！");
        
        const exportGacha = JSON.parse(JSON.stringify(currentGacha));
        exportGacha.isLocked = true;
        
        const btn = document.getElementById('btn-share-gacha-gas');
        btn.innerText = "⏳ 準備中...";
        isPulling = true;
        const shareId = "share_" + Date.now();
        const payload = { action: "saveShare", shareId: shareId, gachaData: exportGacha };
        
        try {
            const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain" } });
            const result = await res.json();
            if(result.status === "success") {
                const baseUrl = window.location.href.split('?')[0].split('#')[0];
                const shareUrl = `${baseUrl}?surprise=${shareId}&api=${encodeURIComponent(GAS_URL)}`;
                
                const textarea = document.getElementById('share-url-textarea');
                const copyBtn = document.getElementById('btn-copy-share-url');
                
                if (textarea) textarea.value = shareUrl;

                if (copyBtn) {
                    copyBtn.onclick = () => {
                        vibrate();
                        if (textarea) {
                            textarea.select();
                            textarea.setSelectionRange(0, 99999);
                        }
                        navigator.clipboard.writeText(shareUrl).then(() => {
                            alert("📋 共有URLをコピーしました！");
                        }).catch(() => {
                            alert("テキストを選択してコピーしてください。");
                        });
                    };
                }

                openAppModal('modal-share-url');
            } else alert("エラーが発生しました。");
        } catch(e) { 
            alert("通信に失敗しました。"); 
        } finally { 
            btn.innerText = "🔗 シェア"; 
            isPulling = false;
        }
    });
}

async function checkSurpriseShare() {
    const urlParams = new URLSearchParams(window.location.search);
    const surpriseId = urlParams.get('surprise');
    const apiParam = urlParams.get('api');
    const activeGasUrl = apiParam ? decodeURIComponent(apiParam) : GAS_URL;

    if (surpriseId && activeGasUrl) {
        try {
            const res = await fetch(activeGasUrl + "?action=getShare&shareId=" + surpriseId);
            const result = await res.json();
            
            if(result.status === "success" && result.data) {
                const importedGacha = result.data;
                
                openAppModal('modal-surprise');
                
                const openBtn = document.getElementById('btn-surprise-open');
                if (openBtn) {
                    openBtn.onclick = async () => {
                        vibrate();
                        
                        const newId = 'imported_' + Date.now();
                        importedGacha.id = newId;
                        importedGacha.isLocked = true;
                        
                        state.isGuestMode = true; // ゲストモードフラグを永続化保存
                        
                        state.gachas.push(importedGacha); 
                        state.currentGachaId = newId; 
                        state.stones += 10000; 
                        
                        await saveLocal(); 
                        renderGachaSelectors(); 
                        
                        closeAppModal('modal-surprise');
                        window.history.replaceState({}, document.title, window.location.pathname);
                        
                        applyGuestModeUI();
                        switchTab('view-gacha', true);
                        renderGachaScreen();
                        
                        setTimeout(() => alert(`✨ ガチャ「${importedGacha.title}」を受け取りました！\n💎 石10,000個をプレゼント！`), 300);
                    };
                }
            } else {
                alert("⚠️ 共有データの取得に失敗したか、期限切れです。");
            }
        } catch(e) {
            console.error("共有ガチャ受信エラー:", e);
        }
    }
}

function checkLoginBonus() {
    const todayStr = new Date().toLocaleDateString('ja-JP');
    if (state.lastLoginDate === todayStr) return; 

    let daysToCatchUp = 1;
    if (state.lastLoginDate) {
        const lastDate = new Date(state.lastLoginDate); const todayDate = new Date(todayStr);
        daysToCatchUp = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysToCatchUp < 1) daysToCatchUp = 1; 
    }
    state.lastLoginDate = todayStr;
    
    let totalStones = 0; let earnedTickets = { ssr: 0, ur: 0, le: 0, lr: 0, slr: 0 };
    for(let i=0; i<daysToCatchUp; i++){
        state.loginDays += 1; const cycleDay = ((state.loginDays - 1) % 28) + 1;
        totalStones += 10000; 
        if (cycleDay === 3) earnedTickets.ssr += 1;
        if (cycleDay === 6) earnedTickets.ur += 1;
        if (cycleDay === 7) { earnedTickets.le += 1; totalStones += 10000; }
        if (cycleDay === 14) earnedTickets.lr += 1;
        if (cycleDay === 21) { earnedTickets.le += 1; totalStones += 10000; }
        if (cycleDay === 28) earnedTickets.slr += 1;
    }
    state.stones += totalStones; state.tickets.ssr += earnedTickets.ssr; state.tickets.ur += earnedTickets.ur; state.tickets.le += earnedTickets.le; state.tickets.lr += earnedTickets.lr; state.tickets.slr += earnedTickets.slr;

    saveLocal();
}

function renderStampCard() {
    const container = document.getElementById('stamp-card-container'); if(!container) return;
    container.innerHTML = '';
    const current28CycleDay = state.loginDays === 0 ? 1 : ((state.loginDays - 1) % 28) + 1;
    const currentWeek = Math.floor((current28CycleDay - 1) / 7); const weekStart = currentWeek * 7 + 1;
    
    for(let i = 0; i < 7; i++) {
        const dayNum = weekStart + i; const isClaimed = state.loginDays > 0 && current28CycleDay >= dayNum;
        let label = "💎1万";
        if(dayNum===3) label="🎫SSR"; if(dayNum===6) label="🎫UR"; if(dayNum===7) label="🎫LE\n💎2万";
        if(dayNum===14) label="🎫LR"; if(dayNum===21) label="🎫LE\n💎2万"; if(dayNum===28) label="🎫SLR";

        const div = document.createElement('div');
        div.className = `stamp-cell ${(i+1) === 7 ? 'day7' : ''} ${isClaimed ? 'claimed' : ''}`;
        div.innerHTML = `<div class="stamp-day">${dayNum}日目</div><div class="stamp-reward" style="white-space:pre-wrap;">${label}</div>`;
        container.appendChild(div);
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

function updateUI() {
    const elStones = document.getElementById('header-stones');
    if (elStones) elStones.innerText = `💎 ${state.stones.toLocaleString()}`;
    if (document.getElementById('login-days')) document.getElementById('login-days').innerText = state.loginDays;
    if (document.getElementById('total-spent-stones')) document.getElementById('total-spent-stones').innerText = state.totalSpent.toLocaleString();
    renderStampCard(); 

    const currentGacha = getGachaById(state.currentGachaId);
    if (!currentGacha) {
        if (document.getElementById('current-gacha-title')) document.getElementById('current-gacha-title').innerText = "ガチャがありません";
        if (document.getElementById('comp-percent')) document.getElementById('comp-percent').innerText = "0"; 
        if (document.getElementById('comp-fraction')) document.getElementById('comp-fraction').innerText = "0 / 0";
    } else {
        const isArchived = state.archivedGachas.some(g => g.id === currentGacha.id);
        if (document.getElementById('current-gacha-title')) document.getElementById('current-gacha-title').innerText = (isArchived ? "[撤去済] " : "") + currentGacha.title;
        
        if (currentGacha.cards.length > 0) {
            const inv = state.inventory[currentGacha.id] || {};
            const typesGot = currentGacha.cards.filter(c => (inv[c.id] || 0) > 0).length;
            const total = currentGacha.cards.length;
            if (document.getElementById('comp-percent')) document.getElementById('comp-percent').innerText = Math.floor((typesGot / total) * 100);
            if (document.getElementById('comp-fraction')) document.getElementById('comp-fraction').innerText = `${typesGot} / ${total}`;
        } else {
            if (document.getElementById('comp-percent')) document.getElementById('comp-percent').innerText = 0; 
            if (document.getElementById('comp-fraction')) document.getElementById('comp-fraction').innerText = `0 / 0`;
        }
    }

    const partnerImg = document.getElementById('home-partner-img');
    const partnerStar = document.getElementById('home-partner-star');
    if (partnerImg && state.partner) {
        const pGacha = getGachaById(state.partner.gachaId);
        if (pGacha) {
            const pCard = pGacha.cards.find(c => c.id === state.partner.cardId);
            if (pCard) {
                partnerImg.src = pCard.img; 
                partnerImg.style.objectFit = 'contain';
                partnerImg.onerror = () => { partnerImg.src = FALLBACK_IMG; };
                partnerImg.classList.remove('hidden');
                if (partnerStar) {
                    if (((state.inventory[state.partner.gachaId] || {})[state.partner.cardId] || 0) >= 100) partnerStar.classList.remove('hidden');
                    else partnerStar.classList.add('hidden');
                }
            }
        }
    } else if (partnerImg) {
        partnerImg.src = FALLBACK_IMG;
        partnerImg.style.objectFit = 'contain';
        if (partnerStar) partnerStar.classList.add('hidden');
    }
}

// ==========================================================================
// 🎰 ガチャ実行 (単発 / 10連 / 100連)
// ==========================================================================
function renderGachaScreen() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const statusText = document.getElementById('gacha-screen-status');
    const actionControls = document.getElementById('gacha-action-controls');
    const ticketControls = document.getElementById('ticket-action-controls');
    if (ticketControls) ticketControls.innerHTML = "";
    
    if (document.getElementById('current-mileage')) {
        document.getElementById('current-mileage').innerText = currentGacha ? (state.mileage[currentGacha.id] || 0) : 0;
    }

    if (!currentGacha) {
        if (statusText) statusText.innerText = "ガチャがありません";
        if (actionControls) actionControls.innerHTML = `<p style="text-align:center;width:100%;font-size:12px;opacity:0.6;">⚙️ガチャを選択してください</p>`;
        return;
    }
    if (statusText) statusText.innerText = "最高レアを引き当てろ！";
    if (actionControls) {
        actionControls.innerHTML = `
            <button id="btn-pull-1" class="btn btn-gacha" onclick="pullGacha(1)" ${isPulling ? 'disabled' : ''}>単発 (💎30)</button>
            <button id="btn-pull-10" class="btn btn-gacha-10" onclick="pullGacha(10)" ${isPulling ? 'disabled' : ''}>10連 (💎300)</button>
            <button id="btn-pull-100" class="btn btn-gacha-10" style="background: linear-gradient(135deg, #ff0055, #ff5000); color: white; border: none; font-weight: bold;" onclick="pullGacha(100)" ${isPulling ? 'disabled' : ''}>💥 100連 (💎3000)</button>
        `;
    }

    if (ticketControls) {
        if (state.tickets.ssr > 0) ticketControls.innerHTML += `<button onclick="pullGacha(1, 'ssr')" class="btn btn-ticket-trigger" ${isPulling ? 'disabled' : ''}>🎫 SSR以上確定 (${state.tickets.ssr}枚)</button>`;
        if (state.tickets.ur > 0) ticketControls.innerHTML += `<button onclick="pullGacha(1, 'ur')" class="btn btn-ticket-trigger" style="background:linear-gradient(135deg, #00d4ff, #7b2ff7); color:white;" ${isPulling ? 'disabled' : ''}>🎫 UR以上確定 (${state.tickets.ur}枚)</button>`;
        if (state.tickets.le > 0) ticketControls.innerHTML += `<button onclick="pullGacha(1, 'le')" class="btn btn-ticket-trigger" style="background:linear-gradient(135deg, #ff00cc, #4a00e0); color:white;" ${isPulling ? 'disabled' : ''}>🎫 LE以上確定 (${state.tickets.le}枚)</button>`;
        if (state.tickets.lr > 0) ticketControls.innerHTML += `<button onclick="pullGacha(1, 'lr')" class="btn btn-ticket-trigger" style="background:linear-gradient(135deg, #ff3333, #990000); color:white;" ${isPulling ? 'disabled' : ''}>🎫 LR以上確定 (${state.tickets.lr}枚)</button>`;
        if (state.tickets.slr > 0) ticketControls.innerHTML += `<button onclick="pullGacha(1, 'slr')" class="btn btn-ticket-trigger" style="background:linear-gradient(135deg, #ffffff, #aaaaaa); color:black; border: 2px solid #ff3333;" ${isPulling ? 'disabled' : ''}>🎫 SLR確定 (${state.tickets.slr}枚)</button>`;
    }
}

function pullGacha(times, ticketType = false) {
    if (isPulling) return; 
    vibrate();
    
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha || currentGacha.cards.length === 0) return alert("このガチャにはまだ景品がありません。⚙️「作る」から画像を登録してください！");

    const standardWeights = { 'SLR': 0.01, 'LR': 0.04, 'LE': 0.15, 'UR': 0.5, 'SSR': 3.8, 'SR': 10.5, 'R': 20.0, 'C': 15.0, 'N': 50.0 };
    const availableCards = currentGacha.cards;
    const availableRarities = [...new Set(availableCards.map(c => c.rarity))];
    let allowedRarities = availableRarities;

    if (ticketType) {
        const rarityMap = { 'ssr': ['SSR','UR','LE','LR','SLR'], 'ur': ['UR','LE','LR','SLR'], 'le': ['LE','LR','SLR'], 'lr': ['LR','SLR'], 'slr': ['SLR'] };
        allowedRarities = availableRarities.filter(r => rarityMap[ticketType].includes(r));
        if (allowedRarities.length === 0) {
            return alert("⚠️ 対象レアリティー未実装！確定対象のカードが入っていません。");
        }
        if (state.tickets[ticketType] < 1) return;
        state.tickets[ticketType] -= 1;
    } else {
        const cost = times * 30;
        if (state.stones < cost) return alert("💎 石が足りません！");
        state.stones -= cost;
        state.totalSpent += cost;
    }

    isPulling = true;
    renderGachaScreen();

    const pool = availableCards.filter(c => allowedRarities.includes(c.rarity));
    const results = [];

    for (let i = 0; i < times; i++) {
        let weightSum = pool.reduce((sum, c) => sum + (standardWeights[c.rarity] || 10), 0);
        let rand = Math.random() * weightSum;
        let selected = pool[pool.length - 1];
        for (let card of pool) {
            let w = standardWeights[card.rarity] || 10;
            if (rand < w) { selected = card; break; }
            rand -= w;
        }
        results.push(selected);

        if (!state.inventory[currentGacha.id]) state.inventory[currentGacha.id] = {};
        state.inventory[currentGacha.id][selected.id] = (state.inventory[currentGacha.id][selected.id] || 0) + 1;
    }

    state.mileage[currentGacha.id] = (state.mileage[currentGacha.id] || 0) + (times * 10);
    saveLocal();

    const resultsContainer = document.getElementById('gacha-result-container');
    if (resultsContainer) {
        resultsContainer.innerHTML = '';
        const intervalTime = times >= 100 ? 20 : 150;
        results.forEach((card, index) => {
            setTimeout(() => {
                const cardEl = document.createElement('div');
                cardEl.className = `card ${card.rarity}`;
                cardEl.innerHTML = `<img src="${escapeHTML(card.img)}" alt="${escapeHTML(card.name)}" style="object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'"><div class="card-rarity-tag">${card.rarity}</div>`;
                cardEl.onclick = () => openCardDetailModal(currentGacha.id, card.id);
                resultsContainer.appendChild(cardEl);
                if (index % 5 === 0) vibrate();
                if (['SLR', 'LR', 'LE'].includes(card.rarity)) {
                    fireConfetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
                }
                if (index === results.length - 1) {
                    isPulling = false;
                    renderGachaScreen();
                    const shareBtn = document.getElementById('btn-share-pull-result');
                    if (shareBtn) shareBtn.classList.remove('hidden');
                }
            }, index * intervalTime);
        });
    }

    lastPullShareText = `【${currentGacha.title}】を${times}連引いたよ！\n獲得: ${results.map(r => `[${r.rarity}]${r.name}`).join(', ')}`;
}

// ==========================================================================
// 🛠️ ガチャ・カード作成管理
// ==========================================================================
function setupAdminGachaListeners() {
    const btnCreate = document.getElementById('btn-create-new-gacha');
    const btnDelete = document.getElementById('btn-delete-gacha');

    if (btnCreate && !btnCreate.dataset.hasListener) {
        btnCreate.dataset.hasListener = "true";
        btnCreate.addEventListener('click', async () => {
            vibrate();
            const title = prompt("新しいガチャのタイトルを入力してください:");
            if (!title || !title.trim()) return;

            const newGacha = { id: 'gacha_' + Date.now(), title: title.trim(), cards: [], isLocked: false };
            state.gachas.push(newGacha);
            state.currentGachaId = newGacha.id;
            await saveLocal();
            renderGachaSelectors();
            renderAdminView();
            alert("✨ 新しいガチャを作成しました！");
        });
    }

    if (btnDelete && !btnDelete.dataset.hasListener) {
        btnDelete.dataset.hasListener = "true";
        btnDelete.addEventListener('click', async () => {
            vibrate();
            if (state.gachas.length <= 1) return alert("⚠️ 最低1つのガチャが必要です。");
            const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
            if (!currentGacha) return;
            if (!confirm(`本当に「${currentGacha.title}」を削除しますか？`)) return;

            state.gachas = state.gachas.filter(g => g.id !== currentGacha.id);
            delete state.inventory[currentGacha.id];
            delete state.mileage[currentGacha.id];

            state.currentGachaId = state.gachas[0].id;
            await saveLocal();
            renderGachaSelectors();
            renderAdminView();
            alert("🗑️ ガチャを削除しました。");
        });
    }
}

function setupAdminCardListener() {
    const btnAdd = document.getElementById('btn-add-card');
    if (!btnAdd || btnAdd.dataset.hasListener) return;
    btnAdd.dataset.hasListener = "true";

    btnAdd.addEventListener('click', async () => {
        if (isPulling) return;
        const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
        if (!currentGacha) return alert("ガチャが選択されていません");
        if (currentGacha.isLocked) return alert("🔒 ロックされているため編集できません");

        const editId = document.getElementById('edit-card-id').value;
        const baseName = document.getElementById('input-card-name').value.trim();
        const rarity = document.getElementById('input-card-rarity').value;
        const desc = document.getElementById('input-card-desc').value.trim();
        const imgInput = document.getElementById('input-card-img');
        const imgFiles = imgInput ? imgInput.files : null;

        if (editId) {
            const card = currentGacha.cards.find(c => c.id === editId);
            if (!card) { cancelEditCard(); return alert("編集対象が見つかりません"); }

            btnAdd.innerText = "⏳ 保存中...";
            btnAdd.disabled = true;
            isPulling = true;

            try {
                if (imgFiles && imgFiles.length > 0) {
                    card.img = await processCardImageUpload(imgFiles[0]);
                }
                card.name = baseName || card.name;
                card.rarity = rarity;
                card.desc = desc || "説明なし";

                await saveLocal();
                cancelEditCard();
                renderAdminView();
                alert("✨ カードの情報を更新しました！");
            } catch (e) {
                alert("⚠️ 更新に失敗しました。");
            } finally {
                btnAdd.innerText = "ガチャに実装する！";
                btnAdd.disabled = false;
                isPulling = false;
            }
            return;
        }

        if (!imgFiles || imgFiles.length === 0) return alert("カード画像を選択してください！");

        const filesArray = Array.from(imgFiles);
        btnAdd.innerText = `⏳ 処理中 (0/${filesArray.length})...`;
        btnAdd.disabled = true;
        isPulling = true;

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
            isPulling = false;
        }
    });
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
                <img src="${escapeHTML(card.img)}" style="width:40px; height:40px; object-fit:contain; border-radius:6px;" onerror="this.src='${FALLBACK_IMG}'">
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
                    div.innerHTML = `<img src="${escapeHTML(card.img)}" alt="${escapeHTML(card.name)}" style="object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'"><div class="card-rarity-tag">${card.rarity}</div>`;
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
                div.innerHTML = `<img src="${escapeHTML(card.img)}" alt="${escapeHTML(card.name)}" style="object-fit:contain;" onerror="this.src='${FALLBACK_IMG}'"><div class="card-rarity-tag">${card.rarity}</div>`;
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
        modalImg.src = card.img;
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

    const modalActions = document.querySelector('#modal-card-detail .modal-actions');
    let btnRename = document.getElementById('btn-rename-card-local');
    
    if (!btnRename && modalActions) {
        btnRename = document.createElement('button');
        btnRename.id = 'btn-rename-card-local';
        btnRename.className = 'btn btn-outline';
        btnRename.style.cssText = "width: 100%; margin-bottom: 8px;";
        const closeBtn = document.getElementById('btn-close-modal');
        if (closeBtn) {
            modalActions.insertBefore(btnRename, closeBtn);
        } else {
            modalActions.appendChild(btnRename);
        }
    }

    if (btnRename) {
        btnRename.innerHTML = "✏️ カード名を変更";
        btnRename.onclick = () => renameCardLocally(gachaId, cardId);
    }

    openAppModal('modal-card-detail');
}

async function renameCardLocally(gachaId, cardId) {
    vibrate();
    const gacha = getGachaById(gachaId);
    if (!gacha) return;
    const card = gacha.cards.find(c => c.id === cardId);
    if (!card) return;

    const newName = prompt("新しいカード名を入力してください:", card.name);
    if (!newName || !newName.trim() || newName.trim() === card.name) return;

    card.name = newName.trim();

    await saveLocal();
    
    if (document.getElementById('modal-card-name')) {
        document.getElementById('modal-card-name').innerText = card.name;
    }
    renderCollection();
    updateUI();
    
    alert("✨ この端末でのカード名を変更しました！\n（※元のガチャ共有データには影響しません）");
}

// 🏛️ 天井交換画面（未獲得カード隠蔽 ＆ レアリティ順並び替え）
function openCeilingModal() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;
    const pt = state.mileage[currentGacha.id] || 0;
    
    const container = document.getElementById('ceiling-list-container');
    if (!container) return;
    container.innerHTML = '';

    const inv = state.inventory[currentGacha.id] || {};
    const rarityOrder = ['SLR', 'LR', 'LE', 'UR', 'SSR', 'SR', 'R', 'N', 'C'];

    // レアリティ順にソートして並べる
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
    closeAppModal('modal-ceiling');
    alert("✨ 指定カードを獲得しました！");
}

function sharePullResult() {
    if (!lastPullShareText) return;
    navigator.clipboard.writeText(lastPullShareText).then(() => {
        alert("📋 結果をコピーしました！");
    }).catch(() => {
        prompt("以下のテキストをコピーしてください:", lastPullShareText);
    });
}
