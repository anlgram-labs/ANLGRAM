# ANLGRAM Intelligence 🔍

> **Deanonymizing The Open Network** — Professional on-chain analytics platform for TON/GRAM blockchain, inspired by Arkham Intelligence.

![ANLGRAM Intelligence](https://img.shields.io/badge/Network-TON%20%2F%20GRAM-0088CC?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-1.0.0-00CFFF?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)

---

## 🚀 Features

| Module | Description |
|---|---|
| **📊 Dashboard** | Real-time metrics, large TX feed, network stats |
| **🔍 Entity Explorer** | Search wallets, identify entities, track balances |
| **🕸️ Flow Visualizer** | Interactive D3.js network graph of fund flows |
| **💰 Intel Exchange** | Bounty/auction marketplace for on-chain intelligence |
| **🔔 Alerts** | Custom alerts for whale movements and suspicious activity |

## 🌐 Live Preview & Production Deployment

* **Official Production App:** [https://anlgram-labs.github.io/ANLGRAM/](https://anlgram-labs.github.io/ANLGRAM/)
* **Flow Visualizer (Bubblemaps):** [https://anlgram-labs.github.io/ANLGRAM/visualizer.html](https://anlgram-labs.github.io/ANLGRAM/visualizer.html)
* **Local Preview:** Open `index.html` directly in any web browser.

## 📁 Project Structure

```
ANLGRAM/
├── index.html              # Landing page
├── dashboard.html          # Analytics dashboard
├── explorer.html           # Entity explorer
├── visualizer.html         # Flow visualizer
├── intel-exchange.html     # Intel Exchange marketplace
├── alerts.html             # Alerts system
├── assets/
│   ├── css/
│   │   ├── design-system.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   └── animations.css
│   └── js/
│       ├── app.js
│       ├── api.js
│       ├── charts.js
│       ├── visualizer.js
│       └── mock-data.js
└── README.md
```

## 🔧 APIs Used

- **TON API v2** — `https://tonapi.io/v2/`
- **TON Center API v3** — `https://toncenter.com/api/v3/`
- **CoinGecko** — GRAM price data
- **Mock Data** — Offline demo mode (no API key required)

## 🎨 Design System

- **Background**: `#0a0a0a` (near-black)
- **Cards**: `#161616` with `#262626` borders
- **Primary**: TON Blue `#0088CC`
- **Accent**: Cyan `#00CFFF`
- **Fonts**: Geist (headlines) · Inter (body) · JetBrains Mono (data)

## 📜 License

MIT © 2026 ANLGRAM Intelligence
