# Kaizen Hub — GitHub Pages + Firebase

Estrutura (todos na raiz do repositório):

```
index.html          login + hub + editor Kaizen (SPA, 3 views)
style.css           estilo
firebase-config.js  <-- ÚNICO arquivo que você precisa editar
app.js              auth, CRUD, autosave
```

## 1. Firebase (5 min)
1. https://console.firebase.google.com → **Adicionar projeto**.
2. **Authentication → Sign-in method → E-mail/senha → Ativar**.
3. **Firestore Database → Criar banco → modo produção**.
4. **Configurações do projeto → Seus apps → Web (</>)** → copie o objeto `firebaseConfig` e cole em `firebase-config.js`.
5. **Authentication → Settings → Authorized domains** → adicione `SEUUSUARIO.github.io`.

## 2. Regras do Firestore (cada usuário só vê os próprios projetos)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/projetos/{projetoId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 3. GitHub Pages
1. Crie o repositório e envie os 4 arquivos na raiz.
2. **Settings → Pages → Source: Deploy from a branch → main / (root)** → Save.
3. Acesse `https://SEUUSUARIO.github.io/NOME-DO-REPO/`.

> Obs.: os arquivos usam `type="module"`. Para testar local use um servidor
> (`python -m http.server`), não abra por `file://`.

## Modelo de dados
`users/{uid}/projetos/{projetoId}` com os blocos do STANDARD KAIZEN SOL-FR-0013 Rev00:
pilares (S/Q/E/L/P), cabeçalho, 1 Incômodo, 2 Causas + 5W2H, 3 Meta, 4 Plano de ação (array),
5 Monitoramento, 6 Padronização, 7 Aprovação/Expansão, 8 Resultados (B/C ratio) e Análise de riscos (array).

## Recursos
- Login / criar conta / recuperar senha (e-mail + senha).
- Hub com vários projetos por usuário, busca, % de conclusão e conclusão média.
- Novo projeto → gera automaticamente o formulário Kaizen em branco.
- **Autosave** com debounce de 900 ms (indicador "Salvando…/Salvo ✓" na barra superior) + salvamento ao voltar/fechar a aba.
- Edição livre de qualquer projeto, exclusão e exportação via Imprimir/PDF.
- B/C Ratio automático e Score de risco (Severidade × Probabilidade) colorido.
