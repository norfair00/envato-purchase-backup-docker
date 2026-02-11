# Envato Purchase Backup Docker

An automated Node.js script to back up your Envato purchases to Cloudflare R2 (S3-compatible storage) with version tracking via Cloudflare D1 (SQLite-based).

## Description

This project downloads all your purchases from Envato Market and stores them in a Cloudflare R2 bucket. It uses a Cloudflare D1 database to track versions and prevent unnecessary re-downloads. After the first run, only updated items are downloaded.

## Features

- Automatic download of all your Envato purchases
- Upload to Cloudflare R2 (S3-compatible storage)
- Version tracking with Cloudflare D1
- Automatic update detection
- Configurable concurrent downloads
- Colorful, readable logs
- Automatic cleanup of temporary files

## Installation

### Prerequisites

- Node.js (v16 or higher recommended)
- An Envato Market account with purchases
- A Cloudflare account with R2 and D1 enabled

### Install dependencies

```bash
npm install
```

## Configuration

### 1) Environment variables

Create a `.env` file at the project root:

```env
CONCURRENCY=1

ENVATO_PERSONAL_TOKEN=

CF_API_KEY=
CF_D1_ID=
CF_D1_TABLE=purchases
CF_ACCOUNT_ID=

R2_ENDPOINT=https://$CF_ACCOUNT_ID.eu.r2.cloudflarestorage.com
R2_ACCESS_KEY=
R2_SECRET_KEY=

R2_BUCKET=envato-purchase
```

**Notes:**
- `CONCURRENCY` controls how many downloads are processed simultaneously
- `DISCORD_WEBHOOK_URL` (Optional) can be used to receive notifications on Discord
- Do not commit your `.env` file; it contains sensitive credentials