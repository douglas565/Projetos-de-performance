# Kaizen Hub v2 — Guia de Configuração no Firebase Console (SETUP.md)

Este guia descreve os passos manuais necessários no **Firebase Console** (projeto `projeto-de-performance-bb964`) para ativar a arquitetura v2 do Kaizen Hub.

---

## 1. Ativação do Authentication (E-mail e Senha)

1. Acesse o [Firebase Console](https://console.firebase.google.com/) e selecione o projeto `projeto-de-performance-bb964`.
2. No menu lateral esquerdo, clique em **Criação** (ou *Build*) → **Authentication**.
3. Na aba **Sign-in method**:
   - Clique em **E-mail/senha** (*Email/Password*).
   - Ative a chave **E-mail/senha**.
   - Mantenha desativada a opção "Link do e-mail (login sem senha)".
   - Clique em **Salvar**.
4. Na aba **Configurações** (*Settings*) do Authentication:
   - Clique em **Domínios autorizados** (*Authorized domains*).
   - Verifique e adicione os domínios:
     - `localhost`
     - `127.0.0.1`
     - `projeto-de-performance-bb964.firebaseapp.com`
     - `douglas565.github.io`
   - Na seção **Proteção contra enumeração de e-mail** (*Email enumeration protection*):
     - Recomendado: **Ativado** (garante mensagens genéricas em tentativas de login).

---

## 2. Aplicar as Regras de Segurança do Firestore (`firestore.rules`)

1. No menu lateral, acesse **Criação** → **Firestore Database**.
2. Clique na aba **Regras** (*Rules*).
3. Substitua todo o conteúdo existente pelo arquivo `firestore.rules` deste repositório (regras v2).
4. Clique no botão **Publicar** (*Publish*).

> **Resumo de proteção das regras:**
> - Leitura de Kaizens: somente usuários autenticados com `status == 'active'` que sejam donos, estejam na lista de compartilhamento (`sharedWithUids` / `viewersUids` / `editorsUids`) ou administradores (`role == 'admin'`).
> - Escrita de Kaizens: somente dono, editores autorizados ou administrador. Visualizadores (`view`) nunca gravam.
> - Compartilhamento de Kaizens: somente o criador/dono ou administrador pode alterar permissões (`shares`, `viewersUids`, `editorsUids`, `sharedWithUids`). Editores de conteúdo não podem re-compartilhar.
> - Concorrência otimista: validação estrita de `request.resource.data.rev == resource.data.rev + 1`.
> - Novos cadastros: criados obrigatoriamente com `status: 'pending'` e `role: 'user'`.

---

## 3. Criar os Índices Compostos no Firestore (`firestore.indexes.json`)

Para que as consultas com filtros e ordenação por data funcionem perfeitamente, crie os seguintes índices na aba **Índices** (*Indexes*) do Firestore (ou execute via CLI se configurado):

1. **Coleção:** `kaizens`
   - Campos:
     - `ownerUid` (Crescente / ASC)
     - `atualizadoEm` (Decrescente / DESC)
   - Escopo: Coleção

2. **Coleção:** `kaizens`
   - Campos:
     - `sharedWithUids` (Contém matriz / ARRAY_CONTAINS)
     - `atualizadoEm` (Decrescente / DESC)
   - Escopo: Coleção

3. **Coleção:** `kaizens`
   - Campos:
     - `searchKeywords` (Contém matriz / ARRAY_CONTAINS)
     - `atualizadoEm` (Decrescente / DESC)
   - Escopo: Coleção

4. **Coleção:** `kaizens`
   - Campos:
     - `areaNegocio` (Crescente / ASC)
     - `tipo` (Crescente / ASC)
     - `atualizadoEm` (Decrescente / DESC)
   - Escopo: Coleção

5. **Coleção:** `kaizens`
   - Campos:
     - `status` (Crescente / ASC)
     - `atualizadoEm` (Decrescente / DESC)
   - Escopo: Coleção

6. **Coleção:** `users`
   - Campos:
     - `status` (Crescente / ASC)
     - `role` (Crescente / ASC)
   - Escopo: Coleção

---

## 4. Bootstrap do 1º Administrador (Groot)

Como o site é público e todo novo cadastro nasce por padrão com `status: "pending"` para evitar acesso não autorizado, a promoção do primeiro administrador deve ser feita no console:

1. Abra a aplicação web e vá na aba **Criar conta**.
2. Cadastre seu e-mail corporativo (ex.: seu e-mail pessoal/trabalho) e defina sua senha.
3. Ao finalizar, a tela exibirá: *"Aguardando aprovação"*.
4. Vá para o **Firebase Console** → **Authentication** → copie o seu `UID` de usuário (ex.: `aBcDeFg123...`).
5. Acesse **Firestore Database** → aba **Dados** (*Data*).
6. Localize a coleção `users` e clique no documento com o seu `UID` (`users/{seu_uid}`).
   *(Se o documento ainda não existir, clique em "Iniciar coleção" ou "Adicionar documento" com o ID sendo o seu UID)*.
7. Altere ou adicione os seguintes campos no documento:
   - `status`: string `"active"`
   - `role`: string `"admin"`
8. Salve o documento.
9. Volte para o Kaizen Hub e clique no botão **"Verificar de novo"**.
10. O acesso ao Hub e ao **Painel Executivo** (`admin.html`) será liberado imediatamente!
11. A partir deste momento, você poderá aprovar e promover outros colegas diretamente pela aba **Usuários e Aprovações** do Painel Executivo.

---

## 5. Configuração Inicial do Sistema (`config/app`)

No primeiro acesso como admin, acesse a aba **Configurações** no Painel Executivo (`admin.html`):
- **Modo de cadastro:** escolha `approval` (Aprovação manual).
- **Exigir e-mail verificado:** marque `true`.
- Clique em **Salvar configurações**. O Firestore criará automaticamente o documento `config/app`.

Pronto! O ambiente estará 100% operacional no padrão Kaizen Hub v2.
