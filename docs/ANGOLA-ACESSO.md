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

## Se não funcionar

1. Chrome → menu → **Histórico** → apagar dados do site `vercel.app` (ou abrir **janela anónima**).
2. Voltar a abrir: https://farmacia-mobile-opal.vercel.app
3. Confirmar no ecrã de erro (se aparecer) que o servidor é: `farmacia-stock-production.up.railway.app`
4. Se mostrar outro servidor ou estiver vazio → app desactualizada; esperar novo deploy Vercel ou usar Chrome com o link acima.

## App Play Store

Quando publicares na Play Store, a equipa instala pela loja — a API já vem configurada no build `production`.
