# Deploy guide: Local → GitHub → Hostinger VPS (app.cardgems.com)

This guide walks you through setting up **one-command deployment** from your Windows PC to your Hostinger VPS so that running `.\deploy.ps1` commits your changes, pushes to GitHub, and updates the live app at **https://app.cardgems.com**.

---

## What you need before starting

- [ ] **Git** installed on your Windows PC ([git-scm.com](https://git-scm.com))
- [ ] **PowerShell** (built into Windows 10/11)
- [ ] **Hostinger VPS** with your domain (e.g. app.cardgems.com) pointed to it
- [ ] **GitHub** account and this repo pushed to GitHub (e.g. `https://github.com/YOUR_USERNAME/box-breaker-app`)
- [ ] **SSH access** to the VPS (Hostinger gives you an IP and root/user + password)

---

## Part 1: First-time setup on the VPS

You only do this once. Goal: get the app running on the server and keep it running with **pm2**.

### Step 1.1: Log in to your VPS

**Option A – Hostinger panel (easiest the first time)**

1. Log in to [Hostinger](https://www.hostinger.com) → **VPS** → your VPS.
2. Open **SSH Access** or **Web Terminal**.
3. You get a terminal in the browser. Use the username and password Hostinger shows (often `root`).

**Option B – PowerShell on your PC**

1. Open **PowerShell**.
2. Run (replace with your VPS IP and user from Hostinger):

   ```powershell
   ssh root@YOUR_VPS_IP
   ```

3. Enter the VPS password when asked. You are now on the server.

---

### Step 1.2: Install Node.js on the VPS

On the VPS terminal, run:

```bash
# Update packages (Ubuntu/Debian)
apt update && apt upgrade -y

# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Check
node -v
npm -v
```

You should see version numbers (e.g. `v20.x.x` and `10.x.x`).

---

### Step 1.3: Install Git on the VPS (if needed)

```bash
apt install -y git
git --version
```

---

### Step 1.4: Clone the repo on the VPS

Pick a folder where the app will live. Common choice: your user’s home.

```bash
cd ~
git clone https://github.com/YOUR_GITHUB_USERNAME/box-breaker-app.git
cd box-breaker-app
```

Replace `YOUR_GITHUB_USERNAME` with your GitHub username (or org). If the repo is private, you’ll need to set up SSH keys or a token on the VPS for `git pull` to work later.

---

### Step 1.5: Install app dependencies and create data folder

```bash
cd ~/box-breaker-app/server
npm install --production
mkdir -p data
```

The app uses `server/data/` for the SQLite database. Create a `.env` file here if you use one (WooCommerce, Google, etc.):

```bash
nano .env
```

Add your variables (example):

```
PORT=3000
WOOCOMMERCE_URL=https://yoursite.com
WOOCOMMERCE_KEY=...
WOOCOMMERCE_SECRET=...
```

Save (Ctrl+O, Enter) and exit (Ctrl+X).

---

### Step 1.6: Install pm2 and start the app

**pm2** keeps the Node app running and restarts it after deploy.

```bash
npm install -g pm2
cd ~/box-breaker-app/server
pm2 start src/index.js --name box-breaker
pm2 save
pm2 startup
```

`pm2 startup` prints a command (e.g. `sudo env PATH=... pm2 startup systemd ...`). **Run that command** so the app starts again after a server reboot.

Check:

```bash
pm2 status
pm2 logs box-breaker
```

You should see the app listening (e.g. on port 3000). Note the **full path** to the project (e.g. `/root/box-breaker-app` or `/home/ubuntu/box-breaker-app`). You’ll need it for the deploy config.

---

### Step 1.7: Point the domain to the VPS (if not already)

1. In Hostinger: **Domains** → your domain (e.g. cardgems.com) → **DNS / Nameservers**.
2. Add an **A record**: host `app` (or subdomain you use), value = your **VPS IP**.
3. Wait for DNS to propagate (minutes to hours).
4. On the VPS, the app listens on port 3000. Use either:
   - **Nginx** as reverse proxy (recommended): Nginx listens on 80/443 and forwards to `localhost:3000`, or  
   - Hostinger’s “Open port” or similar so port 3000 is public (simpler but less flexible).

If you use Nginx, a minimal config for app.cardgems.com could look like:

```nginx
server {
    listen 80;
    server_name app.cardgems.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then `sudo certbot --nginx` (or Hostinger SSL) for HTTPS.

Once this is done, **https://app.cardgems.com** should open your app.

---

## Part 2: One-time setup on your Windows PC

Goal: so that **one command** from your project folder pushes code and updates the VPS over SSH without typing a password.

### Step 2.1: Generate an SSH key (Windows)

1. Open **PowerShell** (not necessarily in the project folder).
2. Create a key (no passphrase so deploy can run non-interactively):

   ```powershell
   ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519" -N '""'
   ```

   If it says “already exists”, you can use the existing key or pick another path.

3. Display your **public** key so you can copy it:

   ```powershell
   Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"
   ```

4. **Copy the whole line** (starts with `ssh-ed25519` and ends with your email or machine name). You’ll paste it on the VPS next.

---

### Step 2.2: Add the SSH key to the VPS

1. **SSH into the VPS** (Hostinger terminal or PowerShell: `ssh root@YOUR_VPS_IP`).
2. Create the SSH directory and set permissions:

   ```bash
   mkdir -p ~/.ssh
   chmod 700 ~/.ssh
   ```

3. Add your public key (paste the line you copied **once**, as a single line):

   ```bash
   echo "ssh-ed25519 AAAA... your@email" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

   Replace the part in quotes with your **actual** public key line.

4. Optional: disable password login for security (only after you’ve confirmed key login works):

   ```bash
   nano /etc/ssh/sshd_config
   # Set: PasswordAuthentication no
   systemctl restart sshd
   ```

5. From **PowerShell on your PC**, test (use your user and IP):

   ```powershell
   ssh root@YOUR_VPS_IP
   ```

   You should get a shell **without** being asked for a password. Type `exit` to close.

---

### Step 2.3: Create the deploy config (Windows)

1. Open **PowerShell** and go to your project folder:

   ```powershell
   cd C:\Users\Sande\box-breaker-app
   ```

   (Use the real path where `box-breaker-app` lives.)

2. Copy the example config:

   ```powershell
   Copy-Item deploy-config.ps1.example deploy-config.ps1
   ```

3. Edit the config:

   ```powershell
   notepad deploy-config.ps1
   ```

4. Set these to **your** values:

   | Variable | Example | What to use |
   |----------|--------|-------------|
   | **DeployUser** | `root` | SSH user (often `root` on Hostinger VPS) |
   | **DeployHost** | `123.45.67.89` or `vps123.hostinger.com` | VPS IP or hostname from Hostinger |
   | **DeployPath** | `/root/box-breaker-app` | **Exact** path where you ran `git clone` (from Step 1.4) |

   If you don’t use pm2 or use a different app name:

   ```powershell
   $DeployRestartCommand = "pm2 restart box-breaker"
   ```

   Change the right-hand side to your restart command (e.g. `sudo systemctl restart box-breaker`).

5. Save and close. **Do not** commit `deploy-config.ps1` to Git (it’s in `.gitignore`).

---

## Part 3: Deploying updates (every time)

Once Part 1 and Part 2 are done, this is all you do to push updates from your PC to the live app.

### Step 3.1: Make your changes

Edit code in your project as usual (e.g. in Cursor). You don’t need to commit manually; the deploy script will do it.

### Step 3.2: Run the deploy script

1. Open **PowerShell**.
2. Go to the project folder:

   ```powershell
   cd C:\Users\Sande\box-breaker-app
   ```

3. Run:

   ```powershell
   .\deploy.ps1
   ```

   Or with a custom commit message:

   ```powershell
   .\deploy.ps1 "Add new feature and fix bug"
   ```

### Step 3.3: What the script does

1. **Commit** – Stages all changes and creates a commit (message: “Deploy updates” or the one you passed).
2. **Push** – Pushes to `origin main` on GitHub.
3. **SSH** – Connects to your VPS with the key you set up.
4. **On the VPS** it runs:
   - `cd YOUR_DeployPath`
   - `git pull origin main`
   - `cd server && npm install --production`
   - `pm2 restart box-breaker` (or your `DeployRestartCommand`)

If everything is set up correctly, you’ll see something like:

```
Pushed.
Updating VPS at root@123.45.67.89...
Done. App: https://app.cardgems.com
```

Then open **https://app.cardgems.com** and your updates should be live.

---

## Troubleshooting

### “Missing deploy-config.ps1”

- Run `Copy-Item deploy-config.ps1.example deploy-config.ps1` in the project folder and edit `deploy-config.ps1` with your VPS details.

### “Permission denied (publickey)” when running deploy

- Your SSH key isn’t on the VPS or the path/user is wrong.  
- Check: `Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub` and make sure that **exact** line is in `~/.ssh/authorized_keys` on the VPS (one line, no extra spaces).  
- Test: `ssh DeployUser@DeployHost` from PowerShell (using the same user/host as in `deploy-config.ps1`).

### “git pull” on VPS fails (e.g. private repo)

- If the repo is private, the VPS needs to authenticate to GitHub:
  - **Option A:** Use a **Deploy Key** (SSH key added to the repo under Settings → Deploy keys). Generate a key on the VPS, add the public part to GitHub, use the private key for `git pull` on the VPS.
  - **Option B:** Use a **Personal Access Token** and change the remote to `https://TOKEN@github.com/USER/box-breaker-app.git` (store the token safely on the VPS).

### “pm2: command not found” on the VPS

- Install pm2 globally: `npm install -g pm2`, or in `deploy-config.ps1` set `$DeployRestartCommand` to the full path to pm2 (e.g. `/usr/bin/pm2 restart box-breaker`) or to whatever you use to start the app (e.g. `node server/src/index.js` in a screen/tmux).

### Deploy runs but the site doesn’t change

- Confirm the **DeployPath** is the same folder where the app runs and where you ran `git clone`.  
- SSH in and run `cd DeployPath && git status && git log -1` to see if the latest commit is there.  
- Check `pm2 logs box-breaker` to see if the app restarted and if there are errors.

### Script execution disabled (PowerShell)

If you get “cannot be loaded because running scripts is disabled”:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then run `.\deploy.ps1` again.

---

## Quick reference

| Step | Where | Action |
|------|--------|--------|
| One-time | VPS | Install Node, Git; clone repo; `npm install` in `server`; pm2 start; set domain/DNS. |
| One-time | PC | Generate SSH key; add public key to VPS `~/.ssh/authorized_keys`. |
| One-time | PC | Copy `deploy-config.ps1.example` → `deploy-config.ps1`; set DeployUser, DeployHost, DeployPath. |
| Every deploy | PC | `cd box-breaker-app` → `.\deploy.ps1` or `.\deploy.ps1 "Message"`. |

---

For more details on the app itself (local run, env vars, database), see the main [README.md](README.md).
