import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { Chats, Messages, Users } from "./schema.js";
import jwt from "jsonwebtoken";
import cors from "cors";

dotenv.config();

const conn = mongoose.connect(process.env.MONOGO_URL);

const sockets = {};
const clients = {};
const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send(`${req.ip} Hello From API`);
  return;
});

const authenticateSocket = (socket, next) => {
  const authHeader = socket.handshake.auth.token;

  if (authHeader) {
    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.SIGNATURE_TOKEN, (err, user) => {
      socket.user = user;
      next();
    });
  }
};

// online/offline logic
io.use(authenticateSocket).on("connection", async (socket) => {
  await Users.findByIdAndUpdate(socket.user._id, { $set: { online: true } });
  io.emit("online-change", { _id: socket.user._id, online: true });
  sockets[socket.user._id] = socket.id;
  clients[socket.id] = socket;
  socket.on("disconnect", async () => {
    await Users.findByIdAndUpdate(socket.user._id, { $set: { online: false } });
    io.emit("online-change", {
      _id: socket.user._id,
      online: false,
    });
    delete socket[socket.user._id];
    delete clients[socket.id];
  });
  socket.on("read-message-mutate", async ({ message }) => {
    const result = await Messages.findByIdAndUpdate(message._id, {
      $set: { read: true },
    });
    clients[sockets?.[message?.sender]]?.emit("read-message-query", {
      ...message,
      read: true,
    });
  });
});

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.SIGNATURE_TOKEN, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }

      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

app.put("/chat", authenticateJWT, async (req, res) => {
  try {
    const chat = new Chats({
      owner: req.body.owner,
      with: req.body.with,
    });
    const result = await chat.save();
    res.json(result);
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message ? err.message : "Something went wrong!" });
  }
});
app.put("/chat/message", authenticateJWT, async (req, res) => {
  try {
    const message = new Messages({
      date: new Date(),
      message: req.body.message,
      sender: req.user._id,
      receiver: req.body.to,
      read: false,
    });
    const result = await message.save();
    // send message logic
    clients[sockets?.[result.receiver]]?.emit("chat-message", result);
    clients[sockets?.[result.sender]]?.emit("chat-message", result);
    res.json(result);
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message ? err.message : "Something went wrong!" });
  }
});
app.post("/chat/get_chats", authenticateJWT, async (req, res) => {
  try {
    const chats = await Chats.find({
      $where: {
        _id: req.user._id,
      },
    });
    res.json(chats);
  } catch (err) {
    console.log({ err });
  }
});

app.post("/chat/get_messages/:id", authenticateJWT, async (req, res) => {
  const result = await Messages.find({
    $or: [
      {
        receiver: req.user._id,
        sender: req.params.id,
      },
      {
        sender: req.user._id,
        receiver: req.params.id,
      },
    ],
  });
  await Messages.updateMany(
    { $or: [{ receiver: req.user._id }] },
    {
      $set: {
        read: true,
      },
    }
  );
  res.json(result);
});

app.post("/user/get_users", authenticateJWT, async (req, res) => {
  const result = await Users.find({ _id: { $ne: req.user._id } });
  const usersData = result.map((user) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    online: user.online,
  }));
  res.json({ users: usersData });
});

app.put("/user", async (req, res) => {
  try {
    if (!req.body.name || !req.body.email || !req.body.password) {
      throw new Error("Invalid Data");
    }
    const result = new Users({ ...req.body });
    await result.save();
    const token = jwt.sign(
      { _id: result._id, name: result.name, email: result.email },
      process.env.SIGNATURE_TOKEN
    );
    res.json({ token });
  } catch (err) {
    if (err?.code === 11000) {
      res.status(500).json({ error: "User already exists." });
      return;
    }
    res
      .status(500)
      .json({ error: err.message ? err.message : "Something went wrong!" });
  }
});

app.post("/user", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new Error("Invalid email or password");
    }
    const result = await Users.findOne({ email, password });
    if (!result) {
      throw new Error("Invalid email or password");
    }
    const token = jwt.sign(
      { _id: result._id, name: result.name, email: result.email },
      process.env.SIGNATURE_TOKEN
    );
    res.json({ token });
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message ? err.message : "Something went wrong!" });
  }
});
app.post("/user/get/:id", authenticateJWT, async (req, res) => {
  try {
    const query = Users.where({ _id: req.params.id });
    const user = await query.findOne();
    res.json({
      name: user.name,
      email: user.email,
      _id: user.id,
      online: user.online,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message ? err.message : "Something went wrong!" });
  }
});

httpServer.listen(3001, () => {
  console.log(`Server running on http://localhost:3001`);
});
