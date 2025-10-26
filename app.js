require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { TonClient, WalletContractV4, internal, JettonMaster, JettonWallet } = require('ton');
const { mnemonicToWalletKey } = require('ton-crypto');
const Redis = require('redis');

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.TON_API_KEY;
const MNEMONICS = process.env.MNEMONICS.split(' ');
const JETTON_MASTER = 'EQAdQwBMtEeyAUfJHcDwAXnhOwcA7xAAGW3PKnFdM1XvRkNB';
const JETTON_AMOUNT = 1000n * 1000000000n; // 1000 токенов (9 decimals)
const CLAIM_INTERVAL = 666 * 60 * 60 * 1000; // 666 часов в миллисекундах

const redisClient = Redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redisClient.connect().catch(console.error);

const client = new TonClient({
    endpoint: 'https://toncenter.com/api/v2/jsonRPC',
    apiKey: API_KEY
});

async function getWallet() {
    const keyPair = await mnemonicToWalletKey(MNEMONICS);
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    return { contract: wallet, keyPair };
}

app.post('/api/check', async (req, res) => {
    const { address } = req.body;
    if (!address || !address.match(/^(EQ|UQ)[0-9a-fA-F_-]{46}$/)) {
        return res.status(400).json({ error: 'Неверный TON-адрес' });
    }

    try {
        const lastClaim = await redisClient.get(`claim:${address}`);
        if (!lastClaim) {
            return res.json({ canClaim: true });
        }

        const lastClaimTime = parseInt(lastClaim);
        const now = Date.now();
        if (now - lastClaimTime >= CLAIM_INTERVAL) {
            return res.json({ canClaim: true });
        } else {
            return res.json({ canClaim: false, nextClaimTime: lastClaimTime + CLAIM_INTERVAL });
        }
    } catch (error) {
        res.status(500).json({ error: 'Ошибка проверки: ' + error.message });
    }
});

app.post('/api/claim', async (req, res) => {
    const { address } = req.body;
    if (!address || !address.match(/^(EQ|UQ)[0-9a-fA-F_-]{46}$/)) {
        return res.status(400).json({ error: 'Неверный TON-адрес' });
    }

    try {
        // Проверяем, можно ли claim'ить
        const lastClaim = await redisClient.get(`claim:${address}`);
        if (lastClaim && Date.now() - parseInt(lastClaim) < CLAIM_INTERVAL) {
            return res.status(400).json({ error: 'Слишком рано! Попробуй позже.' });
        }

        const { contract, keyPair } = await getWallet();
        const walletContract = client.open(contract);

        // Получаем адрес Jetton Wallet отправителя
        const jettonMaster = client.open(JettonMaster.create(JETTON_MASTER));
        const senderJettonWalletAddr = await jettonMaster.getWalletAddress(contract.address);
        const senderJettonWallet = client.open(JettonWallet.create(senderJettonWalletAddr));

        // Проверяем баланс
        const balance = await senderJettonWallet.getBalance();
        if (balance < JETTON_AMOUNT) {
            return res.status(400).json({ error: 'Недостаточно токенов на кошельке' });
        }

        // Формируем transfer
        const seqno = await walletContract.getSeqno();
        const transfer = senderJettonWallet.createTransfer({
            queryId: BigInt(Date.now()),
            amount: JETTON_AMOUNT,
            destination: address,
            responseDestination: contract.address,
            forwardTonAmount: 0n,
            forwardPayload: Buffer.from('Airdrop from FISHER™', 'utf-8')
        });

        await walletContract.sendTransfer({
            seqno,
            signer: keyPair,
            messages: [internal({
                to: senderJettonWalletAddr,
                value: 50000000n, // ~0.05 TON
                body: transfer
            })]
        });

        // Сохраняем время claim'а
        await redisClient.set(`claim:${address}`, Date.now().toString());

        res.json({ success: true, txHash: `tx_${Date.now()}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка отправки: ' + error.message });
    }
});

app.listen(3000, () => console.log('Backend на порту 3000'));