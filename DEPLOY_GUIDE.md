# 🚀 How to Deploy R_50 Signal Engine to GitHub Pages

## Complete Step-by-Step Guide (For Beginners)

---

## 📋 Prerequisites

You need these installed on your PC:

1. **Node.js** (v18 or higher) → Download from https://nodejs.org
2. **Git** → Download from https://git-scm.com
3. **A GitHub account** → Sign up at https://github.com

To check if they're installed, open **Command Prompt** (Windows) or **Terminal** (Mac) and type:
```
node --version
git --version
```

---

## 📁 STEP 1: Extract the ZIP File

1. Find the downloaded ZIP file on your PC
2. Right-click → **Extract All**
3. Remember the folder location (e.g., `C:\Users\YourName\Downloads\r50-signal-engine`)

---

## 💻 STEP 2: Open Terminal in the Project Folder

### Windows:
1. Open the extracted folder in **File Explorer**
2. Click the **address bar** at the top
3. Type `cmd` and press **Enter**

### Mac:
1. Open **Terminal**
2. Type `cd ` (with a space), then drag the folder into Terminal
3. Press **Enter**

---

## 📦 STEP 3: Install Dependencies & Test Build

Run these commands one by one:

```bash
npm install
```
Wait for it to finish (may take 1-2 minutes), then:

```bash
npm run build
```

You should see a success message. This creates a `dist` folder with your website.

To test locally:
```bash
npm run preview
```
Open the URL shown (usually http://localhost:4173) in your browser to verify it works!

---

## 🌐 STEP 4: Create a GitHub Repository

1. Go to https://github.com
2. Click the **+** icon (top right) → **New repository**
3. Fill in:
   - **Repository name**: `r50-signal-engine` (or any name you want)
   - **Description**: `R_50 Rise/Fall Signal Engine for Deriv Binary Options`
   - **Public** (must be public for free GitHub Pages)
   - ❌ Do NOT check "Add a README file"
   - ❌ Do NOT add .gitignore
   - ❌ Do NOT add a license
4. Click **Create repository**
5. You'll see a page with instructions — keep this page open!

---

## 📤 STEP 5: Push Your Code to GitHub

Go back to your **terminal** (still in the project folder) and run these commands **one by one**:

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Initial commit - R50 Signal Engine"
```

```bash
git branch -M main
```

Now connect to your GitHub repository. **Replace `YOUR_USERNAME`** with your actual GitHub username:

```bash
git remote add origin https://github.com/YOUR_USERNAME/r50-signal-engine.git
```

Then push:

```bash
git push -u origin main
```

> 💡 If asked for credentials, enter your GitHub username and a **Personal Access Token** (not your password).
> To create a token: GitHub → Settings → Developer Settings → Personal Access Tokens → Generate New Token → check "repo" → Generate

---

## 🌍 STEP 6: Deploy to GitHub Pages (Automatic Method)

### Option A: Using GitHub Actions (Recommended - Auto-deploys!)

The project already includes a GitHub Actions workflow file. After pushing:

1. Go to your repository on GitHub: `https://github.com/YOUR_USERNAME/r50-signal-engine`
2. Click **Settings** tab (top bar)
3. Click **Pages** (left sidebar, under "Code and automation")
4. Under **Source**, select **GitHub Actions**
5. That's it! The workflow will run automatically.

Wait 2-3 minutes, then visit:
```
https://YOUR_USERNAME.github.io/r50-signal-engine/
```

### Option B: Manual Deploy from dist folder

If Option A doesn't work:

1. Go to **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Select **gh-pages** branch, **/ (root)** folder
4. Click **Save**

Then in your terminal, run:
```bash
npm run deploy
```

Wait 2-3 minutes, then visit:
```
https://YOUR_USERNAME.github.io/r50-signal-engine/
```

---

## ✅ STEP 7: Verify Your Site is Live!

1. Open your browser
2. Go to: `https://YOUR_USERNAME.github.io/r50-signal-engine/`
3. You should see the signal engine loading and connecting to Deriv!

---

## 🔄 How to Update Your Site Later

Whenever you want to update:

```bash
git add .
git commit -m "Updated signal engine"
git push
```

If using Option A (GitHub Actions), it auto-deploys in ~2 minutes.
If using Option B, also run `npm run deploy`.

---

## ❓ Troubleshooting

### "Page not found" (404)
- Wait 5 minutes — GitHub Pages can take time
- Check Settings → Pages → make sure it shows a URL
- Make sure repository is **Public**

### "Permission denied" when pushing
- Use a Personal Access Token instead of password
- GitHub → Settings → Developer Settings → Personal Access Tokens

### Build fails
- Make sure Node.js v18+ is installed: `node --version`
- Delete `node_modules` folder and run `npm install` again

### Blank page after deploy
- Check browser console (F12) for errors
- Make sure the `base` in vite.config.ts matches your repo name

### WebSocket not connecting
- This is normal on first load — wait a few seconds
- The engine auto-reconnects every few seconds
- Check if your network blocks WebSocket connections

---

## 📱 Access From Phone

Once deployed, you can open the same URL on your phone browser!
Bookmark it for quick access anytime.

---

## 🎉 Done!

Your R_50 Signal Engine is now live 24/7 at:
```
https://YOUR_USERNAME.github.io/r50-signal-engine/
```

Bookmark this URL and access it anytime from any device!
