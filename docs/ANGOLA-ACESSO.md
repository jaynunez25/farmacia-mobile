# Acesso em Angola (equipa no telemóvel)

## Link correcto (obrigatório)

No **Chrome** do Android, abrir **só** este endereço:

**https://farmacia-mobile-opal.vercel.app**

Não usar:

- `http://192.168.x.x` (só funciona na rede do escritório em Portugal)
- Links antigos guardados no telemóvel
- Expo Go com QR do PC

## Login

- Utilizador e palavra-passe **criados na farmácia** (ex. `admin` só se ainda não foi alterado).
- Se aparecer *Utilizador ou palavra-passe incorrectos* → credenciais erradas (não é internet).
- Se aparecer *Sem ligação* ou *demorou demasiado* → internet lenta ou app antiga.

## Internet

A API está no **Railway** (servidores fora de Angola). Com **3G/4G fraco** pode demorar 30–60 s no primeiro login. Espera ou usa **Wi‑Fi**.

## Teste no telemóvel (2 minutos)

1. Abrir no Chrome: https://farmacia-stock-production.up.railway.app/health  
   - Deve mostrar: `{"status":"ok"}`  
   - Se **não abrir** → problema de internet/DNS no telemónel (não é a app).

2. Abrir a app: https://farmacia-mobile-opal.vercel.app  
3. No login, tocar **«Testar ligação ao servidor»**  
   - **Ligação OK** → problema é utilizador/palavra-passe.  
   - **Sem ligação** → rede lenta ou bloqueio; mudar para Wi‑Fi ou outra operadora.

## Se não funcionar

1. Chrome → **janela anónima** → colar o link Vercel exacto acima.
2. Confirmar no erro: servidor = `farmacia-stock-production.up.railway.app`
3. Palavra-passe: a de **produção** (pode não ser `admin` se já foi alterada em Portugal).

## App Play Store

Quando publicares na Play Store, a equipa instala pela loja — a API já vem configurada no build `production`.
