
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Serve CubeBattle website files
app.use(express.static(__dirname));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));

  return code;
}

function getPlayers(room) {
  return room.players.map(p => ({
    id: p.id,
    name: p.name
  }));
}

function scrambleCube() {
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

function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  socket.data.roomId = null;

  if (!room) return;

  room.players = room.players.filter(
    p => p.id !== socket.id
  );

  socket.leave(roomId);

  if (room.players.length === 0) {
    rooms.delete(roomId);
    return;
  }

  room.hostId = room.players[0].id;
  room.started = false;
  room.finished = false;
  room.moves.clear();
  room.rematchVotes.clear();

  io.to(roomId).emit("player-left", {
    players: getPlayers(room)
  });

  io.to(roomId).emit("player-update", {
    players: getPlayers(room)
  });
}

io.on("connection", socket => {

  // CREATE ROOM
  socket.on("create-room", name => {
    if (socket.data.roomId) {
      leaveRoom(socket);
    }

    const roomId = makeCode();

    const room = {
      hostId: socket.id,
      players: [{
        id: socket.id,
        name: String(name || "Player").slice(0, 16)
      }],
      started: false,
      finished: false,
      moves: new Map(),
      rematchVotes: new Set()
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;

    socket.emit("room-created", {
      roomId,
      players: getPlayers(room)
    });
  });

  // JOIN ROOM
  socket.on("join-room", data => {
    if (!data || !data.roomId) return;

    if (socket.data.roomId) {
      leaveRoom(socket);
    }

    const roomId = String(data.roomId).toUpperCase();
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit("room-error", "Room not found.");
      return;
    }

    if (room.players.length >= 2) {
      socket.emit("room-error", "Room is full.");
      return;
    }

    if (room.started) {
      socket.emit("room-error", "Game already started.");
      return;
    }

    room.players.push({
      id: socket.id,
      name: String(data.name || "Player").slice(0, 16)
    });

    socket.join(roomId);
    socket.data.roomId = roomId;

    socket.emit("room-joined", {
      roomId,
      players: getPlayers(room)
    });

    io.to(roomId).emit("player-update", {
      players: getPlayers(room)
    });
  });

  // START GAME
  socket.on("start-game", () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room) return;
    if (socket.id !== room.hostId) return;
    if (room.players.length !== 2) return;
    if (room.started) return;

    const scramble = scrambleCube();

    room.started = true;
    room.finished = false;
    room.moves.clear();
    room.rematchVotes.clear();

    io.to(roomId).emit("game-start", {
      scramble
    });
  });

  // SYNC PLAYER MOVES
  socket.on("player-move", data => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room || !room.started || room.finished) return;
    if (!data || data.roomId !== roomId) return;

    const allowed = /^[RLUDFB]'?$/;

    if (typeof data.move !== "string") return;
    if (!allowed.test(data.move)) return;

    const opponent = room.players.find(
      p => p.id !== socket.id
    );

    if (!opponent) return;

    io.to(opponent.id).emit("opponent-move", {
      move: data.move
    });

    // Winner detection is not implemented yet.
  });

  // REMATCH
  socket.on("rematch", () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room || room.players.length !== 2) return;
    if (!room.finished) return;

    room.rematchVotes.add(socket.id);

    if (room.rematchVotes.size === 2) {
      room.started = true;
      room.finished = false;
      room.moves.clear();
      room.rematchVotes.clear();

      io.to(roomId).emit("rematch-start", {
        scramble: scrambleCube()
      });
    }
  });

  // LEAVE ROOM
  socket.on("leave-room", () => {
    leaveRoom(socket);
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    leaveRoom(socket);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    "CUBE BATTLE running on port " + PORT
  );
});
