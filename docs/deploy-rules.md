# Publicar as regras do Firestore — correção de permissão (v2.5.1)

## O que este patch corrige

Usuários recém-cadastrados ficavam com `status = "pending"` em `users/{uid}` e as regras exigiam
`isActive()` (status `active`) para criar/ler/atualizar kaizens. Resultado: `permission-denied` ao salvar.
Além disso, `verified()` bloqueava quem ainda não tinha confirmado o e-mail.

Agora:

- **pending e active** podem criar, ler, listar e atualizar os **próprios** kaizens e os compartilhados como editor/viewer.
- **blocked** continua sem acesso (inclusive admin bloqueado).
- A confirmação de e-mail **não bloqueia mais** o salvamento.
- Usuário `pending` também consegue buscar colegas no `directory` para compartilhar.
- Invariantes preservados: `ownerUid` imutável no update, `schemaVersion` imutável, `rev` sempre +1,
  `arquivado=false` no create, editor não altera as 4 listas de compartilhamento, delete segue admin-only.

## Passo a passo (Console do Firebase)

1. Abra o Console: https://console.firebase.google.com/project/projeto-de-performance-bb964/firestore/rules
2. **Backup primeiro:** copie TODO o conteúdo atual da aba "Regras" e salve num arquivo
   `backup-rules-AAAA-MM-DD.txt` (ou use o histórico de versões do Console).
3. Abra `firestore.rules` na raiz deste repositório e copie o conteúdo **inteiro**.
4. Cole no editor do Console, substituindo tudo.
5. Clique em **Publicar**. O Console valida a sintaxe antes de aplicar; se acusar erro, não publique —
   restaure o backup e avise.
6. Aguarde ~1 minuto e faça o smoke test abaixo.

## Smoke test (matriz)

Use uma aba anônima para a conta nova:

| Caso | Como testar | Esperado |
|---|---|---|
| Conta nova (pending) | cadastre um e-mail novo, abra o Hub | entra no Hub com o banner "Conta em análise" |
| Criar kaizen | clique em "+ Novo Kaizen", preencha o nome e salve | salva sem `permission-denied` |
| Editar kaizen | reabra o kaizen, altere um campo | salva e a revisão incrementa |
| Compartilhar | compartilhe com um colega como editor | editor consegue editar o conteúdo |
| Editor não altera sharing | logado como editor, tente remover um compartilhamento | ação negada |
| Bloqueado | marque um usuário de teste como `blocked` no admin | recebe a tela de bloqueio e não lê nem salva |
| Admin | entre com a conta admin | vê todos os kaizens, aprova usuários e exclui |

## Rollback

Console → Firestore → Regras → histórico de versões → restaurar a versão anterior
(ou colar o `backup-rules-AAAA-MM-DD.txt` e Publicar). Efeito em ~1 minuto, sem mexer nos dados.

## Observações

- Publicar as regras **não** altera nenhum documento existente.
- O código do app (v2.5.1) já mostra a mensagem acionável de `permission-denied` e deixa o usuário
  `pending` entrar no Hub; a aprovação do admin passa a liberar apenas o painel executivo.
- Se o Console tiver alguma regra "hotfix" que não está no repositório, **não publique por cima**:
  envie o backup para o time antes.
