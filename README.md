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
- App runs on a **VPS**; the domain points to that server.

### Deploying updates

1. **Push from your machine:** commit and push to GitHub (see below).
2. **On the VPS:** SSH in, go to the project folder, pull, then restart the app.

   ```bash
   cd /path/to/box-breaker-app   # your project path on the VPS
   git pull
   cd server && npm install      # if dependencies changed
   # Restart the app (example with pm2):
   pm2 restart box-breaker
   # Or if you run it with node directly, stop it and run: node src/index.js
   ```

## Notes

- SQLite database is stored at `server/data/box_breakers.sqlite`.
- UI is a static site served by the server.
