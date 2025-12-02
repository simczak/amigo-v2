# Amigo Secreto (Fresh Start)

A modern Secret Santa application powered by Supabase.

## Features

- **Friendly URLs**: Shareable links like `app.com/?id=my-group`.
- **Secure**: Results are stored in Supabase with Row Level Security.
- **No Legacy Code**: Clean codebase without backward compatibility for base64 links.
- **Redraw Support**: Easily redraw if someone can't participate.

## Setup

### 1. Database (Supabase)

1.  Create a new Supabase project.
2.  Go to the **SQL Editor**.
3.  Run the contents of `schema_v2.sql` to create the table and policies.
4.  Go to **Project Settings -> API**.
5.  Copy `Project URL` and `anon public` key.
6.  Update `config.js` (or create it) with your credentials:

```javascript
const CONFIG = {
    SUPABASE_URL: 'YOUR_SUPABASE_URL',
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY'
};
```

### 2. GitHub Initialization

To push this project to a new GitHub repository:

```bash
# 1. Initialize Git
git init

# 2. Add files
git add .

# 3. Commit
git commit -m "Initial commit: Fresh start with Supabase V2 schema"

# 4. Rename branch to main
git branch -M main

# 5. Add remote (Replace URL with your new repo URL)
git remote add origin https://github.com/YOUR_USERNAME/NEW_REPO_NAME.git

# 6. Push
git push -u origin main
```

## Running Locally

```bash
# Install dependencies (if any, mostly for tests)
npm install

# Run with a local server (e.g., Live Server or Python)
# python -m http.server 3000
```
