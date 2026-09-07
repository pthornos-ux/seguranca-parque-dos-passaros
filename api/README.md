API

## Endpoints

- `POST /api/adesao`  
  Registra adesão no Airtable com geração de código único e status inicial `Aguardando pagamento/confirmação`.

- `POST /api/comprovante`  
  Registra o envio de comprovante somente para adesão válida (`codigo` + `submissionId`) e atualiza o status para `Comprovante enviado`.

- `POST /api/pix-webhook`  
  Recebe webhook do provedor/banco, valida assinatura e, apenas quando houver confirmação real de recebimento, atualiza a adesão para `Pagamento confirmado` e registra o ID da transação.

## Variáveis de ambiente

- `AIRTABLE_TOKEN` (obrigatória)
- `PIX_WEBHOOK_SECRET` (obrigatória)
- `PIX_STATUS_FIELD` (opcional, padrão: `Status pagamento`)
- `PIX_TRANSACTION_FIELD` (opcional, padrão: `ID da transação PIX`)
- `PIX_DATE_FIELD` (opcional, padrão: `Data pagamento PIX`)
- `PIX_RECEIPT_DATE_FIELD` (opcional, padrão: `Data envio comprovante`)
- `PIX_RECEIPT_CHANNEL_FIELD` (opcional, padrão: `Canal comprovante`)
- `PIX_RECEIPT_REFERENCE_FIELD` (opcional, padrão: `Referência comprovante`)

## Contrato mínimo do webhook PIX

Headers:
- `x-pix-signature` (ou `x-signature` / `x-webhook-signature`) com HMAC-SHA256 (hex ou base64) do corpo bruto.

Body JSON:
- `transactionId` (ou `txid` / `endToEndId`)
- `submissionId` **ou** `codigo` da adesão
- confirmação positiva: `confirmed: true` **ou** `received: true` **ou** `paid: true` **ou** `status/paymentStatus` em `CONFIRMED|RECEIVED|PAID|SETTLED`

Sem assinatura válida e sem confirmação real, o endpoint não marca como confirmado.

## O que ainda precisa ser fornecido para produção

Se o banco/provedor ainda não estiver integrado, você precisa fornecer:

1. URL de webhook que será configurada no banco: `https://SEU_DOMINIO/api/pix-webhook`
2. Segredo/chave de assinatura oficial do webhook (`PIX_WEBHOOK_SECRET`)
3. Formato exato do payload do banco (nomes dos campos de referência e transação)
4. Garantia de envio de um identificador de conciliação (`submissionId` ou `codigo`) junto ao evento pago
5. Confirmação dos nomes das colunas no Airtable para status, ID transação e data de pagamento
