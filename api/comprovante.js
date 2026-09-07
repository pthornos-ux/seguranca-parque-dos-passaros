const BASE = 'appgzi6kB9pQnSoSw';
const TABLE = 'tblYTP6X27lCQkSuF';
const API = `https://api.airtable.com/v0/${BASE}/${TABLE}`;

const PAYMENT_STATUS_FIELD = process.env.PIX_STATUS_FIELD || 'Status pagamento';
const RECEIPT_DATE_FIELD = process.env.PIX_RECEIPT_DATE_FIELD || 'Data envio comprovante';
const RECEIPT_CHANNEL_FIELD = process.env.PIX_RECEIPT_CHANNEL_FIELD || 'Canal comprovante';
const RECEIPT_REFERENCE_FIELD = process.env.PIX_RECEIPT_REFERENCE_FIELD || 'Referência comprovante';

const airtableHeaders = () => ({
  Authorization: 'Bearer '.concat(process.env.AIRTABLE_TOKEN || ''),
  'Content-Type': 'application/json'
});

const esc = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });

  if (!process.env.AIRTABLE_TOKEN) {
    return res.status(500).json({ ok: false, erro: 'Configuração indisponível' });
  }

  try {
    const { codigo, submissionId, referencia } = req.body || {};
    const normalizedCode = String(codigo || '').trim();
    const normalizedSubmissionId = String(submissionId || '').trim();
    const normalizedReference = String(referencia || '').trim();

    if (!normalizedCode || !normalizedSubmissionId) {
      return res.status(400).json({
        ok: false,
        erro: 'Envie código de adesão e identificador da adesão para registrar o comprovante.'
      });
    }

    const formula = `AND({Código}='${esc(normalizedCode)}',{Submission ID}='${esc(normalizedSubmissionId)}')`;
    const findUrl = `${API}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
    const findResponse = await fetch(findUrl, { headers: airtableHeaders() });

    if (!findResponse.ok) throw new Error(`airtable-find-${findResponse.status}`);

    const findJson = await findResponse.json();
    const record = findJson.records?.[0];
    if (!record) {
      return res.status(403).json({
        ok: false,
        erro: 'Adesão inválida. Conclua a adesão antes de enviar comprovante.'
      });
    }

    const statusAtual = String(record.fields?.[PAYMENT_STATUS_FIELD] || '').toLowerCase();
    if (statusAtual === 'pagamento confirmado' || statusAtual === 'pago') {
      return res.status(200).json({
        ok: true,
        atualizado: false,
        status: 'Pagamento confirmado',
        codigo: normalizedCode,
        mensagem: 'Pagamento já confirmado pela equipe.'
      });
    }

    const fields = {
      [PAYMENT_STATUS_FIELD]: 'Comprovante enviado'
    };

    if (record.fields?.[RECEIPT_DATE_FIELD] !== undefined) {
      fields[RECEIPT_DATE_FIELD] = new Date().toISOString();
    }
    if (record.fields?.[RECEIPT_CHANNEL_FIELD] !== undefined) {
      fields[RECEIPT_CHANNEL_FIELD] = 'WhatsApp';
    }
    if (normalizedReference && record.fields?.[RECEIPT_REFERENCE_FIELD] !== undefined) {
      fields[RECEIPT_REFERENCE_FIELD] = normalizedReference;
    }

    const updateResponse = await fetch(`${API}/${record.id}`, {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields, typecast: true })
    });

    if (!updateResponse.ok) {
      const reason = await updateResponse.text();
      console.error('Airtable receipt update failed', updateResponse.status, reason);
      throw new Error('airtable-update');
    }

    return res.status(200).json({
      ok: true,
      atualizado: true,
      status: 'Comprovante enviado',
      codigo: normalizedCode,
      mensagem: 'Comprovante registrado. A confirmação do pagamento será feita após conferência da equipe.'
    });
  } catch (error) {
    console.error('comprovante error', error);
    return res.status(500).json({
      ok: false,
      erro: 'Não foi possível registrar o comprovante agora. Tente novamente.'
    });
  }
};
