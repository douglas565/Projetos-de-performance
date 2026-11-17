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
│   └── ui.js               # Toasts, banner offline, modais e tema
└── tests/
    └── kaizen-model.test.js # Testes unitários nativos (node --test)
```

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
