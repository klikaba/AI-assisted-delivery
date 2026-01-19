import express from 'express';
import bodyParser from 'body-parser';
import { Logger } from './logger.js';

const app = express();
const port = 3000;

app.use(bodyParser.json());

// A simple in-memory user store
const users = [
  { id: 1, name: "Alice", role: "admin" },
  { id: 2, name: "Bob", role: "user" }
];

app.get('/users', (req, res) => {
  res.json(users);
});

app.get('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  const user = users.find(u => u.id === userId);
  if (!user) {
    Logger.error('User not found', { userId });
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json(user);
});

app.listen(port, () => {
  Logger.info(`Target App running on http://localhost:${port}`);
});
