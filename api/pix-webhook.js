const crypto = require('crypto');

const BASE = 'appgzi6kB9pQnSoSw';
const TABLE = 'tblYTP6X27lCQkSuF';
const API = `https://api.airtable.com/v0/${BASE}/${TABLE}`;

const PAYMENT_STATUS_FIELD = process.env.PIX_STATUS_FIELD || 'Status pagamento';
const PAYMENT_TRANSACTION_FIELD = process.env.PIX_TRANSACTION_FIELD || 'ID da transação PIX';
const PAYMENT_DATE_FIELD = process.env.PIX_DATE_FIELD || 'Data pagamento PIX';

const airtableHeaders = () => ({
  Authorization: 'Bearer '.concat(process.env.AIRTABLE_TOKEN || ''),
  'Content-Type': 'application/json'
});

const esc = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const getRawBody = (req) => {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return '';
};

const parseSignature = (signatureHeader) => {
  if (!signatureHeader) return '';
  const normalized = String(signatureHeader).trim();
  if (normalized.includes('=')) return normalized.split('=').pop().trim();
  return normalized;
};

const isSameDigest = (a, b) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

const verifySignature = ({ signatureHeader, secret, rawBody }) => {
  if (!signatureHeader || !secret || !rawBody) return false;
  const provided = parseSignature(signatureHeader);
  const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const expectedHex = hmac.toString('hex');
  const expectedBase64 = hmac.toString('base64');
  return isSameDigest(provided, expectedHex) || isSameDigest(provided, expectedBase64);
};

const getConfirmedPayment = (payload) => {
  const paymentStatus = String(payload?.paymentStatus || payload?.status || '').toUpperCase().trim();
  const explicitConfirmation = payload?.confirmed === true || payload?.received === true || payload?.paid === true;
  const statusConfirmation = ['CONFIRMED', 'RECEIVED', 'PAID', 'SETTLED'].includes(paymentStatus);
  return explicitConfirmation || statusConfirmation;
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });

  const airtableToken = process.env.AIRTABLE_TOKEN;
  const webhookSecret = process.env.PIX_WEBHOOK_SECRET;
  if (!airtableToken || !webhookSecret) {
    return res.status(500).json({
      ok: false,
      erro: 'Configuração indisponível',
      missing: {
        AIRTABLE_TOKEN: !airtableToken,
        PIX_WEBHOOK_SECRET: !webhookSecret
      }
    });
  }

  try {
    const rawBody = getRawBody(req);
    const signatureHeader = req.headers['x-pix-signature'] || req.headers['x-signature'] || req.headers['x-webhook-signature'];
    const validSignature = verifySignature({
      signatureHeader,
      secret: webhookSecret,
      rawBody
    });

    if (!validSignature) {
      return res.status(401).json({
        ok: false,
        erro: 'Assinatura inválida do webhook'
      });
    }

    const payload = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(rawBody);
    const paymentConfirmed = getConfirmedPayment(payload);
    if (!paymentConfirmed) {
      return res.status(202).json({
        ok: true,
        atualizado: false,
        motivo: 'Pagamento ainda não confirmado pelo provedor'
      });
    }

    const submissionId = String(payload.submissionId || payload.referenceId || '').trim();
    const codigo = String(payload.codigo || payload.adesaoCodigo || '').trim();
    const transactionId = String(payload.transactionId || payload.txid || payload.endToEndId || '').trim();

    if (!transactionId || (!submissionId && !codigo)) {
      return res.status(400).json({
        ok: false,
        erro: 'Webhook sem dados mínimos para conciliação',
        required: ['transactionId', 'submissionId ou codigo']
      });
    }

    const filters = [];
    if (submissionId) filters.push(`{Submission ID}='${esc(submissionId)}'`);
    if (codigo) filters.push(`{Código}='${esc(codigo)}'`);
    const formula = filters.length > 1 ? `OR(${filters.join(',')})` : filters[0];

    const findUrl = `${API}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
    const findResponse = await fetch(findUrl, { headers: airtableHeaders() });
    if (!findResponse.ok) throw new Error(`airtable-find-${findResponse.status}`);
    const findJson = await findResponse.json();
    const record = findJson.records?.[0];
    if (!record) {
      return res.status(404).json({
        ok: false,
        erro: 'Adesão não encontrada para o pagamento informado'
      });
    }

    const currentStatus = String(record.fields?.[PAYMENT_STATUS_FIELD] || '');
    if (currentStatus.toLowerCase() === 'pago') {
      return res.status(200).json({
        ok: true,
        atualizado: false,
        motivo: 'Adesão já marcada como paga',
        codigo: record.fields?.['Código'] || null
      });
    }

    const paymentDate = payload.paidAt || payload.receivedAt || payload.confirmedAt || new Date().toISOString();
    const fields = {
      [PAYMENT_STATUS_FIELD]: 'Pago',
      [PAYMENT_TRANSACTION_FIELD]: transactionId,
      [PAYMENT_DATE_FIELD]: paymentDate
    };

    const updateUrl = `${API}/${record.id}`;
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields, typecast: true })
    });

    if (!updateResponse.ok) {
      const reason = await updateResponse.text();
      console.error('Airtable payment update failed', updateResponse.status, reason);
      return res.status(500).json({
        ok: false,
        erro: 'Falha ao atualizar pagamento no Airtable',
        detalhe: 'Verifique se os campos de status e transação PIX existem na tabela.'
      });
    }

    return res.status(200).json({
      ok: true,
      atualizado: true,
      codigo: record.fields?.['Código'] || null,
      transactionId
    });
  } catch (error) {
    console.error('pix-webhook error', error);
    return res.status(500).json({
      ok: false,
      erro: 'Falha no processamento do webhook PIX'
    });
  }
};
