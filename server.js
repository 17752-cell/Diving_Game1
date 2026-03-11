const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.static(__dirname));

// generate a new room ID and redirect to it
app.get('/new', (req, res) => {
    // simple random 6-character alphanumeric identifier
    const roomId = Math.random().toString(36).substring(2, 8);
    res.redirect(`/?room=${roomId}`);
});

// shortened link format for manual typing: /r/ABC123 -> ?room=ABC123
app.get('/r/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    res.redirect(`/?room=${encodeURIComponent(roomId)}`);
});

const PORT = process.env.PORT || 3000;

// Rooms state keyed by room name/ID
const rooms = {};

// Game configuration (shared)
const GAME_WIDTH = 2000;
const GAME_HEIGHT = 1500;
const PLAYER_BASE_SPEED = 3;

// helper to create a room if it doesn't exist
function createRoom(roomId) {
    if (rooms[roomId]) return rooms[roomId];

    const room = {
        players: {},
        food: {},
        foodId: 0,
        updateCounter: 0,
        interval: null
    };

    // spawn some initial food for the room
    function spawnFood() {
        for (let i = 0; i < 30; i++) {
            const foodItem = {
                id: room.foodId++,
                x: Math.random() * (GAME_WIDTH - 20) + 10,
                y: Math.random() * (GAME_HEIGHT - 20) + 10
            };
            room.food[foodItem.id] = foodItem;
            io.to(roomId).emit('foodSpawned', foodItem);
        }
    }

    // game loop for the room
    room.interval = setInterval(() => {
        Object.values(room.players).forEach(player => {
            // movement
            const speed = PLAYER_BASE_SPEED / (1 + player.size / 20);
            const finalSpeed = player.boost ? speed * 2 : speed;
            player.x += player.vx * finalSpeed;
            player.y += player.vy * finalSpeed;

            player.x = Math.max(20, Math.min(GAME_WIDTH - 20, player.x));
            player.y = Math.max(20, Math.min(GAME_HEIGHT - 20, player.y));

            // boost cost: 2 points per second
            if (player.boost) {
                player.boostCounter++;
                if (player.boostCounter >= 20) { // 50ms * 20 = 1 second
                    player.score = Math.max(0, player.score - 2);
                    player.boostCounter = 0;
                }
            } else {
                player.boostCounter = 0;
            }

            // eat food like before
            Object.keys(room.food).forEach(fId => {
                const f = room.food[fId];
                const dist = Math.hypot(player.x - f.x, player.y - f.y);
                if (dist < player.size) {
                    player.score += 1;
                    player.size += 0.5;
                    delete room.food[fId];
                    io.to(roomId).emit('foodEaten', fId);

                    const newFood = {
                        id: room.foodId++,
                        x: Math.random() * (GAME_WIDTH - 20) + 10,
                        y: Math.random() * (GAME_HEIGHT - 20) + 10
                    };
                    room.food[newFood.id] = newFood;
                    io.to(roomId).emit('foodSpawned', newFood);
                }
            });
        });

        // player-player interactions: bigger eats smaller
        const playersArray = Object.values(room.players);
        for (let i = 0; i < playersArray.length; i++) {
            for (let j = 0; j < playersArray.length; j++) {
                if (i === j) continue;
                const eater = playersArray[i];
                const eaten = playersArray[j];

                // only consider if eater is larger
                if (eater.size <= eaten.size) continue;

                const dist = Math.hypot(eater.x - eaten.x, eater.y - eaten.y);
                if (dist < eater.size) {
                    // consume the smaller player
                    eater.score += eaten.score; // take their points
                    eater.size += eaten.size * 0.5; // grow a fraction of their size

                    // respawn the eaten player with base stats
                    eaten.x = Math.random() * (GAME_WIDTH - 100) + 50;
                    eaten.y = Math.random() * (GAME_HEIGHT - 100) + 50;
                    eaten.size = 10;
                    eaten.score = 0;

                    // notify clients for any visual effects
                    io.to(roomId).emit('playerEaten', { eaterId: eater.id, eatenId: eaten.id });
                }
            }
        }

        // send updates
        room.updateCounter++;
        Object.values(room.players).forEach(player => {
            io.to(roomId).emit('playerUpdate', {
                id: player.id,
                x: player.x,
                y: player.y,
                size: player.size,
                score: player.score
            });
        });

        if (room.updateCounter % 10 === 0) {
            io.to(roomId).emit('leaderboard', getLeaderboard(roomId));
        }
    }, 50);

    spawnFood();
    rooms[roomId] = room;
    return room;
}

function getLeaderboard(roomId) {
    const room = rooms[roomId];
    return Object.values(room.players)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(p => ({ name: p.name || p.id, score: p.score }));
}


io.on('connection', (socket) => {
    const roomId = socket.handshake.query.room || 'lobby';
    socket.join(roomId);
    console.log('New player connected:', socket.id, 'room=', roomId);

    const room = createRoom(roomId);

    // Initialize new player
    const newPlayer = {
        id: socket.id,
        name: socket.handshake.query.name || socket.id,
        x: Math.random() * (GAME_WIDTH - 100) + 50,
        y: Math.random() * (GAME_HEIGHT - 100) + 50,
        vx: 0,
        vy: 0,
        size: 10,
        score: 0,
        color: `0x${Math.floor(Math.random()*16777215).toString(16)}`,
        boost: false,
        boostCounter: 0
    };

    room.players[socket.id] = newPlayer;

    // Send game state to new player
    socket.emit('gameState', { players: room.players, food: room.food });

    // Notify others in room
    socket.to(roomId).emit('playerJoined', newPlayer);

    socket.on('playerMove', (data) => {
        if (room.players[socket.id]) {
            room.players[socket.id].vx = data.moveX;
            room.players[socket.id].vy = data.moveY;
            room.players[socket.id].boost = data.boost && room.players[socket.id].score >= 2; // only allow if enough score
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id, 'room=', roomId);
        delete room.players[socket.id];
        io.to(roomId).emit('playerLeft', socket.id);
        // optionally cleanup room when empty
        if (Object.keys(room.players).length === 0) {
            clearInterval(room.interval);
            delete rooms[roomId];
        }
    });
});


server.listen(PORT, () => {
    console.log(`🎮 Dive.io Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});