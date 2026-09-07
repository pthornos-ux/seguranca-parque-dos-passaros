const BASE = 'appgzi6kB9pQnSoSw';
const TABLE = 'tblYTP6X27lCQkSuF';
const API = `https://api.airtable.com/v0/${BASE}/${TABLE}`;
const PAYMENT_STATUS_FIELD = process.env.PIX_STATUS_FIELD || 'Status pagamento';

const headers = () => ({
  Authorization: 'Bearer '.concat(process.env.AIRTABLE_TOKEN || ''),
  'Content-Type': 'application/json'
});

const digits = (value) => (value || '').replace(/\D/g, '');
const esc = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'Método não permitido' });

  try {
    const { nome, cpf, endereco, whatsapp, email, termo, lgpd, submissionId } = req.body || {};
    if (!process.env.AIRTABLE_TOKEN) return res.status(500).json({ ok: false, erro: 'Configuração indisponível' });

    if (!nome || !cpf || !endereco || !whatsapp || !email || !submissionId || termo !== true || lgpd !== true) {
      return res.status(400).json({ ok: false, erro: 'Preencha todos os campos e confirme os aceites.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, erro: 'E-mail inválido.' });

    const digitsCpf = digits(cpf);
    if (digitsCpf.length !== 11 && digitsCpf.length !== 14) return res.status(400).json({ ok: false, erro: 'CPF/CNPJ inválido.' });

    const duplicateResponse = await fetch(
      `${API}?maxRecords=1&filterByFormula=${encodeURIComponent(`{Submission ID}='${esc(submissionId)}'`)}`,
      { headers: headers() }
    );

    if (duplicateResponse.ok) {
      const duplicateJson = await duplicateResponse.json();
      if (duplicateJson.records?.length) {
        const fields = duplicateJson.records[0].fields || {};
        return res.status(200).json({
          ok: true,
          codigo: fields['Código'] || 'Registrado',
          status: fields[PAYMENT_STATUS_FIELD] || 'Aguardando pagamento/confirmação',
          submissionId,
          duplicado: true
        });
      }
    }

    let offset;
    let max = 0;
    do {
      const listUrl = new URL(API);
      listUrl.searchParams.set('pageSize', '100');
      listUrl.searchParams.append('fields[]', 'Código');
      if (offset) listUrl.searchParams.set('offset', offset);

      const listResponse = await fetch(listUrl, { headers: headers() });
      if (!listResponse.ok) throw new Error('airtable-read');

      const listJson = await listResponse.json();
      offset = listJson.offset;

      for (const record of listJson.records || []) {
        const match = String(record.fields?.['Código'] || '').match(/PP-2026-(\d+)/);
        if (match) max = Math.max(max, Number(match[1]));
      }
    } while (offset);

    const codigo = `PP-2026-${String(max + 1).padStart(4, '0')}`;
    const fields = {
      'Código': codigo,
      'Data/Hora': new Date().toISOString(),
      'Nome completo': String(nome).trim(),
      'CPF/CNPJ': String(cpf).trim(),
      'Endereço': String(endereco).trim(),
      'WhatsApp': String(whatsapp).trim(),
      'E-mail': String(email).trim(),
      'Aceite Termo v1.5': true,
      'Ciência LGPD': true,
      [PAYMENT_STATUS_FIELD]: 'Aguardando pagamento/confirmação',
      Valor: 500,
      'Submission ID': String(submissionId),
      'Versão do Termo': 'v1.5'
    };

    const writeResponse = await fetch(API, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ records: [{ fields }], typecast: true })
    });

    if (!writeResponse.ok) {
      console.error('Airtable write failed', writeResponse.status, await writeResponse.text());
      throw new Error('airtable-write');
    }

    return res.status(200).json({ ok: true, codigo, status: 'Aguardando pagamento/confirmação', submissionId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, erro: 'Não foi possível registrar a adesão. Tente novamente.' });
  }
};
