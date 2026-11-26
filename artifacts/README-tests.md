# Evidências de teste (branch `fix/share-permissions`)

Executado nesta máquina (Java 17 Temurin em `~/.local/bin/java`), sem deploy e sem tocar produção.

## 1. Testes Node (suíte existente + novos)

```bash
npm test
```

- Resultado: **51 passed, 0 failed** (baseline era 36) — saída completa em `artifacts/test-npm.txt`.
- Novos casos:
  - `getDirectoryShareStatus()` — ativo / inativo / legado sem status / doc inconsistente.
  - `prepareKaizenSharingSave()` — remoção de acesso e troca de papel sem e-mail pendente.
  - `isBareEmail()` e `directoryLookupMessage()` — e-mail colado vs. item do autocomplete; mensagem por estado.
  - `tests/share-flow.test.js` — proíbe `ext-*`, garante `lookupDirectoryRecipient`, salva sem e-mail pendente e usa o normalizador único.
  - `tests/directory-status.test.js` — `status` persistido no `directory/` nos 2 pontos de `js/auth.js`, propagado por `admin.js` e exigido pelas rules.
  - `tests/admin-restore.test.js` — botão "Restaurar" do `admin.js` reutiliza `restoreKaizen()` (transação com `rev + 1` e `atualizadoPor`), sem `updateDoc` parcial, com `try/catch` e toast de erro.

## 2. Suíte de rules no emulador

```bash
npm run test:rules
```

- Resultado: **41 passed, 0 failed** — saída completa em `artifacts/test-rules.txt`.
- Composição: **27/27 da matriz de `kaizens`** (a mesma do aceite, agora com `stranger` semeado como `active` para que o caso
  "non-member filtered list returns zero" falhe por não casar a query — e não por `isActive()`), **+ 8 casos de `directory/`**
  e **+ 6 casos de soft delete/restore** (`tests/rules-restore.test.mjs`):
  - membro ativo lista o diretório; usuário `pending` não lista;
  - aprovação do admin propaga `status` para `directory/{uid}`;
  - usuário não consegue autoelevar/bloquear o próprio `status`;
  - usuário repara documento legado sem `status` (usando o próprio `users/{uid}.status`);
  - usuário atualiza o próprio diretório sem mudar `status`;
  - criação só é aceita quando `status` bate com `users/{uid}` (não dá para nascer ativo);
  - criação com `status` divergente do `users/{uid}` é negada;
  - admin restaura arquivado com `rev+1` (payload do `restoreKaizen`) → allow; sem `rev` (payload antigo do botão) → deny;
  - admin e dono fazem soft delete com `rev+1` → allow; sem `rev` → deny;
  - dono restaura arquivado com `rev+1` → allow.
- Execução isolada da matriz do aceite: **27/27** — saída em `artifacts/test-rules-matrix.txt`
  (comando: `npx firebase emulators:exec --only firestore,auth "node --test tests/rules.test.mjs"`).

## 3. Backfill (dry-run)

Ver `artifacts/README-dry-run.md` — amostra **sintética** de 5 diffs + prova de idempotência (`count=0` na segunda passada).
A execução contra produção continua pendência humana.

## 4. Segurança / escopo

- Nenhum `firebase deploy`, nenhuma escrita no Firestore, nenhum `git push`.
- `node --check` OK em `js/share.js`, `js/kaizen-model.js`, `js/auth.js` e `admin.js`.
- `firebase.json` versiona rules + indexes (`firestore.rules`, `firestore.indexes.json`).
