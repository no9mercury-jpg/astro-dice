const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { plan, email } = JSON.parse(event.body);

    const MERCHANT_ID = process.env.NEWEBPAY_MERCHANT_ID;
    const HASH_KEY = process.env.NEWEBPAY_HASH_KEY;
    const HASH_IV = process.env.NEWEBPAY_HASH_IV;

    const amount = plan === 'yearly' ? 999 : 99;
    const itemDesc = plan === 'yearly' ? '默默占星骰子年繳方案' : '默默占星骰子月繳方案';
    const orderNo = 'ASTRO' + Date.now();
    const timeStamp = Math.floor(Date.now() / 1000);

    const notifyURL = 'https://dainty-kitten-96008e.netlify.app/.netlify/functions/payment-notify';
    const returnURL = 'https://dainty-kitten-96008e.netlify.app/success.html';

    const tradeInfo = [
      `MerchantID=${MERCHANT_ID}`,
      `RespondType=JSON`,
      `TimeStamp=${timeStamp}`,
      `Version=2.0`,
      `MerchantOrderNo=${orderNo}`,
      `Amt=${amount}`,
      `ItemDesc=${encodeURIComponent(itemDesc)}`,
      `Email=${encodeURIComponent(email)}`,
      `NotifyURL=${encodeURIComponent(notifyURL)}`,
      `ReturnURL=${encodeURIComponent(returnURL)}`,
      `LoginType=0`,
    ].join('&');

    // AES-256-CBC 加密
    const encrypt = (data, key, iv) => {
      const cipher = crypto.createCipheriv(
        'aes-256-cbc',
        Buffer.from(key),
        Buffer.from(iv)
      );
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    };

    // SHA256 雜湊
    const hash = (data, key, iv) => {
      const str = `HashKey=${key}&${data}&HashIV=${iv}`;
      return crypto.createHash('sha256').update(str).digest('hex').toUpperCase();
    };

    const encryptedTradeInfo = encrypt(tradeInfo, HASH_KEY, HASH_IV);
    const tradeSha = hash(encryptedTradeInfo, HASH_KEY, HASH_IV);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        MerchantID: MERCHANT_ID,
        TradeInfo: encryptedTradeInfo,
        TradeSha: tradeSha,
        Version: '2.0',
        PayGateWay: 'https://core.newebpay.com/MPG/mpg_gateway',
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
