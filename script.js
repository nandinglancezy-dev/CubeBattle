
const SERVER_URL = "https://YOUR-SERVER.onrender.com";

const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"]
});

let roomId = "";
let playerName = "";
let isHost = false;
let gameStarted = false;
let moves = 0;
let opponentMoves = 0;
let startTime = 0;
let timerInterval = null;

const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s =>
    s.classList.add("hidden")
  );
  $(id).classList.remove("hidden");
}

socket.on("connect", () => {
  $("connection").textContent = "● ONLINE";
  $("connection").style.color = "#00e5a0";
});

socket.on("disconnect", () => {
  $("connection").textContent = "● OFFLINE";
  $("connection").style.color = "#ff7676";
});

function nameValue() {
  return $("playerName").value.trim() || "Player";
}

$("createBtn").onclick = () => {
  playerName = nameValue();
  socket.emit("create-room", playerName);
};

$("joinBtn").onclick = () => {
  playerName = nameValue();
  const code = $("roomInput").value.trim().toUpperCase();

  if (!code) {
    $("homeMessage").textContent = "Enter a room code.";
    return;
  }

  socket.emit("join-room", {
    roomId: code,
    name: playerName
  });
};

socket.on("room-created", data => {
  roomId = data.roomId;
  isHost = true;
  enterLobby(data);
});

socket.on("room-joined", data => {
  roomId = data.roomId;
  isHost = false;
  enterLobby(data);
});

socket.on("room-error", message => {
  $("homeMessage").textContent = message;
});

function enterLobby(data) {
  $("homeMessage").textContent = "";
  $("roomCode").textContent = data.roomId;
  updatePlayers(data.players);
  $("startBtn").disabled = !isHost || data.players.length < 2;
  $("lobbyMessage").textContent =
    data.players.length < 2
      ? "Waiting for another player..."
      : "Both players are ready!";

  showScreen("lobby");
}

function updatePlayers(players) {
  $("player1").textContent = players[0]?.name || "Waiting...";
  $("player2").textContent = players[1]?.name || "Waiting...";
  $("startBtn").disabled = !isHost || players.length < 2;
}

socket.on("player-update", data => {
  updatePlayers(data.players);
});

socket.on("player-left", data => {
  updatePlayers(data.players);
  $("lobbyMessage").textContent = "Player disconnected.";
});

$("leaveBtn").onclick = () => {
  socket.emit("leave-room");
  roomId = "";
  showScreen("home");
};

$("startBtn").onclick = () => {
  if (!isHost) return;
  socket.emit("start-game");
};

socket.on("game-start", data => {
  gameStarted = true;
  moves = 0;
  opponentMoves = 0;

  $("myName").textContent = playerName;
  $("myMoves").textContent = "0 moves";
  $("opponentMoves").textContent = "0 moves";
  $("gameMessage").textContent = "Battle started!";
  $("gameStatus").textContent = "PLAYING";

  initCube();

  if (data.scramble) {
    data.scramble.forEach(move => performMove(move, false));
  }

  startTimer();
  showScreen("game");
});

function startTimer() {
  clearInterval(timerInterval);
  startTime = Date.now();

  timerInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const min = Math.floor(elapsed / 60);
    const sec = Math.floor(elapsed % 60);
    const ms = Math.floor((elapsed % 1) * 100);

    $("timer").textContent =
      String(min).padStart(2, "0") + ":" +
      String(sec).padStart(2, "0") + "." +
      String(ms).padStart(2, "0");
  }, 40);
}

socket.on("opponent-move", data => {
  opponentMoves++;
  $("opponentMoves").textContent = opponentMoves + " moves";
  performMove(data.move, false);
});

const cubeColors = {
  R: 0xff3030,
  L: 0xff8c20,
  U: 0xffffff,
  D: 0xffd500,
  F: 0x00c96b,
  B: 0x2878ff
};

let scene, camera, renderer, cubeGroup;
let cubies = [];
let busy = false;
let animationQueue = [];

function initCube() {
  const container = $("cube3d");
  container.innerHTML = "";

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    40,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );

  camera.position.set(4, 4, 6);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.4));

  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(5, 8, 6);
  scene.add(light);

  cubeGroup = new THREE.Group();
  scene.add(cubeGroup);

  cubies = [];

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;

        const black = 0x171b24;

        const colors = [
          x === 1 ? cubeColors.R : black,
          x === -1 ? cubeColors.L : black,
          y === 1 ? cubeColors.U : black,
          y === -1 ? cubeColors.D : black,
          z === 1 ? cubeColors.F : black,
          z === -1 ? cubeColors.B : black
        ];

        const materials = colors.map(color =>
          new THREE.MeshStandardMaterial({
            color,
            roughness: 0.65
          })
        );

        const geometry = new THREE.BoxGeometry(
          0.96, 0.96, 0.96
        );

        const cubie = new THREE.Mesh(geometry, materials);
        cubie.position.set(x, y, z);

        cubeGroup.add(cubie);
        cubies.push(cubie);
      }
    }
  }

  function render() {
    requestAnimationFrame(render);
    renderer.render(scene, camera);
  }

  render();

  const resizeObserver = new ResizeObserver(() => {
    if (!container.clientWidth || !container.clientHeight) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  resizeObserver.observe(container);
}

const moveAxes = {
  R: ["x", 1, -1],
  L: ["x", -1, 1],
  U: ["y", 1, -1],
  D: ["y", -1, 1],
  F: ["z", 1, -1],
  B: ["z", -1, 1]
};

function performMove(move, send = true) {
  if (!gameStarted && send) return;

  animationQueue.push({ move, send });
  processQueue();
}

function processQueue() {
  if (busy || !animationQueue.length) return;

  busy = true;

  const { move, send } = animationQueue.shift();
  const face = move[0];
  const inverse = move.endsWith("'");
  const [axis, layer, direction] = moveAxes[face];

  const sign = inverse ? -direction : direction;
  const selected = cubies.filter(c =>
    Math.round(c.position[axis]) === layer
  );

  const pivot = new THREE.Group();
  scene.add(pivot);

  selected.forEach(c => pivot.attach(c));

  const start = performance.now();
  const duration = 180;
  const total = sign * Math.PI / 2;

  function animate(now) {
    const t = Math.min((now - start) / duration, 1);
    const smooth = t * t * (3 - 2 * t);

    pivot.rotation[axis] = total * smooth;

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      pivot.rotation[axis] = total;
      pivot.updateMatrixWorld(true);

      selected.forEach(c => {
        cubeGroup.attach(c);

        c.position.set(
          Math.round(c.position.x),
          Math.round(c.position.y),
          Math.round(c.position.z)
        );

        c.quaternion.normalize();
      });

      scene.remove(pivot);

      if (send && gameStarted) {
        moves++;
        $("myMoves").textContent = moves + " moves";

        socket.emit("player-move", {
          move,
          roomId
        });
      }

      busy = false;
      processQueue();
    }
  }

  requestAnimationFrame(animate);
}

document.querySelectorAll("[data-move]").forEach(button => {
  button.onclick = () => {
    if (!gameStarted) return;
    performMove(button.dataset.move, true);
  };
});

$("resetBtn").onclick = () => {
  if (!cubeGroup) return;
  cubeGroup.rotation.set(0, 0, 0);
};

function generateScramble() {
  const faces = ["R", "L", "U", "D", "F", "B"];
  const result = [];
  let previous = "";

  for (let i = 0; i < 20; i++) {
    let face;
    do {
      face = faces[Math.floor(Math.random() * faces.length)];
    } while (face === previous);

    previous = face;

    result.push(
      face + (Math.random() < 0.5 ? "'" : "")
    );
  }

  return result;
}

// Server sends the same scramble to both players.
socket.on("battle-ended", data => {
  finishGame(data);
});

function finishGame(data) {
  gameStarted = false;
  clearInterval(timerInterval);

  const won = data.winnerId === socket.id;

  $("winnerTitle").textContent = won ? "YOU WIN!" : "YOU LOST!";
  $("winnerMessage").textContent =
    (data.winnerName || "Player") + " won the battle!";

  showScreen("result");
}

$("exitGameBtn").onclick = () => {
  socket.emit("leave-room");
  clearInterval(timerInterval);
  gameStarted = false;
  roomId = "";
  showScreen("home");
};

$("homeBtn").onclick = () => {
  socket.emit("leave-room");
  roomId = "";
  showScreen("home");
};

$("rematchBtn").onclick = () => {
  socket.emit("rematch");
  $("winnerMessage").textContent = "Waiting for rematch...";
};

socket.on("rematch-start", data => {
  moves = 0;
  opponentMoves = 0;
  gameStarted = true;

  $("myMoves").textContent = "0 moves";
  $("opponentMoves").textContent = "0 moves";

  initCube();
  data.scramble.forEach(move => performMove(move, false));

  startTimer();
  showScreen("game");
});
