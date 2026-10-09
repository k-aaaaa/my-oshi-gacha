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

// 🛡️ HTML（innerHTML）として組み立てて出力する部分にだけ使うフィルター
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
    stones: 300,      
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
    document.getElementById(id).classList.remove('hidden'); 
    document.body.classList.add('modal-open'); 
}
function closeAppModal(id) { 
    vibrate(); 
    document.getElementById(id).classList.add('hidden'); 
    document.body.classList.remove('modal-open'); 
}

window.addEventListener('DOMContentLoaded', async () => {
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
        
    } catch(e) {
        state = JSON.parse(JSON.stringify(defaultState));
    }

    applyCurrentThemeAndColors();
    applyCustomAppIcon();
    if (document.getElementById('gas-url')) {
        document.getElementById('gas-url').value = GAS_URL;
    }

    if (document.getElementById('settings-splash-time')) {
        document.getElementById('settings-splash-time').value = state.splashTime;
    }
    if (document.getElementById('settings-auto-sync')) {
        document.getElementById('settings-auto-sync').checked = state.autoSync;
    }

    const imgData = localStorage.getItem('my_gacha_welcome_img');
    const splashTime = state.splashTime || 1200;
    if (imgData) {
        document.getElementById('splash-default').classList.add('hidden');
        const customImg = document.getElementById('splash-custom');
        customImg.src = imgData;
        customImg.classList.remove('hidden');
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
});

window.addEventListener('popstate', (e) => {
    const target = e.state ? e.state.tab : 'view-home';
    switchTab(target, false);
});

function switchTab(targetId, pushHistory = true) {
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
        if(state.archivedGachas.some(g => g.id === state.currentGachaId)) {
            state.currentGachaId = state.gachas.length > 0 ? state.gachas[0].id : 'default';
            saveLocal();
        }
        renderGachaSelectors(); renderAdminView();
    }
    if (targetId === 'view-gacha') {
        if(state.archivedGachas.some(g => g.id === state.currentGachaId)) {
            state.currentGachaId = state.gachas.length > 0 ? state.gachas[0].id : 'default';
            saveLocal();
        }
        document.getElementById('btn-share-pull-result').classList.add('hidden');
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
        if (state.autoSync) {
            if (syncTimeoutTimer) clearTimeout(syncTimeoutTimer);
            syncTimeoutTimer = setTimeout(() => cloudSyncSilent(), 1000);
        }
    } catch (e) { 
        alert("⚠️ データの保存に失敗しました。"); 
    }
}

// ==========================================================================
// 💾 バックアップ機能
// ==========================================================================
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
    
    if(!confirm("⚠️ 警告\nデータを読み込むと、現在のデータはすべて上書きされます！\n本当によろしいですか？")) {
        e.target.value = ''; return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const importedState = JSON.parse(ev.target.result);
            if (typeof importedState !== 'object' || importedState === null) throw new Error("データ形式エラー");
            if (!Array.isArray(importedState.gachas)) throw new Error("ガチャデータなし");

            const safeState = { ...defaultState, ...importedState };
            if (!Array.isArray(safeState.archivedGachas)) safeState.archivedGachas = [];
            if (typeof safeState.inventory !== 'object' || safeState.inventory === null) safeState.inventory = {};
            if (typeof safeState.mileage !== 'object' || safeState.mileage === null) safeState.mileage = {};
            
            if (typeof safeState.tickets !== 'object' || safeState.tickets === null) {
                safeState.tickets = { ssr: 0, ur: 0, le: 0, lr: 0, slr: 0 };
            } else {
                if (typeof safeState.tickets.ssr !== 'number') safeState.tickets.ssr = 0;
                if (typeof safeState.tickets.ur !== 'number') safeState.tickets.ur = 0;
                if (typeof safeState.tickets.le !== 'number') safeState.tickets.le = 0;
                if (typeof safeState.tickets.lr !== 'number') safeState.tickets.lr = 0;
                if (typeof safeState.tickets.slr !== 'number') safeState.tickets.slr = 0;
            }
            if (typeof safeState.customColors !== 'object' || safeState.customColors === null) {
                safeState.customColors = defaultState.customColors;
            }

            state = safeState;
            await saveLocal();
            alert("✨ データの復元に成功しました！アプリをリロードします。");
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
    if(!confirm("⚠️ 最終警告\n本当にすべてのデータを初期化（全消去）しますか？")) return;
    localStorage.removeItem('my_gacha_gas_url');
    localStorage.removeItem('my_gacha_welcome_img');
    
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = function () { alert("データを完全に消去しました。アプリを再起動します。"); location.reload(); };
    req.onerror = function () { alert("消去に失敗しました。"); };
    req.onblocked = function () { alert("⚠️ データベースがロックされています。他のタブを閉じてください。"); };
}

// ==========================================================================
// 🎨 カスタマイズ機能
// ==========================================================================
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

    const rgbaToHex = (rgba) => {
        const match = rgba.match(/^rgba?[\s+]?\([\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)/i);
        return (match && match.length === 4) ? "#" + ("0" + parseInt(match[1],10).toString(16)).slice(-2) + ("0" + parseInt(match[2],10).toString(16)).slice(-2) + ("0" + parseInt(match[3],10).toString(16)).slice(-2) : rgba;
    };

    if (document.getElementById('custom-color-bg')) document.getElementById('custom-color-bg').value = rgbaToHex(colors.bg);
    if (document.getElementById('custom-color-panel')) document.getElementById('custom-color-panel').value = rgbaToHex(colors.panel);
    if (document.getElementById('custom-color-accent')) document.getElementById('custom-color-accent').value = rgbaToHex(colors.accent);
}

function updateCustomColor(type, value) { state.customColors[state.appTheme || 'theme-stylish'][type] = value; applyCurrentThemeAndColors(); saveLocal(); }
function resetCurrentThemeColors() { vibrate(); if(!confirm("本当にこのテーマの色を初期状態に戻しますか？")) return; state.customColors[state.appTheme || 'theme-stylish'] = { ...defaultState.customColors[state.appTheme || 'theme-stylish'] }; applyCurrentThemeAndColors(); saveLocal(); alert("初期状態に戻しました！"); }
function changeAppTheme(themeName) { vibrate(); state.appTheme = themeName; applyCurrentThemeAndColors(); saveLocal(); }
function changeImageQuality(val) { vibrate(); state.imageQuality = val; saveLocal(); }

function saveSplashTime(val) { vibrate(); state.splashTime = parseInt(val); saveLocal(); }

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
            saveLocal(); applyCustomAppIcon(); alert("アプリアイコンを画像に変更しました！");
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function clearAppIconImage() { vibrate(); if(!confirm("アイコン画像を初期状態（🎁）に戻しますか？")) return; state.customAppIcon = null; saveLocal(); applyCustomAppIcon(); alert("アイコンを初期に戻しました。"); }

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
    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    
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
            const compressedBase64 = canvas.toDataURL(mimeType, 0.7);

            try {
                localStorage.setItem('my_gacha_welcome_img', compressedBase64);
                document.getElementById('welcome-img-preview').src = compressedBase64;
                document.getElementById('welcome-img-preview-container').classList.remove('hidden');
                alert("🖼️ お出迎え画像を登録しました！");
            } catch(err) {
                alert("⚠️ 画像サイズが大きすぎます。別の画像をお試しください。");
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function clearWelcomeImage() { vibrate(); if(!confirm("スプラッシュ画像を消去しますか？")) return; localStorage.removeItem('my_gacha_welcome_img'); document.getElementById('welcome-img-preview-container').classList.add('hidden'); }

// ==========================================================================
// ☁️ GAS サプライズシェア & 同期実装 & 画像アップロード
// ==========================================================================
function saveGasUrl() { GAS_URL = document.getElementById('gas-url').value.trim(); localStorage.setItem('my_gacha_gas_url', GAS_URL); alert("☁️ GASのURLを保存しました。"); }

function toggleAutoSync(checked) { state.autoSync = checked; saveLocal(); }
function cloudSyncSilent() { 
    if (GAS_URL) fetch(GAS_URL, { method: "POST", body: JSON.stringify(state), headers: { "Content-Type": "text/plain" } }).catch(()=>{}); 
}

function triggerManualSync() {
    vibrate(); 
    if (!GAS_URL) return alert("⚠️ 先に設定でGASのURLを登録してください");
    fetch(GAS_URL, { method: "POST", body: JSON.stringify(state), headers: { "Content-Type": "text/plain" } })
    .then(res => res.json())
    .then(result => {
        if(result.status === "success") {
            alert("☁️ 手動バックアップ（同期）が完了しました！");
        } else {
            throw new Error(result.message || "Sync Failed");
        }
    })
    .catch(() => alert("⚠️ 通信に失敗しました。GASのURLや設定を確認してください。"));
}

// 🖼️ GASへ画像をアップロード（失敗または未設定時はローカル Base64 圧縮にフォールバック）
async function processCardImageUpload(file) {
    const qualityMap = { 'high': 0.9, 'standard': 0.65, 'eco': 0.4 };
    const quality = qualityMap[state.imageQuality] || 0.65;
    
    const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = state.imageQuality === 'high' ? 800 : (state.imageQuality === 'eco' ? 300 : 500);
                let scale = 1;
                if (img.width > MAX_WIDTH) scale = MAX_WIDTH / img.width;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    if (!GAS_URL) return base64Data;

    try {
        const payload = JSON.stringify({
            action: 'uploadImage',
            filename: `card_${Date.now()}.jpg`,
            file: base64Data
        });

        const res = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: payload
        });

        const result = await res.json();
        if (result.status === 'success' && result.url) {
            return result.url;
        }
    } catch (e) {
        console.warn("GAS画像アップロード通信失敗、Base64で保存します:", e);
    }
    return base64Data;
}

if(document.getElementById('btn-share-gacha-gas')) {
    document.getElementById('btn-share-gacha-gas').addEventListener('click', async () => {
        vibrate();
        if(isPulling) return;
        if(!GAS_URL) return alert("⚠️ 設定画面からGASのURLを登録してください！");
        const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
        if (!currentGacha || currentGacha.cards.length === 0) return alert("カードが1枚もありません！");
        
        const exportGacha = JSON.parse(JSON.stringify(currentGacha));
        if(confirm("🔒 このガチャに鍵をかけますか？\n\n【OK】鍵をかける（中身の確認・編集不可）\n【キャンセル】鍵をかけない（相手も改造可能）")) {
            exportGacha.isLocked = true;
        } else { exportGacha.isLocked = false; }
        
        document.getElementById('btn-share-gacha-gas').innerText = "⏳ 準備中...";
        isPulling = true;
        const shareId = "share_" + Date.now();
        const payload = { action: "saveShare", shareId: shareId, gachaData: exportGacha };
        const payloadStr = JSON.stringify(payload);
        
        const sizeMB = new Blob([payloadStr]).size / (1024 * 1024);
        if (sizeMB > 9.5) {
            alert(`⚠️ データサイズが上限を超えています（約${sizeMB.toFixed(1)}MB / 9.5MB）。\nGASの通信制限によりシェアできません。カード枚数を減らしてください。`);
            document.getElementById('btn-share-gacha-gas').innerText = "🔗 シェア";
            isPulling = false;
            return;
        }

        try {
            const res = await fetch(GAS_URL, { method: "POST", body: payloadStr, headers: { "Content-Type": "text/plain" } });
            const result = await res.json();
            if(result.status === "success") {
                const shareUrl = window.location.origin + window.location.pathname + "?surprise=" + shareId + "&api=" + encodeURIComponent(GAS_URL);
                navigator.clipboard.writeText(shareUrl).then(() => { alert("🔗 サプライズURLをコピーしました！LINEやXで友達に送りましょう！\n\n" + shareUrl); }).catch(() => prompt("以下のURLをコピーして送ってください:", shareUrl));
            } else alert("エラーが発生しました。");
        } catch(e) { 
            alert("通信に失敗しました。GASのコードやURL、デプロイ設定(全員になっているか)を確認してください。"); 
        } finally { 
            document.getElementById('btn-share-gacha-gas').innerText = "🔗 シェア"; 
            isPulling = false;
        }
    });
}

async function checkSurpriseShare() {
    const urlParams = new URLSearchParams(window.location.search);
    const surpriseId = urlParams.get('surprise');
    const apiParam = urlParams.get('api');
    
    const activeGasUrl = apiParam ? decodeURIComponent(apiParam) : GAS_URL;

    if (surpriseId) {
        if (!activeGasUrl) {
            alert("⚠️ 送信元の通信URLが見つからないため、ガチャを受け取れません。");
            return;
        }
        try {
            const res = await fetch(activeGasUrl + "?action=getShare&shareId=" + surpriseId);
            const result = await res.json();
            if(result.status === "success" && result.data) {
                const importedGacha = result.data;
                openAppModal('modal-surprise');
                document.getElementById('btn-surprise-open').onclick = () => {
                    vibrate();
                    importedGacha.id = 'imported_' + Date.now(); 
                    state.gachas.push(importedGacha); 
                    state.currentGachaId = importedGacha.id; 
                    state.stones += 3000; 
                    saveLocal(); renderGachaSelectors(); renderAdminView();
                    closeAppModal('modal-surprise');
                    window.history.replaceState({}, document.title, window.location.pathname);
                    switchTab('view-gacha', true);
                    setTimeout(() => alert("✨ 石を3000個プレゼント！今すぐ引いてみよう！"), 500);
                };
            } else {
                alert("⚠️ ガチャデータの取得に失敗しました。データが削除された可能性があります。");
            }
        } catch(e) { 
            console.error("通信エラー:", e); 
            alert("⚠️ 通信エラーが発生しました。電波状況を確認するか、しばらく経ってから再度開いてください。");
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
        totalStones += 3000; 
        if (cycleDay === 3) earnedTickets.ssr += 1;
        if (cycleDay === 6) earnedTickets.ur += 1;
        if (cycleDay === 7) { earnedTickets.le += 1; totalStones += 10000; }
        if (cycleDay === 14) earnedTickets.lr += 1;
        if (cycleDay === 21) { earnedTickets.le += 1; totalStones += 10000; }
        if (cycleDay === 28) earnedTickets.slr += 1;
    }
    state.stones += totalStones; state.tickets.ssr += earnedTickets.ssr; state.tickets.ur += earnedTickets.ur; state.tickets.le += earnedTickets.le; state.tickets.lr += earnedTickets.lr; state.tickets.slr += earnedTickets.slr;

    let bonusText = daysToCatchUp > 1 ? `未ログイン期間のボーナスを一括受取！\n（${daysToCatchUp}日分）\n\n` : `ログイン ${state.loginDays}日目！\n\n`;
    bonusText += `💎石を ${totalStones.toLocaleString()}個 獲得！`;
    if(earnedTickets.ssr > 0) bonusText += `\n🎫SSR確定チケット x${earnedTickets.ssr}`;
    if(earnedTickets.ur > 0) bonusText += `\n🎫UR確定チケット x${earnedTickets.ur}`;
    if(earnedTickets.le > 0) bonusText += `\n🎫LE確定チケット x${earnedTickets.le}`;
    if(earnedTickets.lr > 0) bonusText += `\n🎫LR確定チケット x${earnedTickets.lr}`;
    if(earnedTickets.slr > 0) bonusText += `\n🎫SLR確定チケット x${earnedTickets.slr}`;

    saveLocal();
    setTimeout(() => { alert(`🎁 ログインボーナス\n\n${bonusText}`); fireConfetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } }); }, 600);
}

function renderStampCard() {
    const container = document.getElementById('stamp-card-container'); if(!container) return;
    container.innerHTML = '';
    const current28CycleDay = state.loginDays === 0 ? 1 : ((state.loginDays - 1) % 28) + 1;
    const currentWeek = Math.floor((current28CycleDay - 1) / 7); const weekStart = currentWeek * 7 + 1;
    
    for(let i = 0; i < 7; i++) {
        const dayNum = weekStart + i; const isClaimed = state.loginDays > 0 && current28CycleDay >= dayNum;
        let label = "💎3000";
        if(dayNum===3) label="🎫SSR"; if(dayNum===6) label="🎫UR"; if(dayNum===7) label="🎫LE\n💎1万";
        if(dayNum===14) label="🎫LR"; if(dayNum===21) label="🎫LE\n💎1万"; if(dayNum===28) label="🎫SLR";

        const div = document.createElement('div');
        div.className = `stamp-cell ${(i+1) === 7 ? 'day7' : ''} ${isClaimed ? 'claimed' : ''}`;
        div.innerHTML = `<div class="stamp-day">${dayNum}日目</div><div class="stamp-reward" style="white-space:pre-wrap;">${label}</div>`;
        container.appendChild(div);
    }
}

function triggerPartnerSpeech(isInitial = false) {
    if (!isInitial) vibrate();
    const bubble = document.getElementById('home-message');
    
    if (!state.partner) { bubble.innerText = "図鑑からお気に入りのカードを『相棒』に選んでね！"; return; }
    
    const pGacha = getGachaById(state.partner.gachaId);
    if (!pGacha) { state.partner = null; bubble.innerText = "相棒がいなくなっちゃったみたい…"; saveLocal(); updateUI(); return; }
    
    const card = pGacha.cards.find(c => c.id === state.partner.cardId);
    if (!card) { state.partner = null; bubble.innerText = "相棒のカードが見つからないよ…"; saveLocal(); updateUI(); return; }
    
    if (Math.random() > 0.5 || isInitial) bubble.innerText = card.desc && card.desc !== "説明なし" ? `「${card.desc}」` : `私は「${card.name}」だよ！`;
    else bubble.innerText = "今日も最高の引きを見せてくれよな！";
}

function updateUI() {
    document.getElementById('header-stones').innerText = `💎 ${state.stones.toLocaleString()}`;
    document.getElementById('login-days').innerText = state.loginDays;
    document.getElementById('total-spent-stones').innerText = state.totalSpent.toLocaleString();
    renderStampCard(); 

    const currentGacha = getGachaById(state.currentGachaId);
    if (!currentGacha) {
        document.getElementById('current-gacha-title').innerText = "ガチャがありません";
        document.getElementById('comp-percent').innerText = "0"; document.getElementById('comp-fraction').innerText = "0 / 0";
    } else {
        const isArchived = state.archivedGachas.some(g => g.id === currentGacha.id);
        document.getElementById('current-gacha-title').innerText = (isArchived ? "[撤去済] " : "") + currentGacha.title;
        
        if (currentGacha.cards.length > 0) {
            const inv = state.inventory[currentGacha.id] || {};
            const typesGot = Object.keys(inv).filter(cardId => inv[cardId] > 0).length;
            const total = currentGacha.cards.length;
            document.getElementById('comp-percent').innerText = Math.floor((typesGot / total) * 100);
            document.getElementById('comp-fraction').innerText = `${typesGot} / ${total}`;
        } else {
            document.getElementById('comp-percent').innerText = 0; document.getElementById('comp-fraction').innerText = `0 / 0`;
        }
    }

    const partnerImg = document.getElementById('home-partner-img');
    const partnerStar = document.getElementById('home-partner-star');
    if (state.partner) {
        const pGacha = getGachaById(state.partner.gachaId);
        if (pGacha) {
            const pCard = pGacha.cards.find(c => c.id === state.partner.cardId);
            if (pCard) {
                partnerImg.src = pCard.img; partnerImg.classList.remove('hidden');
                if (((state.inventory[state.partner.gachaId] || {})[state.partner.cardId] || 0) >= 100) partnerStar.classList.remove('hidden');
                else partnerStar.classList.add('hidden');
            }
        }
    } else {
        partnerImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='%23ccc'/><text x='50' y='55' font-size='30' text-anchor='middle'>❓</text></svg>";
        partnerStar.classList.add('hidden');
    }
}

// ==========================================================================
// 🎰 ガチャ実行
// ==========================================================================
function renderGachaScreen() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const statusText = document.getElementById('gacha-screen-status');
    const actionControls = document.getElementById('gacha-action-controls');
    const ticketControls = document.getElementById('ticket-action-controls');
    ticketControls.innerHTML = "";
    
    document.getElementById('current-mileage').innerText = currentGacha ? (state.mileage[currentGacha.id] || 0) : 0;

    if (!currentGacha) {
        statusText.innerText = "ガチャがありません";
        actionControls.innerHTML = `<p style="text-align:center;width:100%;font-size:12px;opacity:0.6;">⚙️「作る」タブからガチャを作成してね</p>`;
        return;
    }
    statusText.innerText = "最高レアを引き当てろ！";
    actionControls.innerHTML = `<button id="btn-pull-1" class="btn btn-gacha" onclick="pullGacha(1)" ${isPulling ? 'disabled' : ''}>単発 (💎30)</button><button id="btn-pull-10" class="btn btn-gacha-10" onclick="pullGacha(10)" ${isPulling ? 'disabled' : ''}>10連 (💎300)</button>`;
    
    if (state.tickets.ssr > 0) ticketControls.innerHTML += `<button onclick="pullGacha(1, 'ssr')" class="btn btn-ticket-trigger" ${isPulling ? 'disabled' : ''}>🎫 SSR以上確定で引く (${state.tickets.ssr}枚)</button>`;
    if (state.tickets.ur > 0) ticketControls.innerHTML += `<button onclick="pullGacha(1, 'ur')" class="btn btn-ticket-trigger" style="background:linear-gradient(135deg, #00d4ff, #7b2ff7); color:white;" ${isPulling ? 'disabled' : ''}>🎫 UR以上確定で引く (${state.tickets.ur}枚)</button>`;
    if (state.tickets.le > 0) ticketControls.innerHTML += `<button onclick="pullGacha(1, 'le')" class="btn btn-ticket-trigger" style="background:linear-gradient(135deg, #ff00cc, #4a00e0); color:white;" ${isPulling ? 'disabled' : ''}>🎫 LE以上確定で引く (${state.tickets.le}枚)</button>`;
    if (state.tickets.lr > 0) ticketControls.innerHTML += `<button onclick="pullGacha(1, 'lr')" class="btn btn-ticket-trigger" style="background:linear-gradient(135deg, #ff3333, #990000); color:white;" ${isPulling ? 'disabled' : ''}>🎫 LR以上確定で引く (${state.tickets.lr}枚)</button>`;
    if (state.tickets.slr > 0) ticketControls.innerHTML += `<button onclick="pullGacha(1, 'slr')" class="btn btn-ticket-trigger" style="background:linear-gradient(135deg, #ffffff, #aaaaaa); color:black; border: 2px solid #ff3333;" ${isPulling ? 'disabled' : ''}>🎫 SLR確定で引く (${state.tickets.slr}枚)</button>`;
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
            return alert("⚠️ 対象レアリティー未実装！\nこのガチャには確定対象となるレアリティのカードが1枚も入っていないため、チケットは使えません。");
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
    resultsContainer.innerHTML = '';
    
    results.forEach((card, index) => {
        setTimeout(() => {
            const cardEl = document.createElement('div');
            cardEl.className = `card ${card.rarity}`;
            cardEl.innerHTML = `<img src="${escapeHTML(card.img)}" alt="${escapeHTML(card.name)}"><div class="card-rarity-tag">${card.rarity}</div>`;
            cardEl.onclick = () => openCardDetailModal(currentGacha.id, card.id);
            resultsContainer.appendChild(cardEl);
            vibrate();
            if (['SLR', 'LR', 'LE'].includes(card.rarity)) {
                fireConfetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
            }
            if (index === results.length - 1) {
                isPulling = false;
                renderGachaScreen();
                document.getElementById('btn-share-pull-result').classList.remove('hidden');
            }
        }, index * 150);
    });
}

// ==========================================================================
// 🛠️ カード作成・編集・管理
// ==========================================================================
function setupAdminCardListener() {
    const btnAdd = document.getElementById('btn-add-card');
    if (!btnAdd) return;

    btnAdd.addEventListener('click', async () => {
        if (isPulling) return;
        const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
        if (!currentGacha) return alert("ガチャが選択されていません");
        if (currentGacha.isLocked) return alert("🔒 このガチャはロックされているため編集できません");

        const editId = document.getElementById('edit-card-id').value;
        const name = document.getElementById('input-card-name').value.trim();
        const rarity = document.getElementById('input-card-rarity').value;
        const desc = document.getElementById('input-card-desc').value.trim();
        const imgFile = document.getElementById('input-card-img').files[0];

        if (!name) return alert("カード名を入力してください");

        let imgUrl = "";
        if (editId) {
            const existingCard = currentGacha.cards.find(c => c.id === editId);
            if (existingCard) imgUrl = existingCard.img;
        }

        if (imgFile) {
            btnAdd.innerText = "⏳ 画像処理中...";
            btnAdd.disabled = true;
            isPulling = true;

            imgUrl = await processCardImageUpload(imgFile);

            btnAdd.innerText = "ガチャに実装する！";
            btnAdd.disabled = false;
            isPulling = false;
        }

        if (!imgUrl) return alert("カード画像を選択してください");

        if (editId) {
            const card = currentGacha.cards.find(c => c.id === editId);
            if (card) {
                card.name = name;
                card.rarity = rarity;
                card.desc = desc || "説明なし";
                card.img = imgUrl;
            }
        } else {
            const newCard = {
                id: 'card_' + Date.now(),
                name: name,
                rarity: rarity,
                desc: desc || "説明なし",
                img: imgUrl
            };
            currentGacha.cards.push(newCard);
        }

        await saveLocal();
        cancelEditCard();
        renderAdminView();
        alert("✨ カードを保存しました！");
    });
}

function cancelEditCard() {
    document.getElementById('edit-card-id').value = '';
    document.getElementById('input-card-name').value = '';
    document.getElementById('input-card-desc').value = '';
    document.getElementById('input-card-img').value = '';
    document.getElementById('edit-img-hint').classList.add('hidden');
    document.getElementById('btn-cancel-edit-card').classList.add('hidden');
    document.getElementById('btn-add-card').innerText = "ガチャに実装する！";
}

function renderGachaSelectors() {
    const selectors = ['gacha-selector', 'collection-gacha-selector'];
    selectors.forEach(id => {
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
    const lockedWarning = document.getElementById('admin-locked-warning');
    const editorSection = document.getElementById('admin-editor-section');
    const cardList = document.getElementById('admin-card-list');

    if (!currentGacha) return;

    if (currentGacha.isLocked) {
        lockedWarning.classList.remove('hidden');
        editorSection.classList.add('hidden');
        return;
    } else {
        lockedWarning.classList.add('hidden');
        editorSection.classList.remove('hidden');
    }

    if (!cardList) return;
    cardList.innerHTML = '';

    currentGacha.cards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'admin-card-item';
        div.innerHTML = `
            <div class="admin-card-info">
                <img src="${escapeHTML(card.img)}" class="admin-card-img">
                <div>
                    <span style="font-size:10px; font-weight:bold; opacity:0.6;">[${card.rarity}]</span>
                    <div class="admin-card-name">${escapeHTML(card.name)}</div>
                </div>
            </div>
            <div>
                <button onclick="editCard('${card.id}')" class="btn btn-outline" style="padding:4px 8px; font-size:10px;">編集</button>
                <button onclick="deleteCard('${card.id}')" class="btn btn-text-danger" style="padding:4px 8px; font-size:10px;">削除</button>
            </div>
        `;
        cardList.appendChild(div);
    });
}

function editCard(cardId) {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;
    const card = currentGacha.cards.find(c => c.id === cardId);
    if (!card) return;

    document.getElementById('edit-card-id').value = card.id;
    document.getElementById('input-card-name').value = card.name;
    document.getElementById('input-card-rarity').value = card.rarity;
    document.getElementById('input-card-desc').value = card.desc;
    document.getElementById('edit-img-hint').classList.remove('hidden');
    document.getElementById('btn-cancel-edit-card').classList.remove('hidden');
    document.getElementById('btn-add-card').innerText = "カードを更新する！";
}

function deleteCard(cardId) {
    vibrate();
    if (!confirm("本当にこのカードを削除しますか？")) return;
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;
    currentGacha.cards = currentGacha.cards.filter(c => c.id !== cardId);
    saveLocal();
    renderAdminView();
}

function renderCollection() {
    const grid = document.getElementById('collection-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const selId = document.getElementById('collection-gacha-selector').value;
    const currentGacha = getGachaById(selId);
    if (!currentGacha) return;

    const sortType = document.getElementById('collection-sort-selector').value;
    const inv = state.inventory[currentGacha.id] || {};
    const rarityOrder = ['SLR', 'LR', 'LE', 'UR', 'SSR', 'SR', 'R', 'N', 'C'];

    let cards = [...currentGacha.cards];
    if (sortType === 'rarity') {
        cards.sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));
    } else if (sortType === 'newest') {
        cards.reverse();
    }

    cards.forEach(card => {
        const count = inv[card.id] || 0;
        const div = document.createElement('div');
        if (count > 0) {
            div.className = `card ${card.rarity}`;
            div.innerHTML = `<img src="${escapeHTML(card.img)}" alt="${escapeHTML(card.name)}"><div class="card-rarity-tag">${card.rarity}</div>`;
            div.onclick = () => openCardDetailModal(currentGacha.id, card.id);
        } else {
            div.className = 'item-empty';
            div.innerText = '❓ 未獲得';
        }
        grid.appendChild(div);
    });
}

function openCardDetailModal(gachaId, cardId) {
    const gacha = getGachaById(gachaId);
    if (!gacha) return;
    const card = gacha.cards.find(c => c.id === cardId);
    if (!card) return;

    const count = (state.inventory[gachaId] || {})[cardId] || 0;
    document.getElementById('modal-card-rarity').innerText = card.rarity;
    document.getElementById('modal-card-img').src = card.img;
    document.getElementById('modal-card-name').innerText = card.name;
    document.getElementById('modal-card-count').innerText = count;
    document.getElementById('modal-card-desc').innerText = card.desc;

    document.getElementById('btn-set-partner').onclick = () => {
        state.partner = { gachaId: gachaId, cardId: cardId };
        saveLocal();
        closeAppModal('modal-card-detail');
        alert(`✨ ${card.name} を相棒に設定しました！`);
    };

    openAppModal('modal-card-detail');
}

function openCeilingModal() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha) return;
    const pt = state.mileage[currentGacha.id] || 0;
    const container = document.getElementById('ceiling-list-container');
    container.innerHTML = '';

    currentGacha.cards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'exchange-item';
        div.innerHTML = `
            <div class="exchange-item-left">
                <img src="${escapeHTML(card.img)}" class="exchange-img">
                <div class="exchange-name-box">
                    <span class="exchange-rarity-tag">${card.rarity}</span>
                    <span class="exchange-name">${escapeHTML(card.name)}</span>
                </div>
            </div>
            <button class="exchange-btn" ${pt < 5000 ? 'disabled' : ''} onclick="exchangeCeilingCard('${card.id}')">交換 (5000pt)</button>
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
