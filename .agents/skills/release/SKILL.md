# Release Skill — Carica Aggiornamento

Quando l'utente dice **"carica aggiornamento"** o qualsiasi variante, esegui questo workflow.

## Workflow

### 1. Build dell'app
```bash
bash scripts/release.sh
```
Questo:
- Builda l'app Tauri (Next.js export + Rust release)
- Firma l'update con la chiave privata
- Genera `latest.json` con la firma e i metadati

Output:
- `src-tauri/target/release/bundle/dmg/Codex Proxy_<version>_aarch64.dmg`
- `src-tauri/target/release/bundle/dmg/latest.json`

### 2. Se CI non configurata → Upload manuale su GitHub Releases

Se il workflow GitHub Actions non è pronto o i secret non sono impostati:

1. Chiedi all'utente di creare un **tag** e pusarlo:
   ```bash
   git tag v<versione>
   git push origin v<versione>
   ```

2. Vai su **GitHub → Repository → Releases**
3. Clicca **"Draft a new release"**
4. Seleziona il tag appena pushato
5. Carica questi file:
   - `Codex Proxy_<versione>_aarch64.dmg`
   - `latest.json`
6. Pubblica

### 3. Se CI configurata → Push del tag basta

Se i secret GitHub sono impostati:
```bash
git tag v<versione> && git push origin v<versione>
```
Il workflow `.github/workflows/release.yml` builda e pubblica automaticamente.

### 4. Verifica primo avvio
Dopo il rilascio, l'app esistente riceverà una notifica di aggiornamento al prossimo avvio.

## Cosa può fare l'AI

| Passo | Automatico? |
|-------|------------|
| Eseguire `scripts/release.sh` | ✅ Sì |
| Leggere versione da `tauri.conf.json` | ✅ Sì |
| Leggere private key | ✅ Se presente in `~/.tauri/ccp.key` |
| Creare tag git | ✅ Sì |
| Push su GitHub | ✅ Se autenticato |
| Caricare file su GitHub Releases | ❌ Serve token GitHub |
| Aggiungere secret a GitHub | ❌ Manuale (impostazioni repo) |

## Secret GitHub necessari

Per il CI workflow, l'utente deve aggiungere questi secret in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Valore |
|--------|--------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contenuto di `~/.tauri/ccp.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `ccp-update-key` |

Per leggere la private key:
```bash
cat ~/.tauri/ccp.key
```

## Note

- La versione si legge da `src-tauri/tauri.conf.json` → campo `"version"`
- Il DMG è solo per Apple Silicon (aarch64)
- Serve Node.js 22+ e Rust toolchain per il build
