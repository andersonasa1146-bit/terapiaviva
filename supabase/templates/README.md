# Modelos de e-mail do Supabase Auth (TerapiaViva)

Cópia versionada dos modelos configurados em
**Authentication → Emails → Templates** no painel do Supabase
(projeto `terapiaviva`). O painel é a fonte que vale; estes arquivos
servem de backup e referência.

| Arquivo             | Modelo no painel | Assunto                                    |
| ------------------- | ---------------- | ------------------------------------------ |
| `recovery.html`     | Reset password   | Redefina sua senha do TerapiaViva          |
| `confirmation.html` | Confirm sign up  | Confirme seu cadastro no TerapiaViva       |
| `invite.html`       | Invite user      | Você recebeu um convite para o TerapiaViva |

Ao colar no painel, use só a tabela HTML (sem o comentário do topo).

Envio: SMTP próprio via Resend (`smtp.resend.com:465`, usuário `resend`),
remetente `TerapiaViva <noreply@flandtec.com.br>`. O domínio
`flandtec.com.br` está verificado no Resend (região São Paulo) com os
registros `resend._domainkey`, `rsend`, `send` e `_dmarc` no DNS da UOL.
