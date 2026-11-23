# Kaizen Hub v2 — Gestão e Portfólio de Projetos de Melhoria Contínua

Aplicação web moderna para gestão, acompanhamento executivo e execução padronizada de projetos **STANDARD KAIZEN SOL-FR-0013 Rev00**, com persistência central no Google Cloud Firestore e hospedagem estática via GitHub Pages.

---

## 🚀 Novidades da Versão 2.0 e 2.3

1. **Modelo de Dados Centralizado v2 (`kaizens/{id}`)**:
   - Cada Kaizen nasce privado do proprietário, com compartilhamento explícito por usuário nos papéis **Visualizar** (`view`) e **Editar** (`edit`).
   - Controle estrito de concorrência otimista via transações com incremento de revisão (`rev`), impedindo sobreposição silenciosa.
   - Detecção ativa de status de salvamento: `saved`, `saving`, `dirty`, `unsynced` e `conflict`.

2. **Diretório Corporativo Seguro (`directory/{uid}`)**:
   - Permite localizar colegas por e-mail ou nome para compartilhar Kaizens sem expor os perfis sensíveis da coleção `users/`.

3. **Ciclo de Vida e Notificação de Novos Cadastros**:
   - Cadastros novos nascem no estado `pending` com seleção obrigatória de **Área de Negócio**.
   - Cloud Functions v2 em Node 20 com trigger `onDocumentCreated` em `users/{uid}` e despacho automático de e-mail ao administrador.
   - Deep link direto no e-mail (`admin.html?tab=users&status=pending`) que abre o painel já na aba de Usuários com filtro em Pendentes.
   - Ledger de idempotência em `notificacoes/{uid}` com claim atômico e rate limit de 20 envios/hora.

4. **Classificação Financeira Aprimorada**:
   - Suporte nativo ao campo **Tipo de Benefício**: `Hard Saving (HS)` (ganho real) e `Cost Avoidance (CA)` (perda evitada).
   - Cálculo automático de B/C Ratio e indicadores executivos consolidados.

5. **Exportação Completa em Excel (.xlsx)**:
   - Backup do banco de dados em 9 abas estruturadas via SheetJS CE 0.20.3 (offline/vendorizado).

6. **Impressão Dedicada A4 / A3 (`print.html`)**:
   - Impressão formatada em A4 Retrato (padrão) com suporte para alternar para A3 Paisagem com um clique.

7. **Ações e Riscos Ilimitados**:
   - Fim dos limites legados do Power Apps (10 ações / 6 riscos).

8. **Migração Idempotente**:
   - Botão "Migrar meus kaizens" que converte automaticamente projetos legados da subcoleção `users/{uid}/projetos` para a estrutura global v2.

9. **Versionamento e Invalidação de Cache (Frente A)**:
   - Fonte única de verdade via `version.json`, gerando metas HTML e cache-busters `?v=`.
   - Comparadores determinísticos de build (`YYYYMMDD-NN`) e semver, dispensa persistente e atualização segura com `?r=`.

---

## 📁 Estrutura de Arquivos

```text
Projetos-de-performance/
├── index.html              # Hub principal e Editor Kaizen (SPA)
├── style.css               # Design System, tokens light/dark, responsivo
├── app.js                  # Orquestrador da SPA, formulários e sincronização
├── print.html              # Tela de impressão A4/A3 e geração de PDF
├── admin.html              # Painel executivo, KPIs, gráficos e aprovação de usuários
├── admin.js                # Lógica do painel de administração e relatórios
├── admin.css               # Estilos específicos do painel executivo
├── firebase-config.js      # Configuração pública do Firebase com memoryLocalCache
├── firebase.json           # Configuração de deployment do Firebase (Functions)
├── .firebaserc             # Projeto padrão (projeto-de-performance-bb964)
├── version.json            # Metadados de versão e build para probe de atualização
├── firestore.rules         # Regras de segurança do Firestore v2
├── firestore.indexes.json  # Definição dos índices compostos
├── SETUP.md                # Passo a passo para configuração no Firebase Console
├── functions/              # Cloud Functions v2 (Node 20)
│   ├── package.json        # Dependências: firebase-admin, firebase-functions, nodemailer
│   ├── index.js            # Triggers: notifyNewUserRequest e notifyPendingDigest
│   ├── lib/
│   │   ├── template.js     # Template puro de e-mail (texto + HTML escapado)
│   │   ├── recipients.js   # Resolução de destinatários (emailsTo > admins ativos)
│   │   ├── ledger.js       # Ledger de idempotência e rate limit (notificacoes/{uid})
│   │   └── mailer.js       # Transporte Nodemailer SMTP, mock file (.eml) e fail
│   └── test/               # Suíte de testes automatizados com node --test
├── js/
│   ├── firebase-config.js  # Re-exportador da configuração do Firebase
│   ├── kaizen-model.js     # Modelo de dados, regras de negócio e migração
│   ├── auth.js             # Ciclo de vida de autenticação, cadastro com área e perfis
│   ├── db.js               # Camada Firestore v2, transações e debounce
│   ├── share.js            # Modal de compartilhamento e busca no diretório
│   ├── ui.js               # Toasts, banner offline, modais e tema
│   ├── version.js          # Identidade local, comparadores e probe de versão
│   ├── export-rows.js      # Estrutura tabular pura para exportação de planilhas
│   ├── export-xlsx.js      # Orquestrador paginado de exportação para Excel
│   └── vendor/
│       └── xlsx.full.min.js # SheetJS CE 0.20.3 (Apache-2.0, offline/vendorizado)
├── scripts/
│   ├── release.mjs         # Sincronização e verificação de versão e build
│   └── wait-pages.mjs      # Polling do version.json no GitHub Pages
└── tests/
    ├── kaizen-model.test.js # Testes de modelo, regras e migração
    ├── version.test.js      # Testes de semver, build e probe de versão
    ├── export-rows.test.js  # Testes de normalização e geração do workbook .xlsx
    └── auth-deeplink.test.js # Testes de cadastro com área e deep link admin
```

---

## 📦 Dependências de Terceiros

- **SheetJS Community Edition (xlsx.full.min.js)**: versão `0.20.3`, licenciada sob **Apache-2.0**.
  - Localização: `js/vendor/xlsx.full.min.js`
  - SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`
  - Utilizada para exportação offline e sob demanda do banco de dados em formato `.xlsx` nativo. Carregada tardiamente apenas quando o administrador solicita o backup.
- **Chart.js**: versão `4.4.1` (MIT), carregada via CDN no Painel Executivo (`admin.html`).
- **Nodemailer**: versão `^7.0.0` (MIT), utilizado em ambiente server-side nas Cloud Functions v2 (`functions/lib/mailer.js`) para despacho seguro de e-mails transacionais via SMTP autenticado.

---

## 📬 Notificação de novos pedidos de acesso (Cloud Functions v2)

Quando um novo usuário se cadastra no Kaizen Hub, seu registro nasce com `status: "pending"` e a Cloud Function v2 `notifyNewUserRequest` é acionada em tempo real para notificar a caixa dos administradores com link direto de aprovação.

A notificação possui as seguintes garantias arquiteturais:
- **Coleção Fechada de Idempotência:** Gravada em `notificacoes/{uid}` via Admin SDK; o documento `users/{uid}` nunca é alterado pela função, preservando a integridade das regras de perfil do usuário.
- **Claim Transacional:** Impede disparos concorrentes duplicados (reexecuções at-least-once do Cloud Functions).
- **Rate Limit de Proteção:** Limite de 20 notificações por hora para proteger contra abusos em massa.
- **Kill Switch Operacional:** Configuração `notificacoes.enabled: false` em `config/app` permite desativar envios instantaneamente sem necessidade de redeploy.
- **Segredos Isolados:** Senha de app do SMTP gerenciada no Google Secret Manager (`SMTP_PASS`), nunca exposta no código nem em repositório.

### Passos manuais do Groot para deploy (execução única)

Estes passos exigem a conta proprietária do projeto no Firebase / Google Cloud:

1. **Ativar o plano Blaze (pague conforme o uso)**:
   - Abra: [https://console.firebase.google.com/project/projeto-de-performance-bb964/usage](https://console.firebase.google.com/project/projeto-de-performance-bb964/usage)
   - Clique em **"Detalhes e faturamento"** → **"Modificar plano"** → selecione **Blaze**.
   - Cadastre a forma de pagamento. O Spark não suporta Cloud Functions. O volume atual de requisições tem custo estimado em US$ 0,00.

2. **Criar alerta de orçamento (proteção financeira)**:
   - Abra: [https://console.cloud.google.com/billing](https://console.cloud.google.com/billing) (selecione a conta de faturamento vinculada).
   - Menu **Orçamentos e alertas** → **Criar orçamento** → escopo "Projeto: `projeto-de-performance-bb964`" → valor **US$ 1** → alertas em 50%, 90% e 100% por e-mail.

3. **Conferir a região do Firestore**:
   - Abra: [https://console.firebase.google.com/project/projeto-de-performance-bb964/firestore/databases](https://console.firebase.google.com/project/projeto-de-performance-bb964/firestore/databases)
   - Confirme a **localização** do banco (padrão esperado: `southamerica-east1`). Se for diferente (ex: `nam5`), exporte a variável de ambiente correspondente antes do deploy: `export FUNCTION_REGION=sua-regiao`.

4. **Criar a senha de app do Gmail (dedicada)**:
   - Abra: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (com verificação em 2 etapas ativa na conta `ghgghgc60@gmail.com`).
   - Nome do app: **Kaizen Hub Functions** → clique em **Criar** → copie a senha de 16 caracteres gerada.

5. **Instalar e autenticar o Firebase CLI**:
   - No seu terminal:
     ```bash
     npm i -g firebase-tools
     firebase login
     cd ~/crew/coder/work/kaizen-web
     firebase use projeto-de-performance-bb964
     ```

6. **Gravar o segredo do SMTP no Secret Manager**:
   - Execute:
     ```bash
     firebase functions:secrets:set SMTP_PASS
     ```
   - Cole a senha de app de 16 caracteres criada no passo 4.

7. **Publicar as Cloud Functions**:
   - Execute:
     ```bash
     firebase deploy --only functions
     ```
   - Na primeira publicação, confirme a ativação das APIs necessárias (Cloud Build, Artifact Registry, Eventarc, Cloud Run, Secret Manager).
   - Aguarde o término: `Functions deploy complete` informando `notifyNewUserRequest` e `notifyPendingDigest`.

### Teste de Fumaça (Smoke Test)

Após o deploy das funções:
1. No Kaizen Hub, acesse a aba **Criar conta** e cadastre um e-mail de teste com alias: `ghgghgc60+kaizen-teste1@gmail.com`, informando Nome e selecionando Área de Negócio (ex: **DAF**).
2. Em até 1 minuto, confira a caixa de entrada de `ghgghgc60@gmail.com`:
   - Assunto: `[Kaizen Hub] Novo pedido de acesso — <Nome>`
   - Corpo: Nome, e-mail, área informada e link direto.
3. No [Firebase Console (Firestore)](https://console.firebase.google.com/project/projeto-de-performance-bb964/firestore/data), confirme a existência do documento `notificacoes/{uid}` com `status: "enviado"`.
4. Clique no link recebido por e-mail: a aplicação deve abrir em `admin.html`, ativar a aba **Usuários e Aprovações** e filtrar automaticamente por contas com status **Pendentes**.
5. No painel, **bloqueie** ou rejeite a conta de teste para finalizar o ciclo.

---

## 📊 Exportação Completa do Banco (.xlsx)

Exclusiva para usuários com papel `admin` ativo:
- Disponível na aba **Configurações** do Painel Executivo (`admin.html`).
- Gera arquivo `kaizen-hub-backup-AAAAMMDD-HHmm.xlsx` contendo 9 abas estruturadas:
  1. **Resumo**: Metadados da exportação, totais e auditoria.
  2. **Kaizens**: Todos os kaizens com 57 colunas normalizadas.
  3. **Usuários**: Cadastro completo com papel, status e data.
  4. **Compartilhamentos**: Relação desnormalizada e deduplicada kaizen ↔ pessoa.
  5. **Ações**: Plano de ação detalhado com status e prazos.
  6. **Riscos**: Matriz de severidade, probabilidade e scores calculados.
  7. **Links**: Repositório de referências e tags.
  8. **Configurações**: Parâmetros do sistema (`config/app` e `config/lookups`).
  9. **Diretório**: Base corporativa de contatos.
- O botão existente no dashboard segue ativo como **Exportar CSV (filtro atual)**.

---

## 🧪 Testes Automatizados

O projeto conta com suíte de testes unitários e de integração utilizando o test runner nativo do Node.js:

```bash
# Executar a suíte de testes do cliente (raiz)
npm test

# Executar a suíte de testes das Cloud Functions
cd functions && npm test
```

---

## 🌐 Teste Local com Servidor HTTP

Por utilizar módulos ES nativos (`import`/`export`), a aplicação deve ser executada a partir de um servidor HTTP (nunca direto pelo protocolo `file://`):

```bash
python3 -m http.server 8080
```

Acesse:
- **Kaizen Hub:** `http://localhost:8080/index.html`
- **Painel Executivo:** `http://localhost:8080/admin.html`
- **Impressão:** `http://localhost:8080/print.html?id=ID_DO_KAIZEN`
