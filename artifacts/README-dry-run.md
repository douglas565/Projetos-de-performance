# Backfill de compartilhamentos — dry-run (AMOSTRA SINTÉTICA)

> ⚠️ **Esta amostra é 100% sintética.** Todos os IDs (`KZ-SYNTH-*`), e-mails (`u*@example.com`) e UIDs
> são fictícios. Nenhuma leitura ou escrita ocorreu no Firestore de produção e nenhuma credencial foi usada.
> A execução real do `--dry-run` contra produção continua **pendência humana** (precisa de
> `GOOGLE_APPLICATION_CREDENTIALS` do projeto `projeto-de-performance-bb964`).

## Como esta amostra foi gerada

```bash
KAIZEN_BACKFILL_INPUT=fixtures/backfill-shares-sample.json \
KAIZEN_BACKFILL_LOG=artifacts/backfill-shares-dry-run.jsonl \
node scripts/backfill-shares.mjs --dry-run
```

- Fixture: `fixtures/backfill-shares-sample.json` — 7 documentos sintéticos: 5 que precisam de
  reconciliação + 2 controles já corretos (devem ficar intocados).
- Saída completa (stdout): `artifacts/backfill-shares-dry-run.stdout.jsonl`
- Log antes/depois por documento: `artifacts/backfill-shares-dry-run.jsonl`

## Resultado

`mode=dry-run`, **count=5** documentos precisariam de reconciliação (os 2 controles não aparecem no log).

| # | Documento | Detecção | Antes (sharedWith / viewers / editors) | Depois |
|---|-----------|----------|----------------------------------------|--------|
| 1 | `KZ-SYNTH-0001` | UID sintético `ext-123` nas 3 listas | `[ext-123]` / `[ext-123]` / `[ext-123]` | `[u0]` / `[u0]` / `[]` (role `view`) |
| 2 | `KZ-SYNTH-0002` | UID sintético `ext-123` nas 3 listas | `[ext-123]` / `[ext-123]` / `[ext-123]` | `[u1]` / `[]` / `[u1]` (role `edit`) |
| 3 | `KZ-SYNTH-0003` | vínculo ausente: `sharedWithUids` vazio com `shares` preenchido | `[]` / `[u2]` / `[]` | `[u2]` / `[u2]` / `[]` |
| 4 | `KZ-SYNTH-0004` | `ext-999` indevido em `editorsUids` (divergência de papel) | `[u3]` / `[u3]` / `[ext-999]` | `[u3]` / `[]` / `[u3]` |
| 5 | `KZ-SYNTH-0005` | UID fantasma `u4-extra` nas listas, sem `share` correspondente | `[u4,u4-extra]` / `[u4,u4-extra]` / `[]` | `[u4]` / `[u4]` / `[]` |

## Prova de idempotência

- Rodar o mesmo dry-run duas vezes produz log **byte-idêntico** (`cmp` OK).
- Reprocessar os 5 documentos **já no estado corrigido** (`after`) retorna **count=0** — a função
  `needsShareBackfill()` não encontra mais divergência.

## Segurança (verificado no código e na execução)

- `--dry-run` é o modo padrão; `--apply` exige `KAIZEN_BACKFILL_AUTHORIZED=yes` **e**
  `GOOGLE_APPLICATION_CREDENTIALS` com `project_id` conferido.
- Reversão a partir do log: `node scripts/revert-shares-backfill.mjs <log.jsonl> --apply`
  (exige a mesma autorização explícita).
- Nesta execução: nenhum `firebase deploy`, nenhuma escrita no Firestore, nenhum push.

## Pendência humana (não executada aqui)

1. Exportar/ler os `kaizens` reais e rodar `--dry-run` com credencial do projeto → anexar a amostra real.
2. Autorizar `--apply` (com reversão pronta a partir do log).
3. `firebase deploy --only firestore:rules,firestore:indexes`.
