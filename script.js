const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://fisher.usite.pro/tonconnect-manifest.json'  // Замени на твой домен
});

document.getElementById('connect-wallet').addEventListener('click', async () => {
    await tonConnectUI.connectWallet();
});

tonConnectUI.onStatusChange((wallet) => {
    const statusEl = document.getElementById('wallet-status');
    const claimSection = document.getElementById('claim-section');
    const userAddressEl = document.getElementById('user-address');
    const timerEl = document.getElementById('timer');
    const claimButton = document.getElementById('claim-button');

    if (wallet) {
        statusEl.textContent = `Подключён: ${wallet.account.address.slice(0, 6)}...${wallet.account.address.slice(-6)}`;
        userAddressEl.textContent = wallet.account.address;
        claimSection.style.display = 'block';
        document.getElementById('connect-wallet').style.display = 'none';

        // Проверяем, может ли пользователь claim'ить
        checkClaimStatus(wallet.account.address);
    } else {
        statusEl.textContent = 'Не подключён';
        claimSection.style.display = 'none';
        timerEl.style.display = 'none';
        document.getElementById('connect-wallet').style.display = 'block';
    }
});

async function checkClaimStatus(address) {
    const timerEl = document.getElementById('timer');
    const countdownEl = document.getElementById('countdown');
    const claimButton = document.getElementById('claim-button');
    const statusEl = document.getElementById('claim-status');

    try {
        const response = await fetch('https://your-backend.com/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
        });
        const data = await response.json();

        if (data.canClaim) {
            timerEl.style.display = 'none';
            claimButton.disabled = false;
            statusEl.textContent = '';
        } else {
            timerEl.style.display = 'block';
            claimButton.disabled = true;
            startCountdown(data.nextClaimTime);
        }
    } catch (error) {
        statusEl.textContent = 'Ошибка проверки: ' + error.message;
    }
}

function startCountdown(nextClaimTime) {
    const countdownEl = document.getElementById('countdown');
    const claimButton = document.getElementById('claim-button');

    const interval = setInterval(() => {
        const now = Date.now();
        const timeLeft = nextClaimTime - now;
        if (timeLeft <= 0) {
            clearInterval(interval);
            countdownEl.textContent = 'Готово!';
            claimButton.disabled = false;
            document.getElementById('timer').style.display = 'none';
            return;
        }

        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        countdownEl.textContent = `${hours}ч ${minutes}м ${seconds}с`;
    }, 1000);
}

document.getElementById('claim-button').addEventListener('click', async () => {
    const button = document.getElementById('claim-button');
    const statusEl = document.getElementById('claim-status');

    button.disabled = true;
    button.textContent = 'Обработка...';

    const wallet = tonConnectUI.connected;
    if (!wallet) {
        statusEl.textContent = 'Ошибка: Подключи кошелёк!';
        button.disabled = false;
        button.textContent = 'Забрать 1000 FISHER™';
        return;
    }

    try {
        const response = await fetch('https://your-backend.com/api/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: wallet.account.address })
        });

        if (response.ok) {
            const data = await response.json();
            statusEl.textContent = `Успех! Токены отправлены. TX: ${data.txHash}`;
            checkClaimStatus(wallet.account.address); // Обновляем таймер
        } else {
            statusEl.textContent = 'Ошибка: ' + await response.text();
        }
    } catch (error) {
        statusEl.textContent = 'Ошибка сети: ' + error.message;
    }

    button.disabled = false;
    button.textContent = 'Забрать 1000 FISHER™';
});