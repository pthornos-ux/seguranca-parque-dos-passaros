Deploy Vercel

## Fluxo de pagamento PIX

- A adesão entra no Airtable como `Aguardando pagamento/confirmação` via `POST /api/adesao`.
- A confirmação automática depende do `POST /api/pix-webhook` com assinatura válida do banco/provedor.
- O envio de comprovante (`POST /api/comprovante`) só é liberado para adesão válida e marca `Comprovante enviado`.
- Somente eventos confirmados no webhook alteram o status para `Pagamento confirmado` e registram o ID da transação.

Detalhes de contrato, variáveis e integração: `api/README.md`.
