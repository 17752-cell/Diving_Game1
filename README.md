# Dive.io – Multiplayer Cave Diving Game

A simple browser-based multiplayer game built with Phaser.js and Socket.io. Players move around a cave, eat food to grow, and compete for the highest score.

## Features

- ✅ **Real-time multiplayer** (all players in a room share the same world)
- 🌐 **Room support** – generate a unique link and share with friends
- 🎯 **Leaderboard** – top 5 players displayed every few seconds
- 🧭 **Arrow indicators** – off‑screen players are pointed to by arrows on the edge of your view
- 🎮 **Minimal controls** – WASD to move, just dive and eat!

## How to Play

1. Run the server (`npm start`) and open the game URL in a browser.
2. Use the info panel to:
   - **Create New Room** – generates a fresh URL automatically.
   - **Copy the link** (full or short) and send it to a friend.
   - Or manually type a room code and name in the input fields, then click **Join**.
   - The panel can be collapsed via the ❯/❮ button when you want more screen space.
3. When someone opens the shared URL (or `/r/ROOM`), they join the same room instantly – no login required.
4. Entering a display name (6 chars max) is optional but makes it easier to spot you on the leaderboard.

> Tip: you can also manually visit `http://host/r/ROOMID` for a short URL that's easy to type.

## Game Mechanics

- Each player starts small and grows by eating food.
- **New:** bigger divers can now eat smaller players on contact – when you consume another player you absorb their score and gain size, and the victim respawns smaller elsewhere.
- Larger players move slower; avoid bigger divers and gobble up food.
- Score increases with every food item eaten.
- Leaderboard updates every half-second.

## Installation & Setup

```bash
npm install
npm start
```

Then open http://localhost:3000 (or the shareable room link) in your browser.

## Technical Stack

- **Frontend**: Phaser 3.60.0
- **Backend**: Node.js + Express
- **Networking**: Socket.io
- **Styling**: Simple CSS UI
