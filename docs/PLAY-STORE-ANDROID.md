# Google Play Store — app Android (Pharmaos)

A **versão web** (Vercel) **não muda**. Continua em:

https://farmacia-mobile-opal.vercel.app

A Play Store é **outro canal**: um ficheiro `.aab` instalado no telemóvel, ligado à **mesma API** no Railway.

---

## O que NÃO se desconfigura

| Ambiente | O que usa |
|----------|-----------|
| **PC / browser** | Vercel (deploy GitHub) |
| **Teu PC dev** | `.env` local com IP `192.168.x.x` + `npx expo start` |
| **Play Store** | `eas.json` → `EXPO_PUBLIC_API_URL` = Railway (no build na nuvem) |

O `.env` do PC **não entra** no APK. O EAS usa o URL em `eas.json` → perfil `production`.

---

## Pré-requisitos (uma vez)

1. Conta [Google Play Console](https://play.google.com/console) — taxa única ~25 USD.
2. Conta [Expo](https://expo.dev) — projeto já ligado (`projectId` no `app.config.ts`).
3. Node.js no PC.

```bash
npm install -g eas-cli
eas login
cd farmacia-mobile
```

---

## Passo 1 — Build para a Play Store (AAB)

```bash
cd farmacia-mobile
eas build --platform android --profile production
```

- Gera **Android App Bundle** (`.aab`), formato exigido pela Play Store.
- `autoIncrement` aumenta o `versionCode` em cada build.
- API de produção: `https://farmacia-stock-production.up.railway.app`

**Teste rápido antes da loja (APK interno):**

```bash
eas build --platform android --profile preview
```

Instalas o APK no telemóvel (link que o EAS envia por email).

---

## Passo 2 — Play Console

1. **Criar app** → nome **Pharmaos** (ou Farmácia Nunes).
2. **Package name** (tem de ser igual ao projeto): `com.farmacianunes.mobile`
3. Preencher ficha da loja (textos, ícone 512×512, capturas de ecrã).
4. **Política de privacidade** — URL obrigatória (pode ser uma página simples no Vercel ou site da farmácia).
5. Questionário de conteúdo / público-alvo.

---

## Passo 3 — Enviar o AAB

### Opção A — Upload manual

1. Quando o `eas build` terminar, descarrega o `.aab`.
2. Play Console → **Produção** ou **Teste interno** → **Criar versão** → carregar o `.aab`.

### Opção B — EAS Submit (automático)

1. Cria conta de serviço Google Play + JSON (Play Console → Utilizadores → Conta de serviço).
2. Guarda o JSON como `farmacia-mobile/google-service-account.json` (não commits — está no `.gitignore`).
3.:

```bash
eas submit --platform android --profile production --latest
```

(Ajusta `track` em `eas.json`: `internal` → `production` quando estiveres pronto.)

---

## Passo 4 — Railway (CORS)

A app Android **não** usa domínio Vercel. Mesmo assim, confirma no Railway:

```text
CORS_ORIGINS=https://farmacia-mobile-opal.vercel.app
```

(Nativo normalmente não precisa de CORS; a web sim.)

---

## Atualizar a app na loja

1. Sobe `version` em `app.config.ts` (ex. `1.0.1`).
2. `eas build --platform android --profile production`
3. `eas submit` ou upload manual do novo `.aab`.

---

## Resumo

- **Não precisas de outro backend** — mesma API Railway.
- **Não estragas o PC/web** — Vercel e `.env` local ficam como estão.
- **Play Store** = `eas build` + Play Console; package `com.farmacianunes.mobile`.

Dúvidas comuns: build falha → `eas build:view` nos logs; login na app falha → confirma `EXPO_PUBLIC_API_URL` no perfil `production` do `eas.json`.
