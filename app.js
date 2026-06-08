// ==========================================================================
// 🔑 1. 4桁パスワード認証システム
// ==========================================================================
(function() {
    let savedPass = localStorage.getItem('my_gacha_password');
    if (!savedPass) {
        savedPass = prompt("【初回設定】\nガチャメーカー専用のパスワードを半角数字で決めてください。\n(例: 0000 など自由な数字)");
        if (savedPass) localStorage.setItem('my_gacha_password', savedPass);
        else savedPass = "0000";
    }
    const authKey = "app_auth_my_gacha";
    if (sessionStorage.getItem(authKey) !== "true") {
        if (prompt("パスワードを入力してください") === savedPass) {
            sessionStorage.setItem(authKey, "true");
        } else {
            document.body.innerHTML = "<div style='padding:50px;text-align:center;'><h1>認証失敗</h1><button onclick='location.reload()'>再試行</button></div>";
            throw new Error("Auth failed");
        }
    }
})();

function vibrate() { if (navigator.vibrate) navigator.vibrate(15); }

// ==========================================================================
// 💾 2. グローバルセーブデータ構造 (カラーカスタム記憶対応)
// ==========================================================================
let state = JSON.parse(localStorage.getItem('my_gacha_universe_state')) || {
    gachas: [{ id: 'default', title: 'はじまりのガチャ', cards: [], isLocked: false }], 
    currentGachaId: 'default',
    inventory: {},    
    stones: 300,      
    totalSpent: 0,
    loginDays: 0,
    lastLoginDate: "",
    tickets: { ssr: 0, ur: 0, le: 0 }, 
    partner: null,    
    appTheme: 'theme-stylish',
    autoSync: false,
    splashTime: 1200,
    // 🎨 テーマ別のカスタムカラー記憶枠
    customColors: {
        'theme-stylish': { bg: '#cbd5e1', text: '#1d1d1f', primary: '#1d1d1f' },
        'theme-cute': { bg: '#fff0f5', text: '#4a3737', primary: '#ffb3c1' },
        'theme-gaming': { bg: '#050508', text: '#00ffcc', primary: '#00ffcc' },
        'theme-glitter': { bg: '#03010a', text: '#ffffff', primary: '#8a2be2' }
    }
};
let GAS_URL = localStorage.getItem('my_gacha_gas_url') || "";

// 相棒のランダム日替わり基本セリフ集
const dailySpeeches = [
    "今日も最高の引きを見せてくれよな！",
    "画面をタップすると私のセリフが変わるぞ！",
    "100枚被ると『青ラメ進化』ができるらしい…！",
    "設定画面から、このテーマの色を自由に変えられるようになったぞ！🎨",
    "毎日ログインすると、豪華な確定チケットが手に入るんだ。",
    "コンプリートしたら『殿堂入り』させてくれよな！",
    "無理のない範囲で、楽しくガチャを回そう！"
];

// ==========================================================================
// 🚀 3. アプリ起動時のイベント処理
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
    // 🎨 テーマと記憶しているカスタムカラーの即時注入
    applyCurrentThemeAndColors();

    // お出迎え画面（スプラッシュ）の処理
    const imgData = localStorage.getItem('my_gacha_welcome_img');
    const splashTime = state.splashTime || 1200;
    if (imgData) {
        document.getElementById('splash-default').classList.add('hidden');
        const customImg = document.getElementById('splash-custom');
        customImg.src = imgData;
        customImg.classList.remove('hidden');
    }
    setTimeout(() => {
        const splash = document.getElementById('splash');
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.remove(), 500);
        }
    }, splashTime);

    // システムの初期動作
    checkUrlForShare();
    checkLoginBonus();
    updateUI();
    renderGachaSelectors();
    triggerPartnerSpeech(true); 
});

function saveLocal() {
    localStorage.setItem('my_gacha_universe_state', JSON.stringify(state));
    updateUI();
    if (state.autoSync) cloudSyncSilent();
}

// ==========================================================================
// 🎨 4. カラーカスタマイズ制御エンジン
// ==========================================================================
function applyCurrentThemeAndColors() {
    const theme = state.appTheme || 'theme-stylish';
    document.body.className = theme;

    const themeSel = document.getElementById('theme-selector');
    if (themeSel) themeSel.value = theme;

    // データ破損対策用の初期化チェック
    if (!state.customColors) {
        state.customColors = {
            'theme-stylish': { bg: '#cbd5e1', text: '#1d1d1f', primary: '#1d1d1f' },
            'theme-cute': { bg: '#fff0f5', text: '#4a3737', primary: '#ffb3c1' },
            'theme-gaming': { bg: '#050508', text: '#00ffcc', primary: '#00ffcc' },
            'theme-glitter': { bg: '#03010a', text: '#ffffff', primary: '#8a2be2' }
        };
    }
    if (!state.customColors[theme]) {
        state.customColors[theme] = { bg: '#cbd5e1', text: '#1d1d1f', primary: '#1d1d1f' };
    }

    const colors = state.customColors[theme];
    const root = document.documentElement;

    // 選択された色に合わせてCSS変数を動的に上書き（グラデーションも自動生成）
    if (theme === 'theme-stylish') {
        root.style.setProperty('--stylish-bg', `radial-gradient(circle at 20% 20%, #ffffff 0%, ${colors.bg} 100%)`);
        root.style.setProperty('--stylish-text', colors.text);
        root.style.setProperty('--stylish-primary', colors.primary);
    } else if (theme === 'theme-cute') {
        root.style.setProperty('--cute-bg', `linear-gradient(135deg, #ffffff 0%, ${colors.bg} 100%)`);
        root.style.setProperty('--cute-text', colors.text);
        root.style.setProperty('--cute-primary', colors.primary);
    } else if (theme === 'theme-gaming') {
        root.style.setProperty('--gaming-bg', `radial-gradient(circle at center, rgba(0,0,0,0.4) 0%, ${colors.bg} 100%)`);
        root.style.setProperty('--gaming-text', colors.text);
        root.style.setProperty('--gaming-primary', colors.primary);
    } else if (theme === 'theme-glitter') {
        root.style.setProperty('--glitter-bg', `linear-gradient(135deg, #0e0524 0%, ${colors.bg} 60%, #000000 100%)`);
        root.style.setProperty('--glitter-text', colors.text);
        root.style.setProperty('--glitter-primary', colors.primary);
        root.style.setProperty('--glitter-reflect', colors.primary + "66"); // 透明度を追加
    }

    // カラーピッカーのつまみの位置を同期
    const pickerBg = document.getElementById('custom-color-bg');
    const pickerText = document.getElementById('custom-color-text');
    const pickerPrimary = document.getElementById('custom-color-primary');

    if (pickerBg) pickerBg.value = colors.bg.startsWith('#') ? colors.bg : '#cbd5e1';
    if (pickerText) pickerText.value = colors.text.startsWith('#') ? colors.text : '#1d1d1f';
    if (pickerPrimary) pickerPrimary.value = colors.primary.startsWith('#') ? colors.primary : '#1d1d1f';
}

function updateCustomColor(type, value) {
    const theme = state.appTheme || 'theme-stylish';
    state.customColors[theme][type] = value;
    applyCurrentThemeAndColors();
    saveLocal();
}

function resetCurrentThemeColors() {
    vibrate();
    const theme = state.appTheme || 'theme-stylish';
    const defaults = {
        'theme-stylish': { bg: '#cbd5e1', text: '#1d1d1f', primary: '#1d1d1f' },
        'theme-cute': { bg: '#fff0f5', text: '#4a3737', primary: '#ffb3c1' },
        'theme-gaming': { bg: '#050508', text: '#00ffcc', primary: '#00ffcc' },
        'theme-glitter': { bg: '#03010a', text: '#ffffff', primary: '#8a2be2' }
    };
    state.customColors[theme] = { ...defaults[theme] };
    applyCurrentThemeAndColors();
    saveLocal();
    alert("このテーマのカラーリングを初期状態に戻しました！");
}

function changeAppTheme(themeName) {
    vibrate();
    state.appTheme = themeName;
    applyCurrentThemeAndColors();
    saveLocal();
}

// ==========================================================================
// 📱 5. タブ切り替えシステム
// ==========================================================================
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        vibrate();
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        document.getElementById(btn.dataset.target).classList.add('active');
        btn.classList.add('active');
        
        if (btn.dataset.target === 'view-collection') renderCollection();
        if (btn.dataset.target === 'view-admin') renderGachaSelectors();
        if (btn.dataset.target === 'view-gacha') renderGachaScreen();
    });
});

// ==========================================================================
// 🎁 6. 寸止めログインボーナスシステム
// ==========================================================================
function checkLoginBonus() {
    const today = new Date().toLocaleDateString('ja-JP');
    if (state.lastLoginDate !== today) {
        state.lastLoginDate = today;
        state.loginDays += 1;
        state.stones += 300; 
        
        if (!state.tickets) state.tickets = { ssr: 0, ur: 0, le: 0 };
        let bonusText = `💎 毎日ログインボーナス 300個 獲得！\n(通算 ${state.loginDays}日目)`;
        
        if (state.loginDays % 30 === 0) {
            state.tickets.le += 1;
            bonusText += `\n\n🎉 通算30日達成！\n🎫 【LE以上確定チケット】をGET！(最高レアの手前！)`;
        } else if (state.loginDays % 14 === 0) {
            state.tickets.ur += 1;
            bonusText += `\n\n🎉 通算14日達成！\n🎫 【UR以上確定チケット】をGET！`;
        } else if (state.loginDays % 7 === 0) {
            state.tickets.ssr += 1;
            bonusText += `\n\n🎉 通算7日達成！\n🎫 【SSR以上確定チケット】をGET！`;
        }
        
        const panel = document.getElementById('login-bonus-panel');
        panel.innerHTML = `<div style="font-size:14px;font-weight:900;margin-bottom:5px;">🎁 本日のログインボーナス</div><p style="white-space:pre-wrap; font-size:12px; margin:0;">${bonusText}</p>`;
        panel.classList.remove('hidden');
        saveLocal();
        
        setTimeout(() => { confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } }); }, 600);
    }
}

// ==========================================================================
// 📢 7. 相棒セリフ＆タップ連動システム
// ==========================================================================
function triggerPartnerSpeech(isInitial = false) {
    if (!isInitial) vibrate();
    const bubble = document.getElementById('home-message');
    
    if (!state.partner) {
        bubble.innerText = "図鑑からお気に入りのカードを『ホームの相棒』に選んでね！";
        return;
    }

    const currentGacha = state.gachas.find(g => g.id === state.partner.gachaId);
    if (!currentGacha) return;
    const card = currentGacha.cards.find(c => c.id === state.partner.cardId);
    if (!card) return;

    const inv = state.inventory[state.partner.gachaId] || {};
    const count = inv[state.partner.cardId] || 0;

    if (Math.random() > 0.5 || isInitial) {
        if (count >= 100) {
            bubble.innerText = `✨青ラメ進化中✨「${card.name}」の輝きが極まっている…！`;
        } else {
            bubble.innerText = card.desc && card.desc !== "説明なし" ? `「${card.desc}」` : `私は「${card.name}」だよ！`;
        }
    } else {
        const rand = Math.floor(Math.random() * dailySpeeches.length);
        bubble.innerText = dailySpeeches[rand];
    }
}

// ==========================================================================
// 📊 8. UI画面全体の更新処理
// ==========================================================================
function updateUI() {
    document.getElementById('header-stones').innerText = `💎 ${state.stones}`;
    document.getElementById('login-days').innerText = state.loginDays;
    document.getElementById('total-spent-stones').innerText = state.totalSpent;
    
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    document.getElementById('current-gacha-title').innerText = currentGacha ? currentGacha.title : "ガチャメーカー";

    const lockNotice = document.getElementById('gacha-locked-notice');
    const createPanel = document.getElementById('card-create-panel');
    if (currentGacha && currentGacha.isLocked) {
        if (lockNotice) lockNotice.classList.remove('hidden');
        if (createPanel) createPanel.classList.add('hidden');
    } else {
        if (lockNotice) lockNotice.classList.add('hidden');
        if (createPanel) createPanel.classList.remove('hidden');
    }

    if (currentGacha && currentGacha.cards.length > 0) {
        if (!state.inventory[currentGacha.id]) state.inventory[currentGacha.id] = {};
        const inv = state.inventory[currentGacha.id];
        const typesGot = Object.keys(inv).filter(cardId => inv[cardId] > 0).length;
        const total = currentGacha.cards.length;
        const percent = Math.floor((typesGot / total) * 100);
        document.getElementById('comp-percent').innerText = percent;
        document.getElementById('comp-fraction').innerText = `${typesGot} / ${total}`;
    } else {
        document.getElementById('comp-percent').innerText = 0;
        document.getElementById('comp-fraction').innerText = `0 / 0`;
    }

    const partnerImg = document.getElementById('home-partner-img');
    const partnerStar = document.getElementById('home-partner-star');
    if (state.partner) {
        const pGacha = state.gachas.find(g => g.id === state.partner.gachaId);
        if (pGacha) {
            const pCard = pGacha.cards.find(c => c.id === state.partner.cardId);
            if (pCard) {
                partnerImg.src = pCard.img;
                partnerImg.classList.remove('hidden');
                const inv = state.inventory[state.partner.gachaId] || {};
                if ((inv[state.partner.cardId] || 0) >= 100) {
                    partnerStar.classList.remove('hidden');
                } else {
                    partnerStar.classList.add('hidden');
                }
            }
        }
    } else {
        partnerImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='%23ccc'/><text x='50' y='55' font-size='30' text-anchor='middle'>❓</text></svg>";
        partnerStar.classList.add('hidden');
    }

    const autoSyncEl = document.getElementById('settings-auto-sync');
    if (autoSyncEl) autoSyncEl.checked = state.autoSync || false;
    
    const gasUrlEl = document.getElementById('gas-url');
    if (gasUrlEl) gasUrlEl.value = GAS_URL;

    const previewImg = localStorage.getItem('my_gacha_welcome_img');
    if (previewImg) {
        const previewEl = document.getElementById('welcome-img-preview');
        const containerEl = document.getElementById('welcome-img-preview-container');
        if(previewEl && containerEl) {
            previewEl.src = previewImg;
            containerEl.classList.remove('hidden');
        }
    }
    
    const splashTimeEl = document.getElementById('settings-splash-time');
    if (splashTimeEl) splashTimeEl.value = state.splashTime || 1200;
}

// ==========================================================================
// 🕹️ 9. ガチャ画面描画＆チケットコントロール
// ==========================================================================
function renderGachaScreen() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const statusText = document.getElementById('gacha-screen-status');
    const actionControls = document.getElementById('gacha-action-controls');
    const ticketControls = document.getElementById('ticket-action-controls');
    
    ticketControls.innerHTML = "";

    if (currentGacha && currentGacha.isLocked) {
        statusText.innerText = "🏆 殿堂入り伝説ガチャ（引き放題！）";
        actionControls.innerHTML = `
            <button onclick="pullGacha(1, false, true)" class="btn btn-gacha" style="width:48%;">伝説の単発</button>
            <button onclick="pullGacha(10, false, true)" class="btn btn-gacha-10" style="width:48%;">伝説の10連</button>
        `;
    } else {
        statusText.innerText = "最高レアを引き当てろ！";
        actionControls.innerHTML = `
            <button id="btn-pull-1" onclick="pullGacha(1)" class="btn btn-gacha">単発 (💎30)</button>
            <button id="btn-pull-10" onclick="pullGacha(10)" class="btn btn-gacha-10">10連 (💎300)</button>
        `;
        
        if (!state.tickets) state.tickets = { ssr: 0, ur: 0, le: 0 };
        if (state.tickets.ssr > 0) {
            ticketControls.innerHTML += `<button onclick="pullGacha(1, 'ssr')" class="btn btn-ticket-trigger">🎫 SSR以上確定で引く (${state.tickets.ssr}枚所持)</button>`;
        }
        if (state.tickets.ur > 0) {
            ticketControls.innerHTML += `<button onclick="pullGacha(1, 'ur')" class="btn btn-ticket-trigger" style="background:linear-gradient(135deg, #00d4ff, #7b2ff7); color:white;">🎫 UR以上確定で引く (${state.tickets.ur}枚所持)</button>`;
        }
        if (state.tickets.le > 0) {
            ticketControls.innerHTML += `<button onclick="pullGacha(1, 'le')" class="btn btn-ticket-trigger" style="background:linear-gradient(135deg, #ff00cc, #4a00e0); color:white;">🎫 LE以上確定で引く (${state.tickets.le}枚所持)</button>`;
        }
    }
}

// ==========================================================================
// 🎰 10. ガチャ排出処理（9段階レアリティ＆寸止め対応）
// ==========================================================================
function pullGacha(times, ticketType = false, isLegendFree = false) {
    vibrate();
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha || currentGacha.cards.length === 0) {
        return alert("このガチャにはまだ景品がありません。⚙️「作る」から画像を登録してください！");
    }

    if (!isLegendFree) {
        if (ticketType) {
            if (state.tickets[ticketType] < 1) return;
            state.tickets[ticketType] -= 1;
        } else {
            const cost = times * 30;
            if (state.stones < cost) return alert("💎石が足りません！毎日のログボを待ってね！");
            state.stones -= cost;
            state.totalSpent += cost;
        }
    }

    const container = document.getElementById('gacha-result-container');
    container.innerHTML = "";
    if (!state.inventory[currentGacha.id]) state.inventory[currentGacha.id] = {};
    const inv = state.inventory[currentGacha.id];
    
    let highestRarity = 'C';
    const rarityOrder = ['C', 'N', 'R', 'SR', 'SSR', 'UR', 'LE', 'LR', 'SLR'];

    for (let i = 0; i < times; i++) {
        let rand = Math.random() * 100;
        let selectedRarity = 'N';
        
        if (ticketType === 'le') {
            if (rand < 5) selectedRarity = 'SLR';
            else if (rand < 20) selectedRarity = 'LR';
            else selectedRarity = 'LE';
        } else if (ticketType === 'ur') {
            if (rand < 1) selectedRarity = 'SLR';
            else if (rand < 5) selectedRarity = 'LR';
            else if (rand < 15) selectedRarity = 'LE';
            else selectedRarity = 'UR';
        } else if (ticketType === 'ssr') {
            if (rand < 0.1) selectedRarity = 'SLR';
            else if (rand < 0.5) selectedRarity = 'LR';
            else if (rand < 2) selectedRarity = 'LE';
            else if (rand < 10) selectedRarity = 'UR';
            else selectedRarity = 'SSR';
        } else {
            if (rand < 0.01) selectedRarity = 'SLR';
            else if (rand < 0.05) selectedRarity = 'LR';
            else if (rand < 0.2) selectedRarity = 'LE';
            else if (rand < 0.7) selectedRarity = 'UR';
            else if (rand < 4.5) selectedRarity = 'SSR';
            else if (rand < 15.0) selectedRarity = 'SR';
            else if (rand < 35.0) selectedRarity = 'R';
            else if (rand < 85.0) selectedRarity = 'N';
            else selectedRarity = 'C';
        }

        let pool = currentGacha.cards.filter(c => c.rarity === selectedRarity);
        if (pool.length === 0) pool = currentGacha.cards; 

        let card = pool[Math.floor(Math.random() * pool.length)];
        inv[card.id] = (inv[card.id] || 0) + 1;
        
        if (rarityOrder.indexOf(selectedRarity) > rarityOrder.indexOf(highestRarity)) {
            highestRarity = selectedRarity;
        }

        const cardDiv = document.createElement('div');
        cardDiv.className = `card ${card.rarity}`;
        let blueStarHtml = inv[card.id] >= 100 ? `<div class="blue-star-evolved"></div>` : '';
        
        cardDiv.innerHTML = `
            ${blueStarHtml}
            <img src="${card.img}">
            <div class="card-rarity-tag">${card.rarity}</div>
        `;
        cardDiv.onclick = () => openModal(currentGacha.id, card.id);
        container.appendChild(cardDiv);
    }

    if (rarityOrder.indexOf(highestRarity) >= rarityOrder.indexOf('SSR')) {
        setTimeout(() => { confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } }); }, 200);
    }
    
    saveLocal();
    if (!isLegendFree) renderGachaScreen();
}

// ==========================================================================
// 📖 11. 図鑑（コレクション）＆🏆殿堂入りロック処理
// ==========================================================================
function renderCollection() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const grid = document.getElementById('collection-grid');
    const fameBtn = document.getElementById('btn-hall-of-fame');
    grid.innerHTML = '';
    
    if (!currentGacha || currentGacha.cards.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; opacity:0.5; margin-top:40px; font-weight:bold;">カードが1枚も登録されていません</div>';
        fameBtn.classList.add('hidden');
        return;
    }

    const inv = state.inventory[currentGacha.id] || {};
    const rarityOrder = { 'SLR':0, 'LR':1, 'LE':2, 'UR':3, 'SSR':4, 'SR':5, 'R':6, 'N':7, 'C':8 };
    let sortedCards = [...currentGacha.cards].sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);

    let typesGot = 0;
    sortedCards.forEach(card => {
        const count = inv[card.id] || 0;
        const div = document.createElement('div');
        
        if (count > 0) {
            typesGot++;
            div.className = `card ${card.rarity}`;
            let blueStarHtml = count >= 100 ? `<div class="blue-star-evolved"></div>` : '';
            div.innerHTML = `
                ${blueStarHtml}
                <img src="${card.img}">
                <div class="card-rarity-tag">${card.rarity}</div>
            `;
            div.onclick = () => openModal(currentGacha.id, card.id);
        } else {
            div.className = `card`;
            div.innerHTML = `<div class="item-empty">???<br><span style="opacity:0.5;font-size:9px;">${card.rarity}</span></div>`;
        }
        grid.appendChild(div);
    });

    if (typesGot === currentGacha.cards.length && !currentGacha.isLocked) {
        fameBtn.classList.remove('hidden');
        fameBtn.onclick = () => triggerHallOfFame(currentGacha.id);
    } else {
        fameBtn.classList.add('hidden');
    }
}

function triggerHallOfFame(gachaId) {
    vibrate();
    const gacha = state.gachas.find(g => g.id === gachaId);
    if (!gacha) return;
    
    if (confirm(`🏆 ガチャ「${gacha.title}」を殿堂入りさせますか？\n\n【殿堂入りの特典とルール】\n・これ以降カードの新規追加はできなくなります。\n・このガチャは今後【永久に無料引き放題】になります！\n・ご褒美として『LE以上確定チケット』を1枚プレゼント！`)) {
        gacha.isLocked = true;
        if (!state.tickets) state.tickets = { ssr: 0, ur: 0, le: 0 };
        state.tickets.le += 1; 
        saveLocal();
        confetti({ particleCount: 200, spread: 100, origin: { y: 0.4 } });
        alert(`🏆 祝・殿堂入り！\nガチャ「${gacha.title}」はレジェンドとなりました！`);
        renderCollection();
    }
}

// ==========================================================================
// 🖼️ 12. お出迎え設定 ＆ GAS同期
// ==========================================================================
function saveWelcomeImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            localStorage.setItem('my_gacha_welcome_img', event.target.result);
            document.getElementById('welcome-img-preview').src = event.target.result;
            document.getElementById('welcome-img-preview-container').classList.remove('hidden');
            alert("🖼️ お出迎え画像を登録しました！");
        } catch(err) {
            alert("⚠️ 画像サイズが大きすぎます。もう少し小さめの画像を選んでください。");
        }
    };
    reader.readAsDataURL(file);
}

function clearWelcomeImage() {
    localStorage.removeItem('my_gacha_welcome_img');
    document.getElementById('welcome-img-preview-container').classList.add('hidden');
    alert("画像を消去しました");
}

function saveSplashTime(val) {
    state.splashTime = parseInt(val);
    saveLocal();
}

function savePasswordOnly() {
    const p = document.getElementById('settings-password').value.trim();
    if(p.length > 0) {
        localStorage.setItem('my_gacha_password', p);
        alert("🔑 パスワードを変更しました");
        document.getElementById('settings-password').value = "";
    }
}

function saveGasUrl() {
    GAS_URL = document.getElementById('gas-url').value.trim();
    localStorage.setItem('my_gacha_gas_url', GAS_URL);
    alert("☁️ バックアップ用URLを保存しました");
}

function toggleAutoSync(checked) {
    state.autoSync = checked;
    saveLocal();
}

function getCleanStateForBackup() {
    const cleanGachas = state.gachas.map(g => {
        return {
            id: g.id, title: g.title, isLocked: g.isLocked,
            cards: g.cards.map(c => ({ id: c.id, name: c.name, rarity: c.rarity, desc: c.desc, img: "LOCAL_STORED" }))
        };
    });
    return {
        gachas: cleanGachas,
        currentGachaId: state.currentGachaId,
        inventory: state.inventory,
        stones: state.stones,
        totalSpent: state.totalSpent,
        loginDays: state.loginDays,
        tickets: state.tickets,
        partner: state.partner,
        appTheme: state.appTheme,
        customColors: state.customColors
    };
}

function triggerManualSync() {
    vibrate();
    if (!GAS_URL) return alert("⚠️ 先に設定でGASのURLを登録・保存してください");
    
    const backupData = getCleanStateForBackup();
    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(backupData),
        headers: { "Content-Type": "application/json" },
        mode: "no-cors"
    })
    .then(() => alert("☁️ GASへ進行状況を安全にバックアップしました！"))
    .catch(() => alert("⚠️ バックアップ中にエラーが発生しました"));
}

function cloudSyncSilent() {
    if (!GAS_URL) return;
    const backupData = getCleanStateForBackup();
    fetch(GAS_URL, { method: "POST", body: JSON.stringify(backupData), headers: { "Content-Type": "application/json" }, mode: "no-cors" });
}

// ==========================================================================
// 🖼️ 13. ガチャデータ・新規作成・管理ロジック
// ==========================================================================
function renderGachaSelectors() {
    const adminSel = document.getElementById('gacha-selector');
    const colSel = document.getElementById('collection-gacha-selector');
    if(!adminSel || !colSel) return;
    adminSel.innerHTML = ''; colSel.innerHTML = '';
    
    state.gachas.forEach(g => {
        const opt1 = document.createElement('option');
        opt1.value = g.id; opt1.innerText = g.title + (g.isLocked ? " 🏆" : "");
        if(g.id === state.currentGachaId) opt1.selected = true;
        adminSel.appendChild(opt1);
        
        const opt2 = document.createElement('option');
        opt2.value = g.id; opt2.innerText = g.title + (g.isLocked ? " 🏆" : "");
        if(g.id === state.currentGachaId) opt2.selected = true;
        colSel.appendChild(opt2);
    });
}

if(document.getElementById('gacha-selector')) {
    document.getElementById('gacha-selector').addEventListener('change', (e) => {
        state.currentGachaId = e.target.value;
        saveLocal();
    });
}
if(document.getElementById('collection-gacha-selector')) {
    document.getElementById('collection-gacha-selector').addEventListener('change', (e) => {
        state.currentGachaId = e.target.value;
        saveLocal();
        renderCollection();
    });
}

if(document.getElementById('btn-create-new-gacha')) {
    document.getElementById('btn-create-new-gacha').addEventListener('click', () => {
        const title = prompt("新しいガチャのタイトルを入力してください:");
        if(title) {
            const newId = 'gacha_' + Date.now();
            state.gachas.push({ id: newId, title: title, cards: [], isLocked: false });
            state.currentGachaId = newId;
            saveLocal();
            renderGachaSelectors();
            alert(`「${title}」を作成しました！`);
        }
    });
}

if(document.getElementById('btn-add-card')) {
    document.getElementById('btn-add-card').addEventListener('click', () => {
        vibrate();
        const file = document.getElementById('input-card-img').files[0];
        const name = document.getElementById('input-card-name').value.trim();
        const rarity = document.getElementById('input-card-rarity').value;
        const desc = document.getElementById('input-card-desc').value.trim();
        
        if(!file) return alert("画像を選択してください！");
        if(!name) return alert("名前を入力してください！");
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 240; 
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.65);
                const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
                
                currentGacha.cards.push({
                    id: Date.now(), name: name, rarity: rarity, desc: desc || "説明なし", img: compressedBase64
                });
                saveLocal();
                alert(`🎉 「${name} (${rarity})」を実装しました！`);
                
                document.getElementById('input-card-img').value = '';
                document.getElementById('input-card-name').value = '';
                document.getElementById('input-card-desc').value = '';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ==========================================================================
// 🔍 14. モーダル詳細画面 & 相棒設定
// ==========================================================================
let currentModalTarget = null;
function openModal(gachaId, cardId) {
    vibrate();
    const gacha = state.gachas.find(g => g.id === gachaId);
    const card = gacha.cards.find(c => c.id === cardId);
    const count = (state.inventory[gachaId] || {})[cardId] || 0;
    
    currentModalTarget = { gachaId, cardId };
    
    const rEl = document.getElementById('modal-card-rarity');
    rEl.innerText = card.rarity;
    rEl.className = `modal-rarity ${card.rarity}`;

    document.getElementById('modal-card-img').src = card.img;
    document.getElementById('modal-card-name').innerText = card.name;
    document.getElementById('modal-card-count').innerText = count;
    document.getElementById('modal-card-desc').innerText = card.desc;
    
    document.getElementById('modal-card-stars').className = count >= 100 ? "blue-star-evolved" : "";
    document.getElementById('modal-card-detail').classList.remove('hidden');
}

if(document.getElementById('btn-close-modal')) {
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        document.getElementById('modal-card-detail').classList.add('hidden');
    });
}
if(document.getElementById('btn-set-partner')) {
    document.getElementById('btn-set-partner').addEventListener('click', () => {
        state.partner = currentModalTarget;
        saveLocal();
        alert("ホーム画面の相棒に設定しました！");
        document.getElementById('modal-card-detail').classList.add('hidden');
        triggerPartnerSpeech(true);
    });
}

// ==========================================================================
// 🔗 15. URLシェア＆インポート
// ==========================================================================
if(document.getElementById('btn-share-gacha')) {
    document.getElementById('btn-share-gacha').addEventListener('click', () => {
        const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
        if (!currentGacha || currentGacha.cards.length === 0) return alert("カードが1枚もありません！");
        
        const dataString = JSON.stringify(currentGacha);
        const base64Data = btoa(unescape(encodeURIComponent(dataString)));
        const shareUrl = window.location.origin + window.location.pathname + "?share=" + base64Data;
        
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert("🔗 シェア用のURLをコピーしました！友達に送ってね。");
        }).catch(() => {
            prompt("以下のURLをコピーして送ってください:", shareUrl);
        });
    });
}

function checkUrlForShare() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareData = urlParams.get('share');
    if (shareData) {
        try {
            const jsonString = decodeURIComponent(escape(atob(shareData)));
            const importedGacha = JSON.parse(jsonString);
            
            document.getElementById('modal-import').classList.remove('hidden');
            
            document.getElementById('btn-import-yes').onclick = () => {
                importedGacha.id = 'imported_' + Date.now();
                importedGacha.title = "🎁 " + importedGacha.title;
                importedGacha.isLocked = false; 
                state.gachas.push(importedGacha);
                state.currentGachaId = importedGacha.id;
                saveLocal();
                
                window.history.replaceState({}, document.title, window.location.pathname);
                document.getElementById('modal-import').classList.add('hidden');
                alert(`「${importedGacha.title}」を追加しました！`);
                renderGachaSelectors();
            };
            
            document.getElementById('btn-import-no').onclick = () => {
                window.history.replaceState({}, document.title, window.location.pathname);
                document.getElementById('modal-import').classList.add('hidden');
            };
        } catch(e) {
            alert("ガチャデータの読み込みに失敗しました。");
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
}