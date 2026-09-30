---
name: dash-diagnostico-dev
description: Como diagnosticar erro 500 / página quebrada no next dev do usuário sem derrubar o servidor dele — instância paralela com NEXT_DIST_DIR, login via cookie no curl, e o estado travado "missing required error components". Use quando uma tela der erro e você não tiver acesso ao terminal do usuário.
---

# Diagnóstico do servidor de desenvolvimento

O usuário roda `npm run dev` no terminal dele (porta 3000); você não vê esse log.

## "missing required error components, refreshing..."

Resposta 500 com esse texto = o `next dev` do usuário ficou num estado ruim de
compilação (acontece no Next 14 ao instalar dependência nova ou após muitas
edições com o servidor aberto). Não é erro do código. Solução: o usuário para
(Ctrl+C) e roda `npm run dev` de novo. Confirme antes com a instância paralela.

## Instância paralela (sem mexer na do usuário)

`next.config.mjs` aceita `distDir` por variável de ambiente. Suba outra
instância com pasta de build própria — **nunca** use a `.next` do usuário nem
rode `next build` com o dev dele aberto:

```bash
NEXT_DIST_DIR=.next-diag node node_modules/next/dist/bin/next dev -p 3001 > "$TEMP/diag.log" 2>&1 &
```

Depois: requisite a página na 3001, leia `$TEMP/diag.log`, pare o processo pelo
PID de quem escuta a porta 3001 (`netstat -ano | grep ':3001 '` →
`taskkill //PID <pid> //T //F`) e apague `.next-diag` (`.next-*/` está no .gitignore).
Confira depois que a 3000 ainda responde — ela pode demorar alguns segundos.
**Efeito colateral:** o Next reescreve o `tsconfig.json` (adiciona
`.next-diag/types/**/*.ts` e reformata). Depois do diagnóstico rode
`git checkout -- tsconfig.json`.

## Acessar telas logado via curl

Gere o cookie da sessão com supabase-js (script temporário na raiz do projeto,
para resolver `node_modules`; apague em seguida):

```js
const { data } = await createClient(URL, ANON).auth.signInWithPassword({ email, password });
console.log('sb-127-auth-token=base64-' + Buffer.from(JSON.stringify(data.session)).toString('base64url'));
```

O nome do cookie vem do host da API (`127.0.0.1` → `sb-127-auth-token`). Use
`curl -H "Cookie: $COOKIE" http://localhost:3000/<rota>`. Senhas não ficam em
arquivos: peça ao usuário ou use um usuário de teste criado e apagado no próprio script.
