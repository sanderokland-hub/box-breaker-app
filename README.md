# Box Breaker Hub

Simple web app for managing breaks, spot lists, and buyer intake.

## Setup

1. Install dependencies:
   - `cd box-breaker-app/server`
   - `npm install`
2. Start server:
   - `npm start`
3. Open `http://localhost:3000`

## Deployment

- **Production:** https://app.cardgems.com  
- App runs on a **Hostinger VPS**; the domain points to that server.

**Full start-to-finish guide:** see **[DEPLOY-GUIDE.md](DEPLOY-GUIDE.md)** for the in-depth setup (VPS setup, SSH keys, deploy config, and troubleshooting).

### Deploy using GitHub Desktop

If you prefer to commit and push in **GitHub Desktop**:

1. Commit and push your changes in GitHub Desktop as usual.
2. In **PowerShell** (project folder), run:
   ```powershell
   .\deploy-vps-only.ps1
   ```
   This SSHs to the VPS, runs `git pull`, `npm install`, and restarts the app. No commit/push—only updates the server.

### One-command deploy (local → GitHub → VPS via SSH)

From the project folder in **PowerShell**, run:

```powershell
.\deploy.ps1
```

Or with a custom commit message:

```powershell
.\deploy.ps1 "Add manual buyer form"
```

This will: **commit** all changes → **push** to GitHub → **SSH** into your VPS → run **git pull**, **npm install**, and **restart the app**. Your local updates are then live on the server.

**One-time setup:**

1. **SSH key (so you don’t type a password every time)**  
   On your Windows machine in PowerShell:

   ```powershell
   ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519" -N '""'
   type $env:USERPROFILE\.ssh\id_ed25519.pub
   ```
   Copy the printed line. On the VPS (SSH in via Hostinger’s panel or existing SSH):

   ```bash
   mkdir -p ~/.ssh
   echo "PASTE_YOUR_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/authorized_keys
   ```

2. **Deploy config**  
   Copy the example config and fill in your VPS details:

   ```powershell
   copy deploy-config.ps1.example deploy-config.ps1
   notepad deploy-config.ps1
   ```
   Set:
   - **DeployUser** – SSH user (e.g. `root`)
   - **DeployHost** – VPS IP or hostname from Hostinger
   - **DeployPath** – Full path to the project on the VPS (e.g. `/home/username/box-breaker-app`)

3. **VPS must have the repo**  
   On the VPS, the app should already be in a folder that was cloned from GitHub, e.g.:

   ```bash
   git clone https://github.com/YOUR_USERNAME/box-breaker-app.git
   cd box-breaker-app/server && npm install
   # Then start the app (e.g. pm2 start src/index.js --name box-breaker)
   ```

After that, `.\deploy.ps1` from your local machine will push updates to GitHub and update the app on the VPS over SSH.

## Notes

- SQLite database is stored at `server/data/box_breakers.sqlite`.
- UI is a static site served by the server.
