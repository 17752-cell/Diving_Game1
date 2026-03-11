class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
    }

    preload() {
        // Assets loaded via shapes
    }

    create() {
        // Connect to server
        this.socket = io();

        // Game state
        this.players = {};
        this.food = {};
        this.playersSprites = {};
        this.foodSprites = {};
        this.nameTags = {};
        this.sizeTags = {};

        // arrows pointing toward off-screen players
        this.arrows = {};

        // Player data
        this.myPlayerId = null;
        this.myScore = 0;
        this.mySize = 10;
        this.myX = 0;
        this.myY = 0;

        // Create cave background (dark blue)
        this.bg = this.add.rectangle(1000, 750, 2000, 1500, 0x000033);

        // Create cave walls
        this.add.rectangle(50, 750, 20, 1500, 0x333333);
        this.add.rectangle(1950, 750, 20, 1500, 0x333333);
        this.add.rectangle(1000, 50, 2000, 20, 0x333333);
        this.add.rectangle(1000, 1450, 2000, 20, 0x333333);

        // Input - WASD keys
        this.keys = this.input.keyboard.addKeys({
            w: Phaser.Input.Keyboard.KeyCodes.W,
            a: Phaser.Input.Keyboard.KeyCodes.A,
            s: Phaser.Input.Keyboard.KeyCodes.S,
            d: Phaser.Input.Keyboard.KeyCodes.D,
            b: Phaser.Input.Keyboard.KeyCodes.B
        });

        // Set up game world bounds
        this.physics.world.setBounds(0, 0, 2000, 1500);

        // Set camera bounds to match world
        this.cameras.main.setBounds(0, 0, 2000, 1500);

        // UI Elements
        this.scoreText = this.add.text(10, 10, 'Score: 0', {
            fontSize: '16px',
            fill: '#ffff00',
            fontStyle: 'bold'
        }).setScrollFactor(0);

        this.leaderboardText = this.add.text(790, 10, '', {
            fontSize: '12px',
            fill: '#00ff00',
            align: 'right',
            fontFamily: 'monospace'
        }).setOrigin(1, 0).setScrollFactor(0);

        this.playerCountText = this.add.text(400, 570, 'Players: 0', {
            fontSize: '14px',
            fill: '#ffffff',
            align: 'center'
        }).setOrigin(0.5, 1).setScrollFactor(0);

        // Socket events
        this.socket.on('connect', () => {
            this.myPlayerId = this.socket.id;
            console.log('✓ Connected:', this.myPlayerId);
        });

        this.socket.on('gameState', (data) => {
            this.players = data.players;
            this.food = data.food;
            this.initializeGameDisplay();
        });

        this.socket.on('playerJoined', (data) => {
            if (!this.playersSprites[data.id]) {
                this.createPlayerSprite(data);
            }
            this.players[data.id] = data;
        });

        this.socket.on('playerUpdate', (data) => {
            if (data.id === this.myPlayerId) {
                this.myScore = data.score;
                this.mySize = data.size;
                this.myX = data.x;
                this.myY = data.y;
                this.scoreText.setText(`Score: ${Math.ceil(this.myScore)}`);
            }

            if (this.playersSprites[data.id]) {
                this.playersSprites[data.id].x = data.x;
                this.playersSprites[data.id].y = data.y;
                this.playersSprites[data.id].setScale(data.size / 10);

                if (this.nameTags[data.id]) {
                    this.nameTags[data.id].x = data.x;
                    this.nameTags[data.id].y = data.y - data.size - 10;
                }
                if (this.sizeTags[data.id]) {
                    this.sizeTags[data.id].x = data.x;
                    this.sizeTags[data.id].y = data.y + data.size + 5;
                    this.sizeTags[data.id].setText(Math.ceil(data.size));
                }
            }
        });

        this.socket.on('foodSpawned', (foodData) => {
            this.food[foodData.id] = foodData;
            this.createFoodSprite(foodData);
        });

        this.socket.on('foodEaten', (foodId) => {
            if (this.foodSprites[foodId]) {
                this.foodSprites[foodId].destroy();
                delete this.foodSprites[foodId];
            }
            delete this.food[foodId];
        });

        this.socket.on('playerLeft', (playerId) => {
            if (this.playersSprites[playerId]) {
                this.playersSprites[playerId].destroy();
                delete this.playersSprites[playerId];
            }
            if (this.nameTags[playerId]) {
                this.nameTags[playerId].destroy();
                delete this.nameTags[playerId];
            }
            if (this.sizeTags[playerId]) {
                this.sizeTags[playerId].destroy();
                delete this.sizeTags[playerId];
            }
            if (this.arrows[playerId]) {
                this.arrows[playerId].destroy();
                delete this.arrows[playerId];
            }
            delete this.players[playerId];
        });

        this.socket.on('leaderboard', (data) => {
            let leaderboardStr = '🏆 TOP\\n';
            data.forEach((player, idx) => {
                leaderboardStr += `${idx + 1}. ${player.name.slice(0, 6)}: ${Math.ceil(player.score)}\\n`;
            });
            this.leaderboardText.setText(leaderboardStr);
        });

        // another player has eaten someone (or you were eaten)
        this.socket.on('playerEaten', ({ eaterId, eatenId }) => {
            // flash the eaten player briefly
            if (this.playersSprites[eatenId]) {
                this.tweens.add({
                    targets: this.playersSprites[eatenId],
                    alpha: 0,
                    yoyo: true,
                    duration: 150,
                    repeat: 3
                });
            }

            // optional: if we were the eater, let scoreText update already shows new score
            if (eaterId === this.myPlayerId) {
                // could add a quick +number popup later
                console.log('You ate', eatenId);
            }
        });
    }

    initializeGameDisplay() {
        // Create all player sprites including yourself
        Object.values(this.players).forEach(player => {
            if (!this.playersSprites[player.id]) {
                this.createPlayerSprite(player);
            }
        });

        // Create all food
        Object.values(this.food).forEach(f => {
            if (!this.foodSprites[f.id]) {
                this.createFoodSprite(f);
            }
        });
    }

    // create or return existing arrow object for id
    createArrow(id) {
        const arrow = this.add.triangle(0, 0,
            0, -10,
            5, 0,
            -5, 0,
            0xffffff
        )
        .setOrigin(0.5)
        .setScrollFactor(0);
        this.arrows[id] = arrow;
        return arrow;
    }

    createPlayerSprite(player) {
        const color = parseInt(player.color) || 0x00ff00;
        const size = player.size || 10;
        const circle = this.add.circle(player.x, player.y, size, color);
        circle.setStrokeStyle(2, 0xffffff);

        this.playersSprites[player.id] = circle;

        // Name tag (use supplied name if available)
        const display = player.name ? player.name.slice(0, 6) : player.id.slice(0, 6);
        const nameTag = this.add.text(player.x, player.y - size - 10, display, {
            fontSize: '10px',
            fill: '#ffffff',
            align: 'center',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.nameTags[player.id] = nameTag;

        // Size tag
        const sizeTag = this.add.text(player.x, player.y + size + 5, Math.ceil(size), {
            fontSize: '10px',
            fill: '#00ff00',
            align: 'center',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.sizeTags[player.id] = sizeTag;
    }

    createFoodSprite(foodData) {
        const circle = this.add.circle(foodData.x, foodData.y, 3, 0xff6600);
        circle.setStrokeStyle(1, 0xffaa00);
        this.foodSprites[foodData.id] = circle;
    }

    update() {
        if (!this.myPlayerId) return; // Wait for connection

        // Get movement input - WASD
        let moveX = 0;
        let moveY = 0;

        if (this.keys.a.isDown) {
            moveX = -1;
        }
        if (this.keys.d.isDown) {
            moveX = 1;
        }
        if (this.keys.w.isDown) {
            moveY = -1;
        }
        if (this.keys.s.isDown) {
            moveY = 1;
        }

        // Send movement to server
        if (moveX !== 0 || moveY !== 0) {
            this.socket.emit('playerMove', {
                moveX: moveX,
                moveY: moveY
            });
        } else {
            // Send stop
            this.socket.emit('playerMove', {
                moveX: 0,
                moveY: 0
            });
        }

        // Update player count
        this.playerCountText.setText(`Players: ${Object.keys(this.playersSprites).length}`);

        // Camera follows player
        this.cameras.main.centerOn(this.myX, this.myY);

        // draw arrows for off-screen players
        const cam = this.cameras.main;
        const halfW = cam.width / 2;
        const halfH = cam.height / 2;
        Object.values(this.players).forEach(player => {
            if (player.id === this.myPlayerId) return;
            const dx = player.x - this.myX;
            const dy = player.y - this.myY;
            const arrow = this.arrows[player.id] || this.createArrow(player.id);
            if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) {
                arrow.setVisible(false);
            } else {
                arrow.setVisible(true);
                const angle = Math.atan2(dy, dx);
                // place along screen edge based on angle
                const sx = halfW + Math.cos(angle) * halfW;
                const sy = halfH + Math.sin(angle) * halfH;
                arrow.x = cam.scrollX + sx;
                arrow.y = cam.scrollY + sy;
                arrow.rotation = angle + Math.PI/2; // adjust to point inward
            }
        });
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: GameScene
};

const game = new Phaser.Game(config);