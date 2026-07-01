const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const HASH_KEY = process.env.NEWEBPAY_HASH_KEY;
    const HASH_IV = process.env.NEWEBPAY_HASH_IV;

    const params = new URLSearchParams(event.body);
    const tradeInfo = params.get('TradeInfo');
    const tradeSha = params.get('TradeSha');

    // 驗證 TradeSha
    const checkStr = `HashKey=${HASH_KEY}&${tradeInfo}&HashIV=${HASH_IV}`;
    const checkSha = crypto.createHash('sha256').update(checkStr).digest('hex').toUpperCase();

    if (checkSha !== tradeSha) {
      console.error('TradeSha 驗證失敗');
      return { statusCode: 400, body: 'Invalid signature' };
    }

    // AES 解密
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(HASH_KEY),
      Buffer.from(HASH_IV)
    );
    let decrypted = decipher.update(tradeInfo, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    const result = JSON.parse(decrypted);

    if (result.Status !== 'SUCCESS') {
      console.log('付款失敗:', result.Message);
      return { statusCode: 200, body: 'Payment failed' };
    }

    // 取出付款資訊
    const email = decodeURIComponent(result.Result?.Email || '');
    const orderNo = result.Result?.MerchantOrderNo || '';
    const amount = result.Result?.Amt;
    const plan = amount === 999 ? '年繳方案（365天）' : '月繳方案（30天）';
    const days = amount === 999 ? 365 : 30;

    // 計算到期日
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    const expiryStr = expiry.toLocaleDateString('zh-TW');

    // 產生存取 token（用訂單號+email做hash）
    const token = crypto
      .createHash('sha256')
      .update(`${orderNo}${email}${HASH_KEY}`)
      .digest('hex')
      .slice(0, 16);

    // 用 EmailJS REST API 寄信給使用者
    const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
    const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
    const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;

    const accessURL = `https://dainty-kitten-96008e.netlify.app/?token=${token}&exp=${expiry.getTime()}`;

    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        template_params: {
          to_email: email,
          subject: `🔮 默默占星骰子｜付款成功，開始使用！`,
          message: `感謝你購買默默占星骰子！

📦 方案：${plan}
📅 到期日：${expiryStr}
🔑 訂單編號：${orderNo}

點擊以下連結開始使用：
${accessURL}

此連結有效至 ${expiryStr}，請妥善保存。
如有任何問題，歡迎透過 Instagram 私訊：@slience_tarot

—— 默默占星骰子`
        }
      })
    });

    console.log('付款成功，已寄信至:', email);
    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('通知處理錯誤:', err);
    return { statusCode: 500, body: err.message };
  }
};
