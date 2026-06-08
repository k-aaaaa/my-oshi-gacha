// app.js
function vibrate() { if (navigator.vibrate) navigator.vibrate(15); }

// データ構造の初期化
let state = JSON.parse(localStorage.getItem('my_gacha_state')) || {
    gachas: [{ id: 'default', title: 'はじまりのガチャ', cards: [] }], // 複数のガチャを管理
    currentGachaId: 'default',
    inventory: {}, // { gachaId: { cardId: count } }
    stones: 0,
    totalSpent: 0,
    loginDays: 0,
    lastLoginDate: "",
    tickets: 0,
    partner: null // { gachaId, cardId }
};

// URLからのシェアインポートをチェック
window.addEventListener('DOMContentLoaded', () => {
    checkUrlForShare();
    checkLoginBonus();
    updateUI();
    renderGachaSelectors();
});

function saveLocal() {
    localStorage.setItem('my_gacha_state', JSON.stringify(state));
    updateUI();
}

// --- タブ切り替え ---
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        vibrate();
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(btn.dataset.target).classList.add('active');
        btn.classList.add('active');
        
        if(btn.dataset.target === 'view-collection') renderCollection();
        if(btn.dataset.target === 'view-admin') renderGachaSelectors();
    });
});

// --- ログインボーナス ---
function checkLoginBonus() {
    const today = new Date().toLocaleDateString('ja-JP');
    if (state.lastLoginDate !== today) {
        state.lastLoginDate = today;
        state.loginDays += 1;
        state.stones += 300; // 毎日10連分プレゼント
        
        let bonusText = `💎 毎日ログボ 300個 獲得！\n(通算 ${state.loginDays}日目)`;
        
        // 7日ごとに確定チケット付与
        if (state.loginDays % 7 === 0) {
            state.tickets += 1;
            bonusText += `\n\n🎉 通算 ${state.loginDays}日達成！\n🎫 SSR以上確定チケットをGET！`;
        }
        
        const panel = document.getElementById('login-bonus-panel');
        panel.innerHTML = `<div class="logbo-title">🎁 本日のログインボーナス</div><p style="white-space:pre-wrap; font-size:14px;">${bonusText}</p>`;
        panel.classList.remove('hidden');
        saveLocal();
        
        setTimeout(() => { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); }, 500);
    }
}

// --- UI更新 ---
function updateUI() {
    document.getElementById('header-stones').innerText = `💎 ${state.stones}`;
    document.getElementById('login-days').innerText = state.loginDays;
    document.getElementById('total-spent-stones').innerText = state.totalSpent;
    
    // チケットボタンの表示切替
    const ticketBtn = document.getElementById('btn-pull-ticket');
    if (state.tickets > 0) {
        ticketBtn.innerText = `🎫 確定チケットで引く！ (残り${state.tickets}枚)`;
        ticketBtn.classList.remove('hidden');
    } else {
        ticketBtn.classList.add('hidden');
    }

    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    document.getElementById('current-gacha-title').innerText = currentGacha ? currentGacha.title : "ガチャメーカー";

    // コンプ率の計算
    if (currentGacha && currentGacha.cards.length > 0) {
        if(!state.inventory[currentGacha.id]) state.inventory[currentGacha.id] = {};
        const inv = state.inventory[currentGacha.id];
        const typesGot = Object.keys(inv).length;
        const total = currentGacha.cards.length;
        const percent = Math.floor((typesGot / total) * 100);
        document.getElementById('comp-percent').innerText = percent;
        document.getElementById('comp-fraction').innerText = `${typesGot} / ${total}`;
    } else {
        document.getElementById('comp-percent').innerText = 0;
        document.getElementById('comp-fraction').innerText = `0 / 0`;
    }

    // 相棒画像の表示
    const partnerImg = document.getElementById('home-partner-img');
    if (state.partner) {
        const pGacha = state.gachas.find(g => g.id === state.partner.gachaId);
        if (pGacha) {
            const pCard = pGacha.cards.find(c => c.id === state.partner.cardId);
            if (pCard) partnerImg.src = pCard.img;
        }
    }
}

// --- ガチャ作成・管理 ---
function renderGachaSelectors() {
    const adminSel = document.getElementById('gacha-selector');
    const colSel = document.getElementById('collection-gacha-selector');
    adminSel.innerHTML = ''; colSel.innerHTML = '';
    
    state.gachas.forEach(g => {
        const opt1 = document.createElement('option');
        opt1.value = g.id; opt1.innerText = g.title;
        if(g.id === state.currentGachaId) opt1.selected = true;
        adminSel.appendChild(opt1);
        
        const opt2 = document.createElement('option');
        opt2.value = g.id; opt2.innerText = g.title;
        if(g.id === state.currentGachaId) opt2.selected = true;
        colSel.appendChild(opt2);
    });
}

document.getElementById('gacha-selector').addEventListener('change', (e) => {
    state.currentGachaId = e.target.value;
    saveLocal();
});
document.getElementById('collection-gacha-selector').addEventListener('change', (e) => {
    state.currentGachaId = e.target.value;
    saveLocal();
    renderCollection();
});

document.getElementById('btn-create-new-gacha').addEventListener('click', () => {
    const title = prompt("新しいガチャのタイトルを入力してください\n(例: ポムポムプリン実装記念ガチャ)");
    if(title) {
        const newId = 'gacha_' + Date.now();
        state.gachas.push({ id: newId, title: title, cards: [] });
        state.currentGachaId = newId;
        saveLocal();
        renderGachaSelectors();
        alert(`「${title}」を作成しました！画像を追加してください。`);
    }
});

// --- 画像のリサイズとBase64変換 (URLシェアの文字数制限対策) ---
function resizeAndAddCard(file, name, rarity, desc) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 250; // ガチャカードには十分な画質
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // 圧縮してBase64化
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
            
            const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
            currentGacha.cards.push({
                id: Date.now(),
                name: name,
                rarity: rarity,
                desc: desc || "説明なし",
                img: compressedBase64
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
}

document.getElementById('btn-add-card').addEventListener('click', () => {
    vibrate();
    const file = document.getElementById('input-card-img').files[0];
    const name = document.getElementById('input-card-name').value.trim();
    const rarity = document.getElementById('input-card-rarity').value;
    const desc = document.getElementById('input-card-desc').value.trim();
    
    if(!file) return alert("画像を選択してください！");
    if(!name) return alert("名前を入力してください！");
    
    resizeAndAddCard(file, name, rarity, desc);
});

// --- ガチャを引く (9段階レアリティ対応) ---
function pullGacha(times, useTicket = false) {
    vibrate();
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha || currentGacha.cards.length === 0) {
        return alert("このガチャにはまだ景品がありません。⚙️「作る」から画像を登録してください！");
    }

    if (useTicket) {
        if(state.tickets < 1) return;
        state.tickets -= 1;
    } else {
        const cost = times * 30;
        if (state.stones < cost) return alert("💎石が足りません！毎日のログボを待ってね！");
        state.stones -= cost;
        state.totalSpent += cost;
    }

    const container = document.getElementById('gacha-result-container');
    container.innerHTML = "";
    if(!state.inventory[currentGacha.id]) state.inventory[currentGacha.id] = {};
    const inv = state.inventory[currentGacha.id];
    
    let highestRarity = 'C';
    const rarityOrder = ['C', 'N', 'R', 'SR', 'SSR', 'UR', 'LE', 'LR', 'SLR'];

    for (let i = 0; i < times; i++) {
        let rand = Math.random() * 100;
        let selectedRarity = 'N';
        
        if (useTicket) {
            // チケットはSSR(3.8%)〜SLR(0.01%)のみ排出される特別確率
            if(rand < 0.1) selectedRarity = 'SLR';
            else if(rand < 0.5) selectedRarity = 'LR';
            else if(rand < 2) selectedRarity = 'LE';
            else if(rand < 10) selectedRarity = 'UR';
            else selectedRarity = 'SSR';
        } else {
            // 通常確率
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
        if (pool.length === 0) pool = currentGacha.cards; // 該当レアが未登録の場合は救済措置

        let card = pool[Math.floor(Math.random() * pool.length)];
        
        // インベントリ(所持数)加算
        inv[card.id] = (inv[card.id] || 0) + 1;
        
        // 最高レア記録
        if(rarityOrder.indexOf(selectedRarity) > rarityOrder.indexOf(highestRarity)) {
            highestRarity = selectedRarity;
        }

        // カード描画
        const cardDiv = document.createElement('div');
        cardDiv.className = `card ${card.rarity}`;
        
        // 100枚被り判定
        let blueStarHtml = inv[card.id] >= 100 ? `<div class="blue-star-evolved"></div>` : '';
        
        cardDiv.innerHTML = `
            ${blueStarHtml}
            <img src="${card.img}">
            <div class="card-rarity-tag">${card.rarity}</div>
        `;
        cardDiv.onclick = () => openModal(currentGacha.id, card.id);
        container.appendChild(cardDiv);
    }

    // SSR以上で紙吹雪
    if (rarityOrder.indexOf(highestRarity) >= rarityOrder.indexOf('SSR')) {
        setTimeout(() => { confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } }); }, 200);
    }
    
    saveLocal();
}

document.getElementById('btn-pull-1').addEventListener('click', () => pullGacha(1));
document.getElementById('btn-pull-10').addEventListener('click', () => pullGacha(10));
document.getElementById('btn-pull-ticket').addEventListener('click', () => pullGacha(1, true));

// --- 図鑑（コレクション） ---
function renderCollection() {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    const grid = document.getElementById('collection-grid');
    grid.innerHTML = '';
    
    if (!currentGacha || currentGacha.cards.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color:#666; margin-top:20px;">まだカードがありません</div>';
        return;
    }

    const inv = state.inventory[currentGacha.id] || {};
    const rarityOrder = { 'SLR':0, 'LR':1, 'LE':2, 'UR':3, 'SSR':4, 'SR':5, 'R':6, 'N':7, 'C':8 };
    
    let sortedCards = [...currentGacha.cards].sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);

    sortedCards.forEach(card => {
        const count = inv[card.id] || 0;
        const div = document.createElement('div');
        
        if (count > 0) {
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
            div.innerHTML = `<div class="item-empty">???<br><span style="color:#666;">${card.rarity}</span></div>`;
        }
        grid.appendChild(div);
    });
}

// --- モーダル (詳細＆相棒設定) ---
let currentModalTarget = null;
function openModal(gachaId, cardId) {
    vibrate();
    const gacha = state.gachas.find(g => g.id === gachaId);
    const card = gacha.cards.find(c => c.id === cardId);
    const count = (state.inventory[gachaId] || {})[cardId] || 0;
    
    currentModalTarget = { gachaId, cardId };
    
    const rEl = document.getElementById('modal-card-rarity');
    rEl.innerText = card.rarity;
    rEl.className = `modal-rarity ${card.rarity}`; // CSS色適用のため
    if(card.rarity==='SLR') rEl.style.color = '#fff';
    else if(card.rarity==='LR') rEl.style.color = '#ff4444';
    else if(card.rarity==='UR') rEl.style.color = '#ffd700';
    else if(card.rarity==='SSR') rEl.style.color = '#ff00cc';
    else rEl.style.color = '#aaa';

    document.getElementById('modal-card-img').src = card.img;
    document.getElementById('modal-card-name').innerText = card.name;
    document.getElementById('modal-card-count').innerText = count;
    document.getElementById('modal-card-desc').innerText = card.desc;
    
    // 100枚被りエフェクト
    document.getElementById('modal-card-stars').className = count >= 100 ? "blue-star-evolved" : "";

    document.getElementById('modal-card-detail').classList.remove('hidden');
}

document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('modal-card-detail').classList.add('hidden');
});

document.getElementById('btn-set-partner').addEventListener('click', () => {
    state.partner = currentModalTarget;
    saveLocal();
    alert("ホーム画面の相棒に設定しました！");
    document.getElementById('modal-card-detail').classList.add('hidden');
});

// --- URLシェア機能 (Base64) ---
document.getElementById('btn-share-gacha').addEventListener('click', () => {
    const currentGacha = state.gachas.find(g => g.id === state.currentGachaId);
    if (!currentGacha || currentGacha.cards.length === 0) return alert("カードが1枚もありません！");
    
    // データをJSON化してURLパラメータ用にエンコード
    const dataString = JSON.stringify(currentGacha);
    // Base64に変換 (Unicode対応)
    const base64Data = btoa(unescape(encodeURIComponent(dataString)));
    
    const shareUrl = window.location.origin + window.location.pathname + "?share=" + base64Data;
    
    // クリップボードにコピー
    navigator.clipboard.writeText(shareUrl).then(() => {
        alert("🔗 シェア用のURLをコピーしました！\nLINEなどで友達に送ってください。\n\n※画像が多い場合はURLが長くなり送れないことがあります。");
    }).catch(err => {
        prompt("以下のURLをコピーして送ってください:", shareUrl);
    });
});

function checkUrlForShare() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareData = urlParams.get('share');
    if (shareData) {
        try {
            const jsonString = decodeURIComponent(escape(atob(shareData)));
            const importedGacha = JSON.parse(jsonString);
            
            document.getElementById('modal-import').classList.remove('hidden');
            
            document.getElementById('btn-import-yes').onclick = () => {
                // 重複IDを避けるためIDを振り直す
                importedGacha.id = 'imported_' + Date.now();
                importedGacha.title = "🎁 " + importedGacha.title;
                state.gachas.push(importedGacha);
                state.currentGachaId = importedGacha.id;
                saveLocal();
                
                // URLからパラメータを消す
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
            alert("ガチャデータの読み込みに失敗しました。URLが途切れている可能性があります。");
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
}

// --- リセット ---
document.getElementById('btn-reset-all').addEventListener('click', () => {
    if(confirm("⚠️ 本当に全データを初期化しますか？\n登録した画像も全て消去されます。")) {
        localStorage.removeItem('my_gacha_state');
        location.reload();
    }
});