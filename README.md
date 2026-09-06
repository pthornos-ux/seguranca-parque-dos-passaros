Deploy Vercel

## Fluxo de pagamento PIX

- A adesão entra no Airtable como `Aguardando pagamento` via `POST /api/adesao`.
- A confirmação automática depende do `POST /api/pix-webhook` com assinatura válida do banco/provedor.
- Somente eventos confirmados alteram o status para `Pago` e registram o ID da transação.

Detalhes de contrato, variáveis e integração: `api/README.md`.
