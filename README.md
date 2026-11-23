# Kaizen Hub v2 — Gestão e Portfólio de Projetos de Melhoria Contínua

Aplicação web moderna para gestão, acompanhamento executivo e execução padronizada de projetos **STANDARD KAIZEN SOL-FR-0013 Rev00**, com persistência central no Google Cloud Firestore e hospedagem estática via GitHub Pages.

---

## 🚀 Novidades da Versão 2.0

1. **Modelo de Dados Centralizado v2 (`kaizens/{id}`)**:
   - Cada Kaizen nasce privado do proprietário, com compartilhamento explícito por usuário nos papéis **Visualizar** (`view`) e **Editar** (`edit`).
   - Controle estrito de concorrência otimista via transações com incremento de revisão (`rev`), impedindo sobreposição silenciosa.
   - Detecção ativa de status de salvamento: `saved`, `saving`, `dirty`, `unsynced` e `conflict`.

2. **Diretório Corporativo Seguro (`directory/{uid}`)**:
   - Permite localizar colegas por e-mail ou nome para compartilhar Kaizens sem expor os perfis sensíveis da coleção `users/`.

3. **Ciclo de Vida e Aprovação de Usuários**:
   - Cadastros novos nascem no estado `pending` para proteção contra acessos indevidos.
   - Painel de aprovação integrado no Painel Executivo (`admin.html`) para ativar, bloquear ou promover administradores.

4. **Classificação Financeira Aprimorada**:
   - Suporte nativo ao campo **Tipo de Benefício**: `Hard Saving (HS)` (ganho real) e `Cost Avoidance (CA)` (perda evitada).
   - Cálculo automático de B/C Ratio e indicadores executivos consolidados.

5. **Indexação e Gestão de Links**:
   - Seção dedicada de links de referência (SharePoint, OneDrive, dashboards) com metadados e tags indexáveis no motor de busca do Hub.

6. **Impressão Dedicada A4 / A3 (`print.html`)**:
   - Impressão formatada em A4 Retrato (padrão) com suporte para alternar para A3 Paisagem com um clique.

7. **Ações e Riscos Ilimitados**:
   - Fim dos limites legados do Power Apps (10 ações / 6 riscos).

8. **Migração Idempotente**:
   - Botão "Migrar meus kaizens" que converte automaticamente projetos legados da subcoleção `users/{uid}/projetos` para a estrutura global v2.

9. **Versionamento e Invalidação de Cache**:
   - Monitoramento contínuo de `version.json` com probe `no-store` e query string `?v=` nos assets estáticos.

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
├── version.json            # Metadados de versão e build para probe de atualização
├── firestore.rules         # Regras de segurança do Firestore v2
├── firestore.indexes.json  # Definição dos índices compostos
├── SETUP.md                # Passo a passo para configuração no Firebase Console
├── js/
│   ├── firebase-config.js  # Re-exportador da configuração do Firebase
│   ├── kaizen-model.js     # Modelo de dados, regras de negócio e migração
│   ├── auth.js             # Ciclo de vida de autenticação e perfis
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
    └── export-rows.test.js  # Testes de normalização e geração do workbook .xlsx
```

---

## 📦 Dependências de Terceiros

- **SheetJS Community Edition (xlsx.full.min.js)**: versão `0.20.3`, licenciada sob **Apache-2.0**.
  - Localização: `js/vendor/xlsx.full.min.js`
  - SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`
  - Utilizada para exportação offline e sob demanda do banco de dados em formato `.xlsx` nativo. Carregada tardiamente apenas quando o administrador solicita o backup.
- **Chart.js**: versão `4.4.1` (MIT), carregada via CDN no Painel Executivo (`admin.html`).

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

O projeto conta com suíte de testes unitários sem dependências externas utilizando o test runner nativo do Node.js:

```bash
# Executar a suíte de testes
npm test
# ou diretamente:
node --test tests/kaizen-model.test.js

# Verificar a sintaxe de todos os módulos JavaScript
node --check app.js
node --check admin.js
node --check js/kaizen-model.js
node --check js/auth.js
node --check js/db.js
node --check js/share.js
node --check js/ui.js
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

---

## 🔒 Configuração e Deploy

Consulte o arquivo **[SETUP.md](SETUP.md)** para instruções detalhadas sobre habilitação de autenticação, publicação de regras de segurança, criação de índices compostos e o procedimento de bootstrap do primeiro administrador.
