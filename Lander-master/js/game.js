var ShipStates = {
  BASE: 0,
  LEFT_ROCKET: 1,
  RIGHT_ROCKET: 2,
  BOTTOM_RIGHT_ROCKET: 3,
  BOTTOM_LEFT_ROCKET: 4,
  EXPLOSION: 5,
  BOTTOM_ROCKET: 6,
  LANDED: 7
};

var GameStates = {
  PLAYING: 0,
  WIN: 1,
  LOSE: 2
};

var LanderGame = function() {
  this.neat = new neataptic.Neat(
    6, // 6 Inputs: Normalized x, y, vx, vy, deltaX to coleta, deltaY to coleta
    3, // 3 Outputs: Thrust left, right, bottom
    null,
    {
      mutation: neataptic.methods.mutation.ALL,
      popsize: 5000,
      mutationRate: 0.8,
      elitism: Math.round(0.2 * 5000),
      network: new neataptic.architect.Perceptron(6, 8, 3)
    }
  );
  this.rockets = [];
  this.coleta = { x: 0, y: 0, width: 64, height: 64 };
  this.initRockets();
  this.MAX_LANDING_SPEED = 3;
  this.frameCount = 0; // Frame counter for the 500 frames limit
};

LanderGame.prototype.initRockets = function() {
  this.rockets = this.neat.population.map(() => ({
    posX: this.CANVAS_WIDTH / 2,
    posY: 100,
    vx: 0,
    vy: 0,
    alive: true,
    score: 0,
    shipSpriteState: ShipStates.BASE
  }));
  this.resetColetaPosition();
};

LanderGame.prototype.load = function() {
  this.imgShipSprite = new Image();
  this.imgColeta = new Image();
  var self = this;
  this.imgShipSprite.addEventListener('load', function() {
    self.imgColeta.addEventListener('load', function() {
      self.init();
    });
    self.imgColeta.src = 'img/coleta.png';
  });
  this.imgShipSprite.src = 'img/ship_sprite.png';
};

LanderGame.prototype.init = function() {
  this.CANVAS_WIDTH = 1000;
  this.CANVAS_HEIGHT = 800;
  this.CUR_GRAVITY = -20;
  this.FPS = 60;
  this.PIXEL_RATIO = 5 / 1;
  this.terrainPositions = [];
  this.generateTerrain();
  this.canvas = document.getElementById('GameCanvas').getContext('2d');
  this.gameState = GameStates.PLAYING;
  this.startGeneration();
};

LanderGame.prototype.startGeneration = function() {
  this.initRockets();
  this.frameCount = 0; // Reset the frame counter
  var self = this;
  if (this.gameTimer) clearInterval(this.gameTimer);
  this.gameTimer = setInterval(function() {
    self.update();
    self.draw();
    if (++self.frameCount >= 500) { // Check if the frame limit is reached
      clearInterval(self.gameTimer);
      self.endGeneration(); // End the generation
    }
  }, 1000 / this.FPS);
};

LanderGame.prototype.generateTerrain = function() {
  for (var i = 0; i < 5; i++) {
    this.terrainPositions.push({ x: this.randomRange(i * 200, (i + 1) * 200), y: this.CANVAS_HEIGHT - 80, r: this.randomRange(70, 110) });
  }
};

LanderGame.prototype.draw = function() {
  this.canvas.clearRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
  this.canvas.fillStyle = 'gray';
  this.canvas.fillRect(0, this.CANVAS_HEIGHT - 100, this.CANVAS_WIDTH, 100);
  for (var i = 0; i < 5; i++) {
    this.drawCircle(this.terrainPositions[i]);
  }
  this.rockets.forEach((rocket, i) => {
    if (rocket.alive || rocket.shipSpriteState === ShipStates.LANDED) {
      this.drawRocket(rocket, i);
    }
  });
  this.canvas.drawImage(this.imgColeta, this.coleta.x, this.coleta.y, this.coleta.width, this.coleta.height);
  this.drawInfo();
};

LanderGame.prototype.drawRocket = function(rocket, index) {
  if (rocket.shipSpriteState === ShipStates.LANDED) {
    this.canvas.drawImage(this.imgShipSprite, 700, 0, 100, 92, rocket.posX - 50, rocket.posY - 46, 100, 92);
  } else {
    this.canvas.drawImage(this.imgShipSprite, rocket.shipSpriteState * 100, 0, 100, 92, rocket.posX - 50, rocket.posY - 46, 100, 92);
  }
};

LanderGame.prototype.update = function() {
  var allDead = true;
  this.rockets.forEach((rocket, i) => {
    if (!rocket.alive && rocket.shipSpriteState !== ShipStates.LANDED) return;
    allDead = false;
    if (rocket.alive) {
      this.updateRocket(rocket, this.neat.population[i]);
    }
  });
  if (allDead) {
    clearInterval(this.gameTimer);
    this.endGeneration();
  }
};

LanderGame.prototype.updateRocket = function(rocket, genome) {
  var inputs = [
    rocket.posX / this.CANVAS_WIDTH,
    rocket.posY / this.CANVAS_HEIGHT,
    rocket.vx / 10,
    rocket.vy / 10,
    (rocket.posX - (this.coleta.x + this.coleta.width / 2)) / this.CANVAS_WIDTH,
    (rocket.posY - (this.coleta.y + this.coleta.height / 2)) / this.CANVAS_HEIGHT
  ];
  
  var output = genome.activate(inputs);
  if (output[0] > 0.5) {
    rocket.vx -= 1.5;
    rocket.shipSpriteState = ShipStates.RIGHT_ROCKET;
  }
  if (output[1] > 0.5) {
    rocket.vx += 1.5;
    rocket.shipSpriteState = ShipStates.LEFT_ROCKET;
  }
  if (output[2] > 0.5) {
    rocket.vy -= 2;
    rocket.shipSpriteState = ShipStates.BOTTOM_ROCKET;
  }
  
  rocket.vy -= this.CUR_GRAVITY / this.FPS;
  rocket.posY += rocket.vy / this.PIXEL_RATIO;
  rocket.posX += rocket.vx / this.PIXEL_RATIO;

  if (rocket.posX < 0 || rocket.posX > this.CANVAS_WIDTH || rocket.posY < 0 || rocket.posY >= this.CANVAS_HEIGHT - 100) {
    rocket.alive = false;
    rocket.shipSpriteState = ShipStates.EXPLOSION;
  }

  this.collisionDetection(rocket);
};

LanderGame.prototype.collisionDetection = function(rocket) {
  for (var i = 0; i < this.terrainPositions.length; i++) {
    var d1 = Math.pow(this.terrainPositions[i].y - (rocket.posY - 3), 2) + Math.pow(this.terrainPositions[i].x - (rocket.posX - 20), 2);
    var d2 = Math.pow(this.terrainPositions[i].y - (rocket.posY - 3), 2) + Math.pow(this.terrainPositions[i].x - (rocket.posX + 20), 2);
    var r2 = Math.pow(this.terrainPositions[i].r, 2);
    if (d1 <= r2 || d2 <= r2) {
      rocket.shipSpriteState = ShipStates.EXPLOSION;
      rocket.alive = false;
    }
  }
};

LanderGame.prototype.drawCircle = function(data) {
  this.canvas.beginPath();
  this.canvas.arc(data.x, data.y, data.r, 0, 2 * Math.PI);
  this.canvas.fillStyle = 'gray';
  this.canvas.fill();
  this.canvas.strokeStyle = 'gray';
  this.canvas.stroke();
};

LanderGame.prototype.drawInfo = function() {
  this.canvas.fillStyle = 'white';
  this.canvas.font = '18px Arial';
  this.canvas.textAlign = 'left';
  this.canvas.fillText('Generation: ' + this.neat.generation, 20, 30);
  var maxFitness = Math.max(...this.neat.population.map(genome => genome.score));
  var avgFitness = this.neat.population.reduce((acc, genome) => acc + genome.score, 0) / this.neat.population.length;
  this.canvas.fillText('Max Fitness: ' + maxFitness.toFixed(2), 20, 60);
  this.canvas.fillText('Average Fitness: ' + avgFitness.toFixed(2), 20, 90);
  this.canvas.fillText('Alive: ' + this.rockets.filter(rocket => rocket.alive).length + '/' + this.neat.popsize, 20, 120);
};

LanderGame.prototype.endGeneration = function() {
  this.evaluateGeneration();
  this.neat.sort();
  var newPopulation = [];
  for (var i = 0; i < this.neat.elitism; i++) {
    newPopulation.push(this.neat.population[i]);
  }
  for (var i = 0; i < this.neat.popsize - this.neat.elitism; i++) {
    newPopulation.push(this.neat.getOffspring());
  }
  this.neat.population = newPopulation;
  this.neat.mutate();
  this.neat.generation++;
  console.log('Generation:', this.neat.generation, '- Best score:', this.neat.population[0].score.toFixed(2));
  this.startGeneration();
};

LanderGame.prototype.evaluateGeneration = function() {
  this.rockets.forEach((rocket, i) => {
    var score = this.calculateFitness(rocket);
    this.neat.population[i].score = score;
  });
};

LanderGame.prototype.calculateFitness = function(rocket) {
  var distToColeta = Math.sqrt(Math.pow((this.coleta.x + this.coleta.width / 2) - rocket.posX, 2) + Math.pow((this.coleta.y + this.coleta.height / 2) - rocket.posY, 2));
  var fitness = Math.max(0, 1000 - distToColeta); // Higher fitness for being closer to the coleta
  return fitness;
};

LanderGame.prototype.randomRange = function(min, max) {
  return Math.round(Math.random() * (max - min) + min);
};

LanderGame.prototype.resetColetaPosition = function() {
  this.coleta.x = this.randomRange(0, this.CANVAS_WIDTH - this.coleta.width);
  this.coleta.y = this.randomRange(0, 100);
};

window.onload = function() {
  var game = new LanderGame();
  game.load();
};