# Teste local — Captura AI (Expo + backend)

## 1. Backend (`farmacia-web/backend`)

```bat
run.bat
```

`.env` mínimo:

```env
ENVIRONMENT=development
DATABASE_URL=sqlite:///./farmacia.db
SECRET_KEY=dev-local
CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
REMOVEBG_API_KEY=          # opcional; sem chave só redimensiona
OCR_PROVIDER=stub          # ou google + GOOGLE_APPLICATION_CREDENTIALS
```

Postgres: correr `schema/migration_ai_capture.sql` uma vez.

Testar: `GET http://localhost:8000/health`

## 2. Mobile (`farmacia-mobile`)

`.env`:

```env
EXPO_PUBLIC_API_URL=http://SEU_IP_LAN:8000
```

`ipconfig` → IPv4 (ex. `192.168.1.50`). **Não uses localhost no telemóvel físico.**

```bash
npx expo start --lan
```

Login **admin** → Stock → **Captura AI** → foto → formulário **Novo produto** (mesmos campos) → gravar.

## 3. Fluxo

1. `POST /ai-capture/jobs` — processa imagem  
2. Rascunho em memória local  
3. `produto-criar` — preços/stock/lâmina como sempre  
4. `POST /products` — mesmo endpoint do manual  

## 4. Android APK

Variáveis `EXPO_PUBLIC_*` entram no **build EAS**, não no `.env` do PC depois de gerado o APK.
